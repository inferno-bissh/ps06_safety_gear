"""Multimodal Industrial Safety Multi-Camera Orchestrator."""
import os
import sys
import time
import cv2
import argparse
import numpy as np
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional
from ultralytics import YOLO

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from config import (
    FACILITY_ID,
    ZONE_ID,
    ZONE_NAME,
    CAMERA_ID,
    CAMERA_SOURCE,
    FIREBASE_PROJECT_ID,
    PERSON_CONF_THRESHOLD,
)
from stream_manager import ThreadedCameraStream, generate_synthetic_industrial_frame
from face_engine import WorkerFaceEngine
from ppe_detector import WorkerPPEEvaluator
from firestore_client import FirestoreSyncClient
from web_streamer import WebStreamBroadcaster, get_hazard_state, set_hazard_state

def normalize_camera_source(src, default="0"):
    if src is None:
        return default
    s = str(src).strip().strip('"').strip("'")
    if not s:
        return default
    if s.isdigit():
        return int(s)
    # Never accept recursive localhost:5000 broadcast feeds as camera inputs
    if ":5000" in s:
        return default
    if s.startswith("http://") or s.startswith("https://") or s.startswith("rtsp://"):
        # Auto-append /video if phone IP Webcam on port 8080 or 4747 lacks endpoint
        if (":8080" in s or ":4747" in s) and not any(ep in s for ep in ["/video", "/videofeed", "/mjpeg", "/feed"]):
            s = s.rstrip("/") + "/video"
        return s
    return s

class MultiCameraOrchestrator:
    """
    Coordinates multi-camera surveillance across two functional zones:
    1. Gate Camera (Eye-Level Choke-point): Access audit & facial verification.
    2. Ward / Work Area Camera (Elevated Wide-Angle): YOLOv8 tracking & event-driven PPE violation alerting.
    3. Cross-Angle Identity Resolution: Direct face matching with Gate Session Fallback.
    """
    def __init__(self, gate_src="0", ward_src="0", cctv3_src=None, cctv4_src=None, facility_id=FACILITY_ID, zone_id=ZONE_ID, test_mode=False, no_gui=False, demo_ppe_pass=False):
        self.facility_id = facility_id
        self.zone_id = zone_id
        self.test_mode = test_mode
        self.no_gui = no_gui
        self.demo_ppe_pass = demo_ppe_pass

        gate_src = normalize_camera_source(gate_src, "0")
        ward_src = normalize_camera_source(ward_src, "http://192.168.1.5:8080/video")
        if cctv3_src:
            cctv3_src = normalize_camera_source(cctv3_src, None)
        if cctv4_src:
            cctv4_src = normalize_camera_source(cctv4_src, None)

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
        if self.demo_ppe_pass:
            self.gate_ppe_evaluator.sim_force_helmet = True
            self.gate_ppe_evaluator.sim_force_vest = True
            self.ward_ppe_evaluator.sim_force_helmet = True
            self.ward_ppe_evaluator.sim_force_vest = True
            print("[PPE Engine] Demo override active: Forcing all detected personnel to PASS PPE.")

        # 4. YOLO Object Detectors (Independent instances for Gate & Ward to maintain isolated ByteTrack trajectories)
        print("[AI Engine] Loading YOLOv8 nano models for Gate & Ward...")
        self.gate_model = YOLO("yolov8n.pt")
        self.ward_model = YOLO("yolov8n.pt")

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
        self.cached_gate_workers = []
        self.cached_gate_drawings = []
        self.last_smoke_incident_time: float = 0.0
        self.last_fire_incident_time: float = 0.0
        self.smoke_active_prev: bool = False
        self.fire_active_prev: bool = False

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

    def _redraw_gate_overlays(self, frame: np.ndarray, drawings: list):
        """Re-draws cached worker detection overlays onto the gate frame to ensure flicker-free rendering."""
        for d in drawings:
            x1, y1, x2, y2 = d["box"]
            box_col = d["box_col"]
            cv2.rectangle(frame, (x1, y1), (x2, y2), box_col, 2)
            cv2.rectangle(frame, (x1, y1), (x2, d["head_y2"]), (255, 200, 0), 1)
            cv2.putText(frame, d["lbl"], (x1 + 4, max(15, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, box_col, 1)
            cv2.putText(frame, d["ppe_lbl"], (x1 + 4, y1 + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1)
            cx1, cy1, cx2, cy2 = d["crown_roi"]
            if cx2 > cx1 and cy2 > cy1:
                is_helmet_pass = (d["helmet"] == "PASS")
                roi_col = (0, 255, 120) if is_helmet_pass else (0, 70, 255)
                cv2.rectangle(frame, (cx1, cy1), (cx2, cy2), roi_col, 2)
                h_txt = "Helmet Detected" if is_helmet_pass else "Helmet Not Detected"
                (tw, th), _ = cv2.getTextSize(h_txt, cv2.FONT_HERSHEY_SIMPLEX, 0.42, 1)
                ty1 = max(18, cy1 - 4)
                cv2.rectangle(frame, (cx1, ty1 - th - 4), (cx1 + tw + 6, ty1), (15, 20, 28), -1)
                cv2.putText(frame, h_txt, (cx1 + 3, ty1 - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.42, roi_col, 1)

    def process_gate_stream(self, gate_frame: np.ndarray) -> list:
        """Processes choke-point gate camera for identity verification, PPE evaluation, and access logging."""
        if gate_frame is None or gate_frame.size == 0:
            return []

        now = time.time()
        # Throttled evaluation interval (~0.12s, 8 FPS) to save CPU while maintaining persistence
        # Between evaluations, smoothly redraw cached detections on the current frame
        if (now - self.last_gate_eval_time < 0.12) and len(self.cached_gate_drawings) > 0:
            self._redraw_gate_overlays(gate_frame, self.cached_gate_drawings)
            return self.cached_gate_workers

        self.last_gate_eval_time = now
        gh, gw = gate_frame.shape[:2]

        # 1. Person Tracking with ByteTrack (persistent tracking across frames prevents ID swapping when switching sides)
        # Using conf=0.38 eliminates low-confidence inanimate object noise (such as hanging bags or coats)
        results = self.gate_model.track(
            gate_frame,
            persist=True,
            classes=[0],
            tracker="bytetrack.yaml",
            conf=PERSON_CONF_THRESHOLD,
            verbose=False,
        )
        boxes = []
        track_ids = []
        confidences = []
        if results and len(results[0].boxes) > 0:
            raw_b = results[0].boxes.xyxy.cpu().numpy().astype(int).tolist()
            raw_c = results[0].boxes.conf.cpu().numpy().tolist()
            if results[0].boxes.id is not None:
                raw_t = results[0].boxes.id.cpu().numpy().astype(int).tolist()
            else:
                raw_t = [i + 1 for i in range(len(raw_b))]

            # Non-Maximum Suppression and minimum dimension filtering
            for b, t, c in zip(raw_b, raw_t, raw_c):
                bx1, by1, bx2, by2 = b
                bw = bx2 - bx1
                bh = by2 - by1
                # Discard tiny artifacts under desks, electrical sockets, or edge noise
                if bw < 50 or bh < 80:
                    continue

                b_area = max(1, bw * bh)
                overlap = False
                for cb in boxes:
                    cx1, cy1, cx2, cy2 = cb
                    ix1, iy1 = max(bx1, cx1), max(by1, cy1)
                    ix2, iy2 = min(bx2, cx2), min(by2, cy2)
                    if ix2 > ix1 and iy2 > iy1:
                        inter = (ix2 - ix1) * (iy2 - iy1)
                        if inter / b_area > 0.45:
                            overlap = True
                            break
                if not overlap:
                    boxes.append(b)
                    track_ids.append(t)
                    confidences.append(c)

        # 2. Face Detection & Anchor Box Refinement
        faces = None
        if self.face_engine.use_native_sface and self.face_engine.detector:
            self.face_engine.detector.setInputSize((gw, gh))
            _, faces = self.face_engine.detector.detect(gate_frame)

        # Extrapolate untracked faces if sitting very close (require genuine face size)
        if faces is not None:
            for f in faces:
                fx, fy, fw, fh = map(int, f[:4])
                if fw < 35 or fh < 35:
                    continue
                is_covered = any(
                    bx1 <= (fx + fw // 2) <= bx2 and by1 <= (fy + fh // 2) <= by2
                    for bx1, by1, bx2, by2 in boxes
                )
                if not is_covered:
                    wx1 = max(0, fx - int(fw * 0.75))
                    wy1 = max(0, fy - int(fh * 0.85))
                    wx2 = min(gw, fx + fw + int(fw * 0.75))
                    wy2 = min(gh, fy + fh + int(fh * 2.8))
                    new_id = (max(track_ids) + 1) if track_ids else 1
                    boxes.append([wx1, wy1, wx2, wy2])
                    track_ids.append(new_id)
                    confidences.append(0.85)

        # 3. Dedicated Neural YOLO PPE Detection
        ppe_items = self.gate_ppe_evaluator.detect_frame_ppe(gate_frame)

        # 4. Helmet-Anchored Worker Candidate Fallback:
        # If user is sitting close to webcam wearing a safety helmet (where COCO person model
        # or YuNet face detector may be occluded by helmet brim or webcam cropping),
        # synthesize a worker candidate box around the detected helmet!
        if ppe_items:
            for item in ppe_items:
                if item["label"].lower() == "helmet":
                    hx1, hy1, hx2, hy2 = item["box"]
                    is_covered = any(
                        bx1 <= ((hx1 + hx2) // 2) <= bx2 and by1 <= ((hy1 + hy2) // 2) <= by2
                        for bx1, by1, bx2, by2 in boxes
                    )
                    if not is_covered:
                        hw = hx2 - hx1
                        hh = hy2 - hy1
                        wx1 = max(0, hx1 - int(hw * 0.35))
                        wy1 = max(0, hy1 - 10)
                        wx2 = min(gw, hx2 + int(hw * 0.35))
                        wy2 = min(gh, hy2 + int(hh * 3.5))
                        new_id = (max(track_ids) + 1) if track_ids else 1
                        boxes.append([wx1, wy1, wx2, wy2])
                        track_ids.append(new_id)
                        confidences.append(float(round(item["conf"], 2)))

        if not boxes:
            self.cached_gate_workers = []
            self.cached_gate_drawings = []
            return []

        gate_workers = []
        gate_drawings = []

        for box, tid, conf in zip(boxes, track_ids, confidences):
            x1, y1, x2, y2 = map(int, box)

            # Match face to box to tighten coordinates and identify worker
            matched_face = None
            matched_face_raw = None
            if faces is not None:
                for f in faces:
                    fx, fy, fw, fh = map(int, f[:4])
                    if x1 - 40 <= (fx + fw // 2) <= x2 + 40 and y1 - 40 <= (fy + fh // 2) <= y2 + 40:
                        matched_face = (fx, fy, fw, fh)
                        matched_face_raw = f
                        break

            if matched_face:
                fx, fy, fw, fh = matched_face
                # Ensure appropriate headroom for safety helmets (helmet dome sits 0.70 to 0.85 * fh above brow fy)
                helmet_top = max(0, fy - int(fh * 0.85))
                y1 = min(y1, helmet_top)
                # Prevent drifting excessively far above head into ceiling/wall:
                y1 = max(y1, max(0, fy - int(fh * 1.10)))
                # Horizontal bounds around worker
                x1 = max(0, min(x1, fx - int(fw * 0.75)))
                x2 = min(gw, max(x2, fx + fw + int(fw * 0.75)))
                head_h = max(35, (fy + fh) - y1)
                face_crop = gate_frame[max(0, fy - 10):min(gh, fy + fh + 10), max(0, fx - 10):min(gw, fx + fw + 10)]
            else:
                head_h = max(20, int((y2 - y1) * 0.35))
                face_crop = gate_frame[y1:y1 + head_h, x1:x2]

            name, score = self.face_engine.identify_face(
                face_crop, matched_face_raw=matched_face_raw, full_frame=gate_frame
            )
            is_verified = bool(name and name not in ["Unidentified Worker", "Unregistered Worker"])
            worker_id = name if is_verified else f"GATE_WORKER_{tid:02d}"

            # Evaluate PPE for every candidate box on Gate Camera with neural + HSV fusion!
            ppe_res = self.gate_ppe_evaluator.evaluate_ppe(
                gate_frame, (x1, y1, x2, y2), f"GATE_{worker_id}", frame_ppe_items=ppe_items, face_bbox=matched_face
            )

            # Inanimate Object Rejection:
            # Eliminates hanging black backpacks on coat hooks, dark coats, chairs, curtains, etc.
            # A genuine human worker in the gate choke-point MUST exhibit at least one confirmation:
            # 1. Matched human face from YuNet detector
            # 2. Verified safety gear (Helmet PASS or Vest PASS)
            # 3. Measurable human skin tone in head/neck or body region (>= 4.5% skin)
            # 4. High-confidence person detection (conf >= 0.52)
            if matched_face is None and ppe_res["helmet"] != "PASS" and ppe_res["vest"] != "PASS" and conf < 0.52:
                # Check skin in head/neck region
                check_h = max(25, int(head_h * 1.25))
                head_check_crop = gate_frame[y1:min(gh, y1 + check_h), x1:x2]
                if head_check_crop.size > 0:
                    ch_ycrcb = cv2.cvtColor(head_check_crop, cv2.COLOR_BGR2YCrCb)
                    ch_hsv = cv2.cvtColor(head_check_crop, cv2.COLOR_BGR2HSV)
                    m_ycrcb = cv2.inRange(ch_ycrcb, np.array([0, 133, 77]), np.array([255, 173, 127]))
                    m_hsv = cv2.inRange(ch_hsv, np.array([0, 25, 45]), np.array([28, 220, 255]))
                    skin_ratio = cv2.countNonZero(cv2.bitwise_and(m_ycrcb, m_hsv)) / max(1, head_check_crop.shape[0] * head_check_crop.shape[1])
                else:
                    skin_ratio = 0.0

                # Check skin across the entire candidate box (arms/hands/legs)
                full_body_crop = gate_frame[y1:y2, x1:x2]
                if full_body_crop.size > 0:
                    fb_ycrcb = cv2.cvtColor(full_body_crop, cv2.COLOR_BGR2YCrCb)
                    fb_hsv = cv2.cvtColor(full_body_crop, cv2.COLOR_BGR2HSV)
                    fb_m1 = cv2.inRange(fb_ycrcb, np.array([0, 133, 77]), np.array([255, 173, 127]))
                    fb_m2 = cv2.inRange(fb_hsv, np.array([0, 25, 45]), np.array([28, 220, 255]))
                    body_skin_ratio = cv2.countNonZero(cv2.bitwise_and(fb_m1, fb_m2)) / max(1, full_body_crop.shape[0] * full_body_crop.shape[1])
                else:
                    body_skin_ratio = 0.0

                # If no face, no helmet, no vest, and no human skin:
                # This is an inanimate object (e.g. hanging backpack, jacket on hook, chair) -> completely drop!
                if skin_ratio < 0.045 and body_skin_ratio < 0.035:
                    continue

            is_compliant = ppe_res["is_compliant"]
            helmet = ppe_res["helmet"]
            vest = ppe_res["vest"]
            gloves = ppe_res.get("gloves", "UNKNOWN")
            shoes = ppe_res.get("safety_shoes", "UNKNOWN")
            h_col = ppe_res.get("helmet_color", "NONE")
            v_col = ppe_res.get("vest_color", "NONE")
            h_src = ppe_res.get("helmet_source", "NONE")
            v_src = ppe_res.get("vest_source", "NONE")

            box_col = (0, 230, 115) if is_compliant else (0, 140, 255)
            lbl = f"{name} ({score:.2f})" if is_verified else f"Worker [GATE_WORKER_{tid:02d}]"
            ppe_lbl = f"H:{helmet} | V:{vest} | G:{gloves} | S:{shoes}"
            cx1, cy1, cx2, cy2 = ppe_res.get("crown_roi", (0, 0, 0, 0))

            drawing_data = {
                "box": (x1, y1, x2, y2),
                "head_y2": y1 + head_h,
                "box_col": box_col,
                "lbl": lbl,
                "ppe_lbl": ppe_lbl,
                "crown_roi": (cx1, cy1, cx2, cy2),
                "is_compliant": is_compliant,
                "helmet": helmet,
            }
            gate_drawings.append(drawing_data)

            # Append to telemetry
            gate_workers.append({
                "worker_track_id": worker_id,
                "camera_id": "CCTV_01",
                "zone_id": "GATE_ZONE",
                "confidence": float(round(float(score if is_verified else conf), 2)),
                "ppe": {
                    "helmet": helmet,
                    "vest": vest,
                    "gloves": gloves,
                    "safety_shoes": shoes,
                },
                "bbox": {
                    "x": float(round((x1 / gw) * 100, 1)),
                    "y": float(round((y1 / gh) * 100, 1)),
                    "width": float(round(((x2 - x1) / gw) * 100, 1)),
                    "height": float(round(((y2 - y1) / gh) * 100, 1)),
                    "label": lbl,
                    "color": "#10b981" if is_compliant else "#f59e0b",
                },
            })

            if is_verified:
                checkin_time_str = datetime.now().strftime("%H:%M:%S")
                if name not in self.active_checked_in_workers:
                    gate_ppe_status = "COMPLIANT" if is_compliant else "NON_COMPLIANT"
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
                        "checkin_time": datetime.now(timezone.utc).isoformat(),
                        "timestamp_display": checkin_time_str,
                        "gate_id": "GATE_01",
                        "ppe_status": gate_ppe_status,
                        "match_confidence": float(round(score, 2)),
                    }
                    print(f"\n[GATE AUDIT LOG] {name} checked in at {checkin_time_str} (PPE: {gate_ppe_status}, Conf: {score:.2f})")
                    self.firestore.push_gate_log(gate_log_payload)

        # Cache for smooth re-rendering on subsequent frames
        self.cached_gate_workers = gate_workers
        self.cached_gate_drawings = gate_drawings
        self._redraw_gate_overlays(gate_frame, gate_drawings)
        return gate_workers

    def process_ward_stream(self, ward_frame: np.ndarray) -> list:
        """Processes elevated work area camera for sustained PPE tracking and cross-angle identity resolution."""
        if ward_frame is None or ward_frame.size == 0:
            return []

        # Run dedicated neural YOLO PPE detection once for the ward frame
        ppe_items = self.ward_ppe_evaluator.detect_frame_ppe(ward_frame)
        wh, ww = ward_frame.shape[:2]

        # Track persons with ByteTrack with optimized confidence threshold
        results = self.ward_model.track(
            ward_frame, persist=True, classes=[0], tracker="bytetrack.yaml", conf=PERSON_CONF_THRESHOLD, verbose=False
        )

        if not results or len(results[0].boxes) == 0:
            # If user is holding phone camera close-up to scan specific PPE (shoes, gloves, vest),
            # synthesize a target scan box around the detected PPE item
            if not ppe_items:
                return []
            ix1 = min(item["box"][0] for item in ppe_items)
            iy1 = min(item["box"][1] for item in ppe_items)
            ix2 = max(item["box"][2] for item in ppe_items)
            iy2 = max(item["box"][3] for item in ppe_items)
            pad = 25
            boxes = [[max(0, ix1 - pad), max(0, iy1 - pad), min(ww, ix2 + pad), min(wh, iy2 + pad)]]
            track_ids = [1]
            confidences = [0.85]
        else:
            boxes = results[0].boxes.xyxy.cpu().numpy().astype(int).tolist()
            confidences = results[0].boxes.conf.cpu().numpy().tolist()
            if results[0].boxes.id is not None:
                track_ids = results[0].boxes.id.cpu().numpy().astype(int).tolist()
            else:
                track_ids = [i + 1 for i in range(len(boxes))]

        # Optional face detection on ward frame for workers facing camera
        ward_faces = None
        if self.face_engine.use_native_sface and self.face_engine.detector:
            try:
                self.face_engine.detector.setInputSize((ww, wh))
                _, ward_faces = self.face_engine.detector.detect(ward_frame)
            except Exception:
                ward_faces = None

        ward_workers = []

        for box, track_id, conf in zip(boxes, track_ids, confidences):
            x1, y1, x2, y2 = map(int, box)
            str_tid = f"TRACK_{track_id:02d}"

            matched_ward_face = None
            if ward_faces is not None:
                for f in ward_faces:
                    fx, fy, fw, fh = map(int, f[:4])
                    if x1 - 30 <= (fx + fw // 2) <= x2 + 30 and y1 - 30 <= (fy + fh // 2) <= y2 + 30:
                        matched_ward_face = (fx, fy, fw, fh)
                        break

            # Evaluate PPE compliance with neural + HSV fusion!
            ppe_res = self.ward_ppe_evaluator.evaluate_ppe(
                ward_frame, (x1, y1, x2, y2), str_tid, frame_ppe_items=ppe_items, face_bbox=matched_ward_face
            )
            helmet = ppe_res["helmet"]
            vest = ppe_res["vest"]
            gloves = ppe_res.get("gloves", "UNKNOWN")
            shoes = ppe_res.get("safety_shoes", "UNKNOWN")
            h_col = ppe_res.get("helmet_color", "NONE")
            v_col = ppe_res.get("vest_color", "NONE")
            torso_vis = ppe_res.get("body_visible", True)
            hands_vis = ppe_res.get("hands_visible", True)

            # In CCTV 2 (Welding Zone / Elevated Production Bay), safety policy mandates:
            # - Helmet: PASS
            # - Vest: PASS
            # - Gloves: must NOT be FAIL (bare hands)
            # - Safety Shoes: must NOT be FAIL (bad shoes/bare feet)
            is_compliant = (helmet == "PASS") and (vest == "PASS") and (gloves != "FAIL") and (shoes != "FAIL")

            if not is_compliant:
                self.violation_counters[track_id] = self.violation_counters.get(track_id, 0) + 1
            else:
                self.violation_counters[track_id] = max(0, self.violation_counters.get(track_id, 0) - 1)

            # Draw visual overlay on Ward frame
            is_confirmed_viol = self.violation_counters[track_id] >= 15
            box_col = (0, 230, 115) if is_compliant else ((0, 0, 235) if is_confirmed_viol else (0, 180, 255))
            cv2.rectangle(ward_frame, (x1, y1), (x2, y2), box_col, 2)

            # Top label
            cv2.putText(
                ward_frame,
                f"Worker [{str_tid}] {conf:.2f}",
                (x1 + 4, max(15, y1 - 8)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                box_col,
                1,
            )

            # PPE Badge on Ward Camera with all 4 PPE categories
            ppe_badge = f"H:{helmet} | V:{vest} | G:{gloves} | S:{shoes}"
            cv2.putText(ward_frame, ppe_badge, (x1 + 4, y1 + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1)

            # Partial visibility indicator or violation counter
            if not torso_vis or not hands_vis:
                vis_note = "PARTIAL VIEW: " + (
                    "BODY & HANDS OUT" if (not torso_vis and not hands_vis)
                    else ("BODY OUT OF FRAME" if not torso_vis else "HANDS OUT OF FRAME")
                )
                cv2.putText(
                    ward_frame,
                    vis_note,
                    (x1 + 4, y1 + 34),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.36,
                    (0, 165, 255),
                    1,
                )
            elif not is_compliant:
                cv2.putText(
                    ward_frame,
                    f"Violation: {self.violation_counters[track_id]}/15",
                    (x1 + 4, y1 + 34),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.38,
                    (0, 0, 255) if is_confirmed_viol else (0, 180, 255),
                    1,
                )

            # Crown ROI indicator
            cx1, cy1, cx2, cy2 = ppe_res.get("crown_roi", (0, 0, 0, 0))
            if cx2 > cx1 and cy2 > cy1:
                is_helmet_pass = (helmet == "PASS")
                roi_col = (0, 255, 120) if is_helmet_pass else (0, 70, 255)
                cv2.rectangle(ward_frame, (cx1, cy1), (cx2, cy2), roi_col, 2)
                h_txt = "Helmet Detected" if is_helmet_pass else "Helmet Not Detected"
                (tw, th), _ = cv2.getTextSize(h_txt, cv2.FONT_HERSHEY_SIMPLEX, 0.42, 1)
                ty1 = max(18, cy1 - 4)
                cv2.rectangle(ward_frame, (cx1, ty1 - th - 4), (cx1 + tw + 6, ty1), (15, 20, 28), -1)
                cv2.putText(ward_frame, h_txt, (cx1 + 3, ty1 - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.42, roi_col, 1)

            ward_workers.append({
                "worker_track_id": str_tid,
                "camera_id": "CCTV_02",
                "zone_id": "WELDING_ZONE",
                "confidence": float(round(float(conf), 2)),
                "ppe": {
                    "helmet": helmet,
                    "vest": vest,
                    "gloves": gloves,
                    "safety_shoes": shoes,
                },
                "bbox": {
                    "x": float(round((x1 / ww) * 100, 1)),
                    "y": float(round((y1 / wh) * 100, 1)),
                    "width": float(round(((x2 - x1) / ww) * 100, 1)),
                    "height": float(round(((y2 - y1) / wh) * 100, 1)),
                    "label": f"Worker [{str_tid}]",
                    "color": "#10b981" if is_compliant else ("#ef4444" if is_confirmed_viol else "#f59e0b"),
                },
            })

            # Trigger Cross-Angle Identity Resolution when violation persists >= 15 frames
            if is_confirmed_viol:
                person_crop = ward_frame[max(0, y1):min(ward_frame.shape[0], y2), max(0, x1):min(ward_frame.shape[1], x2)]
                matched_worker, match_method = self._resolve_worker_identity(person_crop)

                # Push Incident to Cloud Firestore
                now_iso = datetime.now(timezone.utc).isoformat()
                missing_items = [item for item, st in [("HELMET", helmet), ("VEST", vest), ("GLOVES", gloves)] if st == "FAIL"]
                if not missing_items and (vest == "UNKNOWN" or gloves == "UNKNOWN"):
                    missing_items = ["BODY_OR_HANDS_NOT_IN_FRAME"]
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

        return ward_workers

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
            try:
                frame_idx += 1
                now = time.time()
                fps = 1.0 / max(0.001, (now - prev_time))
                prev_time = now

                # 1. Fetch latest frames from decoupled stream threads
                gate_frame, _ = self.gate_stream.get_latest_frame()
                ward_frame, _ = self.ward_stream.get_latest_frame()

                if gate_frame is None:
                    gate_frame = generate_synthetic_industrial_frame(1280, 720, frame_idx, "CCTV_01_GATE")
                if ward_frame is None:
                    ward_frame = generate_synthetic_industrial_frame(1280, 720, frame_idx, "CCTV_02_WARD")

                # 2. Process Gate stream (Entry access verification & PPE)
                gate_workers = self.process_gate_stream(gate_frame) or []

                # 3. Process Ward stream (PPE tracking & event-driven alert)
                ward_workers = self.process_ward_stream(ward_frame) or []

                # Broadcast live worker tracking telemetry for dashboard
                if not self.test_mode:
                    self.web_broadcaster.update_workers(gate_workers + ward_workers)

                # 4. Render Dual-Stream Composite Tactical Display
                h_sub, w_sub = 360, 640
                gate_resized = cv2.resize(gate_frame, (w_sub, h_sub))
                ward_resized = cv2.resize(ward_frame, (w_sub, h_sub))

                # Header bars on crops
                cv2.rectangle(gate_resized, (0, 0), (w_sub, 30), (20, 25, 35), -1)
                cv2.putText(gate_resized, "[CCTV 1] GATE CHOKE-POINT (Laptop Cam)", (12, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 200), 1)

                cv2.rectangle(ward_resized, (0, 0), (w_sub, 30), (20, 25, 35), -1)
                cv2.putText(ward_resized, f"[CCTV 2] PRODUCTION BAY (Front View) - {ZONE_NAME}", (12, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 200, 0), 1)

                # Check real-time environmental hazard state (Smoke / Fire)
                hazard = get_hazard_state()
                if hazard.get("smoke"):
                    s_idx = float(hazard.get("smoke_index") or 0.85)
                    cv2.rectangle(ward_resized, (10, 36), (w_sub - 10, 70), (0, 140, 255), -1)
                    cv2.putText(ward_resized, f"WARNING: SMOKE HAZARD DETECTED (Index: {s_idx:.2f}) [P2]", (18, 59), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (255, 255, 255), 2)
                    if not self.smoke_active_prev or (time.time() - self.last_smoke_incident_time > 60.0):
                        now_iso = datetime.now(timezone.utc).isoformat()
                        smoke_inc = {
                            "incident_id": f"SMK-{int(time.time()) % 1000000:06d}",
                            "facility_id": self.facility_id,
                            "zone_id": self.zone_id,
                            "zone_name": ZONE_NAME,
                            "camera_id": "CAM_01_WARD",
                            "source_event_type": "SMOKE",
                            "priority": "P2",
                            "timestamp": now_iso,
                            "confidence": 0.88,
                            "status": "OPEN",
                            "required_action": "INSPECTION REQUIRED — VISUAL SMOKE CLOUD DETECTED",
                            "decision_reason": "Elevated smoke plume detected on CCTV 2 -> P2 Advisory Incident.",
                            "evidence_image": "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=80",
                            "vision_evidence": {"fire": False, "smoke": True},
                            "sensor_evidence": {"smoke_index": s_idx},
                            "network_mode": "LAN",
                        }
                        print(f"\n[ALERT] P2 Smoke Incident triggered -> Pushing to Firestore...")
                        self.firestore.push_incident(smoke_inc)
                        self.firestore.update_zone_priority(self.zone_id, "P2", smoke_detected=True)
                        self.last_smoke_incident_time = time.time()
                    self.smoke_active_prev = True
                elif self.smoke_active_prev:
                    self.firestore.update_zone_priority(self.zone_id, "P0", smoke_detected=False)
                    self.smoke_active_prev = False

                if hazard.get("fire"):
                    cv2.rectangle(ward_resized, (10, 74), (w_sub - 10, 108), (0, 0, 230), -1)
                    cv2.putText(ward_resized, "CRITICAL: ACTIVE FLAME DETECTED [P3 TAKEOVER]", (18, 97), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (255, 255, 255), 2)
                    if not self.fire_active_prev or (time.time() - self.last_fire_incident_time > 60.0):
                        now_iso = datetime.now(timezone.utc).isoformat()
                        fire_inc = {
                            "incident_id": f"FIR-{int(time.time()) % 1000000:06d}",
                            "facility_id": self.facility_id,
                            "zone_id": self.zone_id,
                            "zone_name": ZONE_NAME,
                            "camera_id": "CAM_01_WARD",
                            "source_event_type": "FIRE",
                            "priority": "P3",
                            "timestamp": now_iso,
                            "confidence": 0.96,
                            "status": "OPEN",
                            "required_action": "EVACUATE ZONE IMMEDIATELY — SIREN ACTIVATED — DISPATCH FIRE BRIGADE",
                            "decision_reason": "Flame verified on CCTV bay -> Critical P3 Emergency Takeover.",
                            "evidence_image": "https://images.unsplash.com/photo-1542385151-efd9000785a0?auto=format&fit=crop&w=800&q=80",
                            "vision_evidence": {"fire": True, "smoke": True},
                            "network_mode": "LAN",
                        }
                        print(f"\n[CRITICAL] P3 Fire Incident triggered -> Pushing to Firestore...")
                        self.firestore.push_incident(fire_inc)
                        self.firestore.update_zone_priority(self.zone_id, "P3", fire_detected=True, smoke_detected=True)
                        self.last_fire_incident_time = time.time()
                    self.fire_active_prev = True
                elif self.fire_active_prev:
                    self.firestore.update_zone_priority(self.zone_id, "P0", fire_detected=False)
                    self.fire_active_prev = False

                composite = np.hstack([gate_resized, ward_resized])

                # Bottom Status Bar
                footer_h = 45
                footer = np.zeros((footer_h, composite.shape[1], 3), dtype=np.uint8)
                footer[:] = (15, 20, 28)
                active_list = ", ".join(self.active_checked_in_workers.keys()) or "None"
                total_active_workers = len(gate_workers) + len(ward_workers)
                cv2.putText(footer, f"FPS: {fps:.1f} | TRACKED WORKERS: {total_active_workers} | PERSONNEL: [{active_list}] | CCTV 1-4 READY", (15, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 220, 240), 1)

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

                if not self.no_gui:
                    try:
                        cv2.imshow("SafetyIntel CCTV Operations Console", display_view)
                        k = cv2.waitKey(1) & 0xFF
                        if k == ord('q'):
                            break
                        elif k in (ord('s'), ord('S')):
                            cur = get_hazard_state().get("smoke", False)
                            set_hazard_state(smoke=not cur, smoke_index=0.88 if not cur else 0.0)
                            print(f"[Hazard] Toggled smoke simulation: {not cur}")
                        elif k in (ord('f'), ord('F')):
                            cur = get_hazard_state().get("fire", False)
                            set_hazard_state(fire=not cur)
                            print(f"[Hazard] Toggled fire simulation: {not cur}")
                    except Exception:
                        time.sleep(0.01)
                else:
                    time.sleep(0.01)
            except Exception as e:
                print(f"[Orchestrator Warning] Error in main loop: {e}")
                time.sleep(0.05)

        self.gate_stream.stop()
        self.ward_stream.stop()
        if self.cctv3_stream:
            self.cctv3_stream.stop()
        if self.cctv4_stream:
            self.cctv4_stream.stop()
        if not self.test_mode:
            self.web_broadcaster.stop()
            if not self.no_gui:
                try:
                    cv2.destroyAllWindows()
                except Exception:
                    pass
        print("[Orchestrator] Multi-CCTV pipeline stopped cleanly.")

def main():
    parser = argparse.ArgumentParser(description="SafetyIntel Multi-CCTV Orchestrator")
    parser.add_argument("--cctv1-gate", "--gate-source", dest="cctv1", default="0", help="CCTV 1: Laptop camera / Gate choke-point (default: 0)")
    parser.add_argument("--cctv2-front", "--ward-source", dest="cctv2", default="0", help="CCTV 2: Front overhead view / IP phone stream (e.g. http://<ip>:8080/video)")
    parser.add_argument("--cctv3-side-left", dest="cctv3", default=None, help="CCTV 3: Left side angle view IP phone stream")
    parser.add_argument("--cctv4-side-right", dest="cctv4", default=None, help="CCTV 4: Right side angle view IP phone stream")
    parser.add_argument("--no-gui", "--headless", dest="no_gui", action="store_true", help="Run in headless mode without local OpenCV desktop window (web stream only)")
    parser.add_argument("--demo-ppe-pass", dest="demo_ppe_pass", action="store_true", help="Force all PPE compliance checks to PASS for demonstration")
    parser.add_argument("--test-mode", action="store_true", help="Run automated test simulation without GUI")
    args = parser.parse_args()

    orchestrator = MultiCameraOrchestrator(
        gate_src=args.cctv1,
        ward_src=args.cctv2,
        cctv3_src=args.cctv3,
        cctv4_src=args.cctv4,
        test_mode=args.test_mode,
        no_gui=args.no_gui,
        demo_ppe_pass=args.demo_ppe_pass,
    )
    try:
        orchestrator.run()
    except KeyboardInterrupt:
        print("\n[Orchestrator] Interrupted by user.")
    except Exception as e:
        import traceback
        print(f"\n[Orchestrator Fatal Exception]: {e}")
        traceback.print_exc()

if __name__ == "__main__":
    main()
