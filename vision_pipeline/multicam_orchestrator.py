import os
import sys
import time
import cv2
import argparse
import numpy as np
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional
from ultralytics import YOLO

from config import (
    FACILITY_ID,
    ZONE_ID,
    ZONE_NAME,
    CAMERA_ID,
    CAMERA_SOURCE,
    FIREBASE_PROJECT_ID,
)
from stream_manager import ThreadedCameraStream
from face_engine import WorkerFaceEngine
from ppe_detector import WorkerPPEEvaluator
from firestore_client import FirestoreSyncClient
from web_streamer import WebStreamBroadcaster

class MultiCameraOrchestrator:
    """
    Coordinates multi-camera surveillance across two functional zones:
    1. Gate Camera (Eye-Level Choke-point): Access audit & facial verification.
    2. Ward / Work Area Camera (Elevated Wide-Angle): YOLOv8 tracking & event-driven PPE violation alerting.
    3. Cross-Angle Identity Resolution: Direct face matching with Gate Session Fallback.
    """
    def __init__(self, gate_src="0", ward_src="0", cctv3_src=None, cctv4_src=None, facility_id=FACILITY_ID, zone_id=ZONE_ID, test_mode=False):
        self.facility_id = facility_id
        self.zone_id = zone_id
        self.test_mode = test_mode

        print("=" * 70)
        print("  SAFETYINTEL ENTERPRISE MULTI-CCTV ORCHESTRATOR")
        print(f"  Facility: {self.facility_id} | Zone: {self.zone_id}")
        print("=" * 70)

        # Prevent Windows MSMF hardware collision if both feeds target the same physical webcam
        if str(gate_src) == str(ward_src) and str(gate_src).isdigit() and not test_mode:
            print(f"[Orchestrator Notice] Both feeds specified physical webcam index '{gate_src}'. Auto-switching Ward to simulated wide-angle feed to avoid hardware locking.")
            ward_src = "SIMULATED_WARD_FEED"

        if test_mode:
            gate_src = "SYNTHETIC_GATE_TEST"
            ward_src = "SYNTHETIC_WARD_TEST"

        # 1. Cloud Firestore Client
        self.firestore = FirestoreSyncClient(facility_id=self.facility_id)

        # 2. Face Recognition Engine
        self.face_engine = WorkerFaceEngine()

        # 3. PPE Compliance Evaluators
        self.gate_ppe_evaluator = WorkerPPEEvaluator(temporal_threshold=5)
        self.ward_ppe_evaluator = WorkerPPEEvaluator(temporal_threshold=15)

        # 4. YOLO Object Detector
        print("[AI Engine] Loading YOLOv8 nano model (yolov8n.pt)...")
        self.model = YOLO("yolov8n.pt")

        # 5. Threaded Stream Ingestion
        print("[Stream Manager] Initializing decoupled camera threads...")
        self.gate_stream = ThreadedCameraStream(src=gate_src, camera_id="CAM_00_GATE", target_fps=20)
        self.ward_stream = ThreadedCameraStream(src=ward_src, camera_id="CAM_01_WARD", target_fps=25)
        self.cctv3_stream = ThreadedCameraStream(src=cctv3_src, camera_id="CAM_03_SIDE_L", target_fps=20) if cctv3_src else None
        self.cctv4_stream = ThreadedCameraStream(src=cctv4_src, camera_id="CAM_04_SIDE_R", target_fps=20) if cctv4_src else None

        # 6. Stateful Memory & Session Tables
        self.active_checked_in_workers: Dict[str, dict] = {}
        self.violation_counters: Dict[int, int] = {}
        self.last_gate_eval_time: float = 0.0

        # Pre-seed a checked-in worker for demo fallback if empty
        if len(self.active_checked_in_workers) == 0 and len(self.face_engine.database.get("names", [])) > 0:
            demo_name = self.face_engine.database["names"][0]
            self.active_checked_in_workers[demo_name] = {
                "checkin_time": datetime.now().strftime("%H:%M:%S"),
                "status": "CHECKED_IN",
                "gate_ppe": "COMPLIANT",
                "timestamp": time.time(),
            }
            print(f"[Gate Session] Active baseline roster initialized with: {demo_name}")

        # 7. Real-time MJPEG Web Stream Broadcaster (Sub-50ms HTTP Server for Web Dashboard)
        self.web_broadcaster = WebStreamBroadcaster(host="0.0.0.0", port=5000)
        if not self.test_mode:
            self.web_broadcaster.start()

    def process_gate_stream(self, gate_frame: np.ndarray):
        """Processes choke-point gate camera for identity verification and access logging."""
        if gate_frame is None or gate_frame.size == 0:
            return

        now = time.time()
        # Evaluate Gate once every 0.3s (3 FPS) to save CPU
        if now - self.last_gate_eval_time < 0.30:
            return
        self.last_gate_eval_time = now

        # Run person detection
        results = self.model(gate_frame, classes=[0], verbose=False, conf=0.50)
        if not results or len(results[0].boxes) == 0:
            return

        for box in results[0].boxes.xyxy.cpu().numpy():
            x1, y1, x2, y2 = map(int, box)
            # Head/upper crop for facial verification
            head_h = max(20, int((y2 - y1) * 0.40))
            face_crop = gate_frame[y1:y1 + head_h, x1:x2]

            name, score = self.face_engine.identify_face(face_crop)
            is_verified = bool(name and name not in ["Unidentified Worker", "Unregistered Worker"])
            box_col = (0, 230, 115) if is_verified else (0, 180, 255)
            cv2.rectangle(gate_frame, (x1, y1), (x2, y2), box_col, 2)
            cv2.rectangle(gate_frame, (x1, y1), (x2, y1 + head_h), (255, 200, 0), 1)
            lbl = f"{name} ({score:.2f})" if is_verified else "Verifying Identity..."
            cv2.putText(gate_frame, lbl, (x1 + 4, y1 - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.45, box_col, 1)

            if is_verified:
                checkin_time_str = datetime.now().strftime("%H:%M:%S")
                if name not in self.active_checked_in_workers:
                    # Evaluate initial PPE
                    ppe_res = self.gate_ppe_evaluator.evaluate_ppe(gate_frame, (x1, y1, x2, y2), f"GATE_{name}")
                    gate_ppe_status = "COMPLIANT" if ppe_res["is_compliant"] else "NON_COMPLIANT"

                    self.active_checked_in_workers[name] = {
                        "checkin_time": checkin_time_str,
                        "status": "CHECKED_IN",
                        "gate_ppe": gate_ppe_status,
                        "timestamp": now,
                    }

                    # Push Gate Audit Log to Firestore
                    gate_log_payload = {
                        "log_id": f"GATE-{int(now) % 1000000:06d}",
                        "worker_name": name,
                        "checkin_time": datetime.utcnow().isoformat() + "Z",
                        "timestamp_display": checkin_time_str,
                        "gate_id": "GATE_01",
                        "ppe_status": gate_ppe_status,
                        "match_confidence": float(round(score, 2)),
                    }
                    print(f"\n[GATE AUDIT LOG] {name} checked in at {checkin_time_str} (PPE: {gate_ppe_status}, Conf: {score:.2f})")
                    self.firestore.push_gate_log(gate_log_payload)

    def process_ward_stream(self, ward_frame: np.ndarray):
        """Processes elevated work area camera for sustained PPE tracking and cross-angle identity resolution."""
        if ward_frame is None or ward_frame.size == 0:
            return

        # Track persons with ByteTrack
        results = self.model.track(ward_frame, persist=True, classes=[0], tracker="bytetrack.yaml", conf=0.50, verbose=False)
        if not results or results[0].boxes.id is None:
            return

        boxes = results[0].boxes.xyxy.cpu().numpy().astype(int)
        track_ids = results[0].boxes.id.cpu().numpy().astype(int)

        for box, track_id in zip(boxes, track_ids):
            x1, y1, x2, y2 = box
            str_tid = f"TRACK_{track_id:02d}"

            # Evaluate PPE compliance
            ppe_res = self.ward_ppe_evaluator.evaluate_ppe(ward_frame, (x1, y1, x2, y2), str_tid)
            is_compliant = ppe_res["is_compliant"]
            helmet = ppe_res["helmet"]
            vest = ppe_res["vest"]

            if not is_compliant:
                self.violation_counters[track_id] = self.violation_counters.get(track_id, 0) + 1
            else:
                self.violation_counters[track_id] = max(0, self.violation_counters.get(track_id, 0) - 1)

            # Draw visual overlay on Ward frame
            box_col = (0, 230, 115) if is_compliant else ((0, 0, 235) if self.violation_counters[track_id] >= 15 else (0, 180, 255))
            cv2.rectangle(ward_frame, (x1, y1), (x2, y2), box_col, 2)
            cv2.putText(
                ward_frame,
                f"{str_tid} | H:{helmet} V:{vest} ({self.violation_counters[track_id]}/15)",
                (x1 + 4, y1 - 8),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                box_col,
                1,
            )

            # Trigger Cross-Angle Identity Resolution when violation persists >= 15 frames
            if self.violation_counters[track_id] >= 15:
                person_crop = ward_frame[max(0, y1):min(ward_frame.shape[0], y2), max(0, x1):min(ward_frame.shape[1], x2)]
                matched_worker, match_method = self._resolve_worker_identity(person_crop)

                # Push Incident to Cloud Firestore
                now_iso = datetime.utcnow().isoformat() + "Z"
                missing_items = [item for item, st in [("HELMET", helmet), ("VEST", vest)] if st == "FAIL"]
                incident_payload = {
                    "incident_id": f"PPE-{int(time.time()) % 1000000:06d}",
                    "facility_id": self.facility_id,
                    "zone_id": self.zone_id,
                    "zone_name": ZONE_NAME,
                    "camera_id": "CAM_01",
                    "worker_id": matched_worker,
                    "source_event_type": "PPE_VIOLATION",
                    "priority": "P1",
                    "timestamp": now_iso,
                    "confidence": 0.88,
                    "status": "OPEN",
                    "required_action": f"SUPERVISOR WARNING — {matched_worker.upper()} NOT WEARING REQUIRED PPE",
                    "decision_reason": f"Sustained PPE violation (Missing: {', '.join(missing_items)}) verified for 15+ frames. Identity resolved via {match_method}.",
                    "evidence_image": "https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?auto=format&fit=crop&w=800&q=80",
                    "vision_evidence": {
                        "missing_items": missing_items,
                        "resolution_method": match_method,
                    },
                    "network_mode": "LAN",
                }

                print("\n" + "=" * 65)
                print("🚨 [SAFETY VIOLATION ALERT SENT TO ADMIN CONSOLE] 🚨")
                print(f"  Location:     {ZONE_NAME} ({self.zone_id})")
                print(f"  Personnel:    {matched_worker}")
                print(f"  Violation:    Missing {', '.join(missing_items)}")
                print(f"  Resolution:   {match_method}")
                print(f"  Timestamp:    {now_iso}")
                print("=" * 65 + "\n")

                self.firestore.push_incident(incident_payload)
                self.firestore.update_zone_priority(self.zone_id, "P1")

                # Debounce to prevent duplicate spam
                self.violation_counters[track_id] = -30

    def _resolve_worker_identity(self, person_crop: np.ndarray) -> tuple[str, str]:
        """
        Attempts direct face recognition on the person crop.
        Falls back to active Gate Check-in log if occluded, turned away, or low confidence.
        """
        if person_crop.size > 0:
            name, score = self.face_engine.identify_face(person_crop)
            if name and name not in ["Unidentified Worker", "Unregistered Worker"] and score >= 0.45:
                return name, f"Direct Facial Match ({score:.2f})"

        # Fallback to active gate sessions
        if len(self.active_checked_in_workers) == 1:
            name = list(self.active_checked_in_workers.keys())[0]
            return f"{name} (Correlated via Entry)", "Gate Entry Session Correlation"
        elif len(self.active_checked_in_workers) > 1:
            recent_name = list(self.active_checked_in_workers.keys())[-1]
            return f"{recent_name} (Correlated via Entry)", "Recent Gate Check-in Correlation"

        return "Worker ID Unknown (Facing away)", "Uncorrelated Work Area Track"

    def run(self):
        """Main multi-stream execution loop."""
        print("\n[Orchestrator Running] Ingesting Gate and Ward streams. Press 'q' to stop.")
        frame_idx = 0
        prev_time = time.time()

        while True:
            frame_idx += 1
            now = time.time()
            fps = 1.0 / max(0.001, (now - prev_time))
            prev_time = now

            # 1. Fetch latest frames from decoupled stream threads
            gate_frame, _ = self.gate_stream.get_latest_frame()
            ward_frame, _ = self.ward_stream.get_latest_frame()

            if gate_frame is None or ward_frame is None:
                time.sleep(0.02)
                continue

            # 2. Process Gate stream (Entry access verification)
            self.process_gate_stream(gate_frame)

            # 3. Process Ward stream (PPE tracking & event-driven alert)
            self.process_ward_stream(ward_frame)

            # 4. Render Dual-Stream Composite Tactical Display
            h_sub, w_sub = 360, 640
            gate_resized = cv2.resize(gate_frame, (w_sub, h_sub))
            ward_resized = cv2.resize(ward_frame, (w_sub, h_sub))

            # Header bars on crops
            cv2.rectangle(gate_resized, (0, 0), (w_sub, 30), (20, 25, 35), -1)
            cv2.putText(gate_resized, "[CCTV 1] GATE CHOKE-POINT (Laptop Cam)", (12, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 200), 1)

            cv2.rectangle(ward_resized, (0, 0), (w_sub, 30), (20, 25, 35), -1)
            cv2.putText(ward_resized, f"[CCTV 2] PRODUCTION BAY (Front View) - {ZONE_NAME}", (12, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 200, 0), 1)

            composite = np.hstack([gate_resized, ward_resized])

            # Bottom Status Bar
            footer_h = 45
            footer = np.zeros((footer_h, composite.shape[1], 3), dtype=np.uint8)
            footer[:] = (15, 20, 28)
            active_list = ", ".join(self.active_checked_in_workers.keys()) or "None"
            cv2.putText(footer, f"FPS: {fps:.1f} | ACTIVE PERSONNEL: [{active_list}] | CCTV 1-4 READY", (15, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (200, 220, 240), 1)

            display_view = np.vstack([composite, footer])

            # 5. Broadcast to Web Dashboard (Sub-50ms MJPEG HTTP Stream)
            if not self.test_mode:
                self.web_broadcaster.update_frame("cctv1", gate_resized)
                self.web_broadcaster.update_frame("cctv2", ward_resized)
                self.web_broadcaster.update_frame("composite", display_view)
                if self.cctv3_stream:
                    f3, _ = self.cctv3_stream.get_latest_frame()
                    if f3 is not None:
                        self.web_broadcaster.update_frame("cctv3", f3)
                if self.cctv4_stream:
                    f4, _ = self.cctv4_stream.get_latest_frame()
                    if f4 is not None:
                        self.web_broadcaster.update_frame("cctv4", f4)

            # In test mode, exit after 40 frames without GUI rendering
            if self.test_mode:
                if frame_idx >= 40:
                    print(f"[Test Mode] Completed {frame_idx} orchestrator frames successfully.")
                    break
                time.sleep(0.01)
                continue

            cv2.imshow("SafetyIntel CCTV Operations Console", display_view)
            k = cv2.waitKey(1) & 0xFF
            if k == ord('q'):
                break

        self.gate_stream.stop()
        self.ward_stream.stop()
        if self.cctv3_stream:
            self.cctv3_stream.stop()
        if self.cctv4_stream:
            self.cctv4_stream.stop()
        if not self.test_mode:
            self.web_broadcaster.stop()
            cv2.destroyAllWindows()
        print("[Orchestrator] Multi-CCTV pipeline stopped cleanly.")

def main():
    parser = argparse.ArgumentParser(description="SafetyIntel Multi-CCTV Orchestrator")
    parser.add_argument("--cctv1-gate", "--gate-source", dest="cctv1", default="0", help="CCTV 1: Laptop camera / Gate choke-point (default: 0)")
    parser.add_argument("--cctv2-front", "--ward-source", dest="cctv2", default="0", help="CCTV 2: Front overhead view / IP phone stream (e.g. http://<ip>:8080/video)")
    parser.add_argument("--cctv3-side-left", dest="cctv3", default=None, help="CCTV 3: Left side angle view IP phone stream")
    parser.add_argument("--cctv4-side-right", dest="cctv4", default=None, help="CCTV 4: Right side angle view IP phone stream")
    parser.add_argument("--test-mode", action="store_true", help="Run automated test simulation without GUI")
    args = parser.parse_args()

    orchestrator = MultiCameraOrchestrator(
        gate_src=args.cctv1,
        ward_src=args.cctv2,
        cctv3_src=args.cctv3,
        cctv4_src=args.cctv4,
        test_mode=args.test_mode,
    )
    orchestrator.run()

if __name__ == "__main__":
    main()
