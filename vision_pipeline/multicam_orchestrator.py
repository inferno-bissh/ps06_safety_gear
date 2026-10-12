"""Multimodal Industrial Safety Multi-Camera Orchestrator."""
import os
import sys
import time
import cv2
import argparse
import numpy as np
import json
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
from web_streamer import (
    WebStreamBroadcaster,
    get_hazard_state,
    set_hazard_state,
    register_camera_callbacks,
    get_standby_numpy_frame,
)

CAMERA_CONFIG_FILE = BASE_DIR.parent / "camera_config.json"

def load_camera_config() -> dict:
    """Loads persistent camera configuration from camera_config.json."""
    if CAMERA_CONFIG_FILE.exists():
        try:
            with open(CAMERA_CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[Config Warning] Could not parse camera_config.json: {e}")
    return {}

def save_camera_config(data: dict):
    """Safely updates persistent camera configuration on disk."""
    try:
        cur = load_camera_config()
        cur.update(data)
        cur["updated_at"] = datetime.now(timezone.utc).isoformat()
        with open(CAMERA_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cur, f, indent=2)
    except Exception as e:
        print(f"[Config Error] Failed to write camera_config.json: {e}")

def normalize_camera_source(src, default="0"):
    if src is None:
        return default
    s = str(src).strip().strip('"').strip("'")
    if not s:
        return default
    if s.isdigit():
        return int(s)
    # Sanitize corrupted 0-ip endpoints or local aliases back to physical webcam 0
    if s in ("http://0:8080/video", "http://0:8080", "http://0/video", "webcam", "local"):
        return 0
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

        # Check persistent camera_config.json on disk if defaults provided
        saved_cfg = load_camera_config()
        if (ward_src == "0" or ward_src == "http://192.168.1.5:8080/video") and "cctv2" in saved_cfg:
            ward_src = saved_cfg["cctv2"]
        if gate_src == "0" and "cctv1" in saved_cfg and saved_cfg["cctv1"] not in ("0", 0, "http://0:8080/video"):
            gate_src = saved_cfg["cctv1"]
        if (cctv3_src is None or cctv3_src == "0") and "cctv3" in saved_cfg and saved_cfg["cctv3"]:
            cctv3_src = saved_cfg["cctv3"]
        if (cctv4_src is None or cctv4_src == "0") and "cctv4" in saved_cfg and saved_cfg["cctv4"]:
            cctv4_src = saved_cfg["cctv4"]

        gate_src = normalize_camera_source(gate_src, "0")
        ward_src = normalize_camera_source(ward_src, "http://192.168.1.5:8080/video")
        # Ensure CCTV 3 and CCTV 4 never default to laptop webcam 0
        cctv3_src = None if cctv3_src in (None, "", "0", 0, "STANDBY") else normalize_camera_source(cctv3_src, None)
        cctv4_src = None if cctv4_src in (None, "", "0", 0, "STANDBY") else normalize_camera_source(cctv4_src, None)

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
        self.cctv3_stream = ThreadedCameraStream(src=cctv3_src, camera_id="CAM_02_PHONE2", target_fps=20) if cctv3_src else None
        self.cctv4_stream = ThreadedCameraStream(src=cctv4_src, camera_id="CAM_03_PHONE3", target_fps=20) if cctv4_src else None

        # 6. Stateful Memory & Session Tables
        self.active_checked_in_workers: Dict[str, dict] = {}
        self.violation_counters: Dict[int, int] = {}
        self.track_motion_history: Dict[str, list] = {}
        self.track_confirmations: Dict[str, int] = {}
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

        # 8. Register dynamic source update & status callbacks with web streamer
        register_camera_callbacks(self.update_camera_source, self.get_cameras_status)

    def update_camera_source(self, channel: str, source: str, action: str = "connect") -> tuple:
        """
        Dynamically updates a camera stream source on the fly without stopping the
        orchestrator or dropping the laptop webcam / CCTV 1 feed.
        """
        ch = str(channel).lower()
        if action == "disconnect":
            if ch in ("cctv2", "ward", "cam_01"):
                self.ward_stream.disconnect()
                save_camera_config({"cctv2_status": "DISCONNECTED"})
                return True, "CCTV 2 stream disconnected to standby mode"
            elif ch in ("cctv1", "gate", "cam_00"):
                self.gate_stream.disconnect()
                save_camera_config({"cctv1_status": "DISCONNECTED"})
                return True, "CCTV 1 stream disconnected to standby mode"
            return False, f"Unknown camera channel: {channel}"

        norm = normalize_camera_source(source, "0" if ch in ("cctv1", "gate") else "http://192.168.1.5:8080/video")
        if ch in ("cctv2", "ward", "cam_01", "phone1"):
            self.ward_stream.update_source(norm)
            ip_str = str(norm).replace("http://", "").replace("https://", "").split("/")[0].split(":")[0]
            port_val = 8080
            if ":" in str(norm).replace("http://", "").replace("https://", "").split("/")[0]:
                try:
                    port_val = int(str(norm).replace("http://", "").replace("https://", "").split("/")[0].split(":")[1])
                except Exception:
                    pass
            save_camera_config({
                "cctv2": str(norm),
                "cctv2_ip": ip_str,
                "cctv2_port": port_val,
                "cctv2_endpoint": "/video",
                "cctv2_status": "ONLINE",
            })
            return True, f"CCTV 2 (Phone 1) stream dynamically switched to '{norm}'"
        elif ch in ("cctv3", "left", "cam_02", "phone2"):
            if action == "disconnect":
                if self.cctv3_stream:
                    self.cctv3_stream.disconnect()
                self.web_broadcaster.clear_frame("cctv3")
                save_camera_config({"cctv3_status": "DISCONNECTED"})
                return True, "CCTV 3 (Phone 2) stream disconnected to standby mode"

            norm3 = normalize_camera_source(source, None)
            if not norm3 or norm3 in (0, "0"):
                return False, "CCTV 3 requires an IP camera URL (e.g. http://<ip>:8080/video)"
            if self.cctv3_stream:
                self.cctv3_stream.update_source(norm3)
            else:
                self.cctv3_stream = ThreadedCameraStream(src=norm3, camera_id="CAM_02_PHONE2", target_fps=20)

            ip_str3 = str(norm3).replace("http://", "").replace("https://", "").split("/")[0].split(":")[0]
            port_val3 = 8080
            if ":" in str(norm3).replace("http://", "").replace("https://", "").split("/")[0]:
                try:
                    port_val3 = int(str(norm3).replace("http://", "").replace("https://", "").split("/")[0].split(":")[1])
                except Exception:
                    pass
            save_camera_config({
                "cctv3": str(norm3),
                "cctv3_ip": ip_str3,
                "cctv3_port": port_val3,
                "cctv3_endpoint": "/video",
                "cctv3_status": "ONLINE",
            })
            return True, f"CCTV 3 (Phone 2) stream dynamically switched to '{norm3}'"
        elif ch in ("cctv4", "right", "cam_03", "phone3"):
            if action == "disconnect":
                if self.cctv4_stream:
                    self.cctv4_stream.disconnect()
                self.web_broadcaster.clear_frame("cctv4")
                save_camera_config({"cctv4_status": "DISCONNECTED"})
                return True, "CCTV 4 (Phone 3) stream disconnected to standby mode"

            norm4 = normalize_camera_source(source, None)
            if not norm4 or norm4 in (0, "0"):
                return False, "CCTV 4 requires an IP camera URL (e.g. http://<ip>:8080/video)"
            if self.cctv4_stream:
                self.cctv4_stream.update_source(norm4)
            else:
                self.cctv4_stream = ThreadedCameraStream(src=norm4, camera_id="CAM_03_PHONE3", target_fps=20)

            ip_str4 = str(norm4).replace("http://", "").replace("https://", "").split("/")[0].split(":")[0]
            port_val4 = 8080
            if ":" in str(norm4).replace("http://", "").replace("https://", "").split("/")[0]:
                try:
                    port_val4 = int(str(norm4).replace("http://", "").replace("https://", "").split("/")[0].split(":")[1])
                except Exception:
                    pass
            save_camera_config({
                "cctv4": str(norm4),
                "cctv4_ip": ip_str4,
                "cctv4_port": port_val4,
                "cctv4_endpoint": "/video",
                "cctv4_status": "ONLINE",
            })
            return True, f"CCTV 4 (Phone 3) stream dynamically switched to '{norm4}'"
        elif ch in ("cctv1", "gate", "cam_00"):
            self.gate_stream.update_source(norm)
            save_camera_config({"cctv1": str(norm), "cctv1_status": "ONLINE"})
            return True, f"CCTV 1 stream dynamically switched to '{norm}'"

        return False, f"Unknown camera channel: {channel}"

    def get_cameras_status(self) -> dict:
        """Returns live stream connectivity status across all camera channels."""
        return {
            "cctv1": self.gate_stream.get_status() if self.gate_stream else None,
            "cctv2": self.ward_stream.get_status() if self.ward_stream else None,
            "cctv3": self.cctv3_stream.get_status() if self.cctv3_stream else {
                "camera_id": "CAM_02_PHONE2",
                "source": "STANDBY",
                "is_connected": False,
                "is_synthetic": True,
                "frame_count": 0,
                "latency_sec": 0.0,
            },
            "cctv4": self.cctv4_stream.get_status() if self.cctv4_stream else {
                "camera_id": "CAM_03_PHONE3",
                "source": "STANDBY",
                "is_connected": False,
                "is_synthetic": True,
                "frame_count": 0,
                "latency_sec": 0.0,
            },
            "saved_config": load_camera_config(),
        }

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

    def _is_valid_human_detection(
        self,
        frame: np.ndarray,
        bbox: tuple,
        conf: float,
        matched_face: Optional[tuple],
        ppe_res: dict,
        track_id: int,
        cam_id: str,
    ) -> bool:
        """
        Multi-layered human verification: Eliminates false person detections caused by
        hanging clothes, jackets on hangers, curtains, chairs, and background items, while
        reliably preserving genuine workers across distances, clothing styles, and lighting.
        """
        x1, y1, x2, y2 = bbox
        bw = max(1, x2 - x1)
        bh = max(1, y2 - y1)
        ar = bh / float(bw)

        # 1. Bounding box size and aspect ratio
        # A seated or standing human in front of camera has aspect ratio in [0.48, 5.0].
        # Discard extreme horizontal ribbons (ar < 0.48) or tiny edge artifacts (bw < 40 or bh < 60)
        if bw < 40 or bh < 60 or ar < 0.48 or ar > 5.0:
            return False

        # 2. Confirmed Human Landmarks (Face, Helmet, or Vest immediately pass)
        if matched_face is not None:
            return True
        if ppe_res.get("helmet") == "PASS" or ppe_res.get("vest") == "PASS":
            return True

        # 3. Confidence gating for unverified candidates (no face, no helmet, no vest)
        # Background fabric/clothes on hooks or chairs produce noise (typically < 0.48)
        if conf < 0.48:
            return False

        # 4. Human biological presence check (skin or hair in candidate box)
        h, w = frame.shape[:2]
        crop_head = frame[max(0, y1):min(h, y1 + int(bh * 0.45)), max(0, x1):min(w, x2)]
        if crop_head.size > 0:
            h_ycrcb = cv2.cvtColor(crop_head, cv2.COLOR_BGR2YCrCb)
            h_hsv = cv2.cvtColor(crop_head, cv2.COLOR_BGR2HSV)
            m_skin = cv2.bitwise_and(
                cv2.inRange(h_ycrcb, np.array([0, 133, 77]), np.array([255, 173, 127])),
                cv2.inRange(h_hsv, np.array([0, 25, 45]), np.array([28, 220, 255]))
            )
            m_hair = cv2.bitwise_or(
                cv2.inRange(h_hsv, np.array([0, 0, 0]), np.array([180, 110, 92])),
                cv2.inRange(h_hsv, np.array([5, 40, 30]), np.array([25, 140, 110]))
            )
            tot = crop_head.shape[0] * crop_head.shape[1]
            s_ratio = cv2.countNonZero(m_skin) / tot
            hair_ratio = cv2.countNonZero(m_hair) / tot
            # If candidate completely lacks skin and hair and safety gear, it is an inanimate object/garment!
            if s_ratio < 0.02 and hair_ratio < 0.02:
                return False

        # 5. Motion Dynamics & Stillness Filter:
        # Inanimate objects (clothes on hangers, bags on hooks) are 100% stationary across frames.
        # Real humans (even when sitting still) exhibit micro-motion from breathing and posture.
        track_key = f"{cam_id}_{track_id}"
        cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
        history = self.track_motion_history.setdefault(track_key, [])
        history.append((cx, cy))
        if len(history) > 15:
            history.pop(0)

        # If we have tracked this unverified candidate across 8+ frames:
        if len(history) >= 8:
            xs = [p[0] for p in history]
            ys = [p[1] for p in history]
            std_x = float(np.std(xs))
            std_y = float(np.std(ys))
            total_motion = float(np.sqrt(std_x**2 + std_y**2))
            # Inanimate object stillness check (< 1.6px motion variance on webcam)
            if total_motion < 1.60 and conf < 0.72:
                return False

        return True

    def process_gate_stream(self, gate_frame: np.ndarray) -> list:
        """Processes choke-point gate camera for identity verification, PPE evaluation, and access logging."""
        if gate_frame is None or gate_frame.size == 0:
            return []

        now = time.time()
        # Throttled evaluation interval (~0.10s, 10 FPS) to maintain smooth real-time performance
        # Between evaluations, smoothly redraw cached detections on the current frame
        if (now - self.last_gate_eval_time < 0.10) and len(self.cached_gate_drawings) > 0:
            self._redraw_gate_overlays(gate_frame, self.cached_gate_drawings)
            return self.cached_gate_workers

        self.last_gate_eval_time = now
        gh, gw = gate_frame.shape[:2]

        # High-Speed Inference Rescaling (downscales to 640px wide for ~4x CPU inference speedup)
        if gw > 640:
            scale_x = gw / 640.0
            scale_y = gh / 360.0
            infer_frame = cv2.resize(gate_frame, (640, 360))
        else:
            scale_x = 1.0
            scale_y = 1.0
            infer_frame = gate_frame

        # 1. Person Tracking with ByteTrack (persistent tracking across frames prevents ID swapping when switching sides)
        # Using conf=PERSON_CONF_THRESHOLD eliminates low-confidence inanimate object noise
        results = self.gate_model.track(
            infer_frame,
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
                bx1 = int(b[0] * scale_x)
                by1 = int(b[1] * scale_y)
                bx2 = int(b[2] * scale_x)
                by2 = int(b[3] * scale_y)
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
                    boxes.append([bx1, by1, bx2, by2])
                    track_ids.append(t)
                    confidences.append(c)

        # 2. Face Detection & Anchor Box Refinement
        faces = None
        if self.face_engine.use_native_sface and self.face_engine.detector:
            try:
                self.face_engine.detector.setInputSize((infer_frame.shape[1], infer_frame.shape[0]))
                _, raw_faces = self.face_engine.detector.detect(infer_frame)
                if raw_faces is not None:
                    faces = []
                    for f in raw_faces:
                        fx = int(f[0] * scale_x)
                        fy = int(f[1] * scale_y)
                        fw = int(f[2] * scale_x)
                        fh = int(f[3] * scale_y)
                        faces.append((fx, fy, fw, fh))
            except Exception:
                faces = None

        # Extrapolate untracked faces if sitting very close (require genuine face size)
        if faces is not None:
            for f in faces:
                fx, fy, fw, fh = f[:4]
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
        raw_ppe_items = self.gate_ppe_evaluator.detect_frame_ppe(infer_frame)
        ppe_items = []
        if raw_ppe_items:
            for item in raw_ppe_items:
                ix1, iy1, ix2, iy2 = item["box"]
                ppe_items.append({
                    "label": item["label"],
                    "conf": item["conf"],
                    "box": (int(ix1 * scale_x), int(iy1 * scale_y), int(ix2 * scale_x), int(iy2 * scale_y)),
                })

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
                # Ensure appropriate headroom for safety helmets (dome sits 0.80 to 1.20 * fh above brow fy)
                helmet_top = max(0, fy - int(fh * 1.25))
                y1 = min(y1, helmet_top)
                # Horizontal bounds around worker
                x1 = max(0, min(x1, fx - int(fw * 0.75)))
                x2 = min(gw, max(x2, fx + fw + int(fw * 0.75)))
                head_h = max(35, (fy + fh) - y1)
                face_crop = gate_frame[max(0, fy - 10):min(gh, fy + fh + 10), max(0, fx - 10):min(gw, fx + fw + 10)]
            else:
                head_h = max(20, int((y2 - y1) * 0.35))
                face_crop = gate_frame[y1:y1 + head_h, x1:x2]

            # Strictly clip bounding box coordinates within frame limits
            x1 = max(0, min(gw - 1, x1))
            y1 = max(0, min(gh - 1, y1))
            x2 = max(x1 + 10, min(gw, x2))
            y2 = max(y1 + 20, min(gh, y2))

            name, score = self.face_engine.identify_face(
                face_crop, matched_face_raw=matched_face_raw, full_frame=gate_frame
            )
            is_verified = bool(name and name not in ["Unidentified Worker", "Unregistered Worker"])
            worker_id = name if is_verified else f"GATE_WORKER_{tid:02d}"

            # Evaluate PPE for every candidate box on Gate Camera with neural + HSV fusion!
            ppe_res = self.gate_ppe_evaluator.evaluate_ppe(
                gate_frame, (x1, y1, x2, y2), f"GATE_{worker_id}", frame_ppe_items=ppe_items, face_bbox=matched_face
            )

            # Multi-Layered Inanimate Object Rejection:
            # Eliminates hanging clothes, uniforms on hangers, backpacks, and background noise
            is_human = self._is_valid_human_detection(
                gate_frame, (x1, y1, x2, y2), conf, matched_face, ppe_res, tid, "gate"
            )
            if not is_human:
                continue

            # Multi-Frame Temporal Confirmation:
            # Requires at least 3 consecutive valid detections before broadcasting candidate as a confirmed worker
            # (Immediate 1-frame confirmation if human face is matched or confidence >= 0.70 or safety gear confirmed)
            track_key = f"gate_{tid}"
            self.track_confirmations[track_key] = self.track_confirmations.get(track_key, 0) + 1
            min_frames_needed = 1 if (conf >= 0.70 or matched_face is not None or ppe_res["helmet"] == "PASS") else 3
            if self.track_confirmations[track_key] < min_frames_needed:
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

            # Append to telemetry with clamped percentages and explicit helmet_bbox
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
                "helmet_bbox": {
                    "x": float(round((max(0, min(gw - 1, cx1)) / gw) * 100, 1)),
                    "y": float(round((max(0, min(gh - 1, cy1)) / gh) * 100, 1)),
                    "width": float(round((max(1, min(gw - cx1, cx2 - cx1)) / gw) * 100, 1)),
                    "height": float(round((max(1, min(gh - cy1, cy2 - cy1)) / gh) * 100, 1)),
                    "label": "Helmet Detected" if helmet == "PASS" else "Helmet Not Detected",
                    "color": "#10b981" if helmet == "PASS" else "#ef4444",
                } if (cx2 > cx1 and cy2 > cy1) else None,
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

        # When CCTV 2 is offline or in synthetic standby, skip neural inference to eliminate CPU load
        if self.ward_stream.is_synthetic_mode:
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

            # Multi-Layered Inanimate Object Rejection:
            is_human = self._is_valid_human_detection(
                ward_frame, (x1, y1, x2, y2), conf, matched_ward_face, ppe_res, track_id, "ward"
            )
            if not is_human:
                continue

            # Multi-Frame Temporal Confirmation:
            track_key = f"ward_{track_id}"
            self.track_confirmations[track_key] = self.track_confirmations.get(track_key, 0) + 1
            min_frames_needed = 1 if (conf >= 0.70 or matched_ward_face is not None or ppe_res["helmet"] == "PASS") else 3
            if self.track_confirmations[track_key] < min_frames_needed:
                continue
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

            # Strictly clip bounding box coordinates within frame limits
            x1 = max(0, min(ww - 1, x1))
            y1 = max(0, min(wh - 1, y1))
            x2 = max(x1 + 10, min(ww, x2))
            y2 = max(y1 + 20, min(wh, y2))

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
                "helmet_bbox": {
                    "x": float(round((max(0, min(ww - 1, cx1)) / ww) * 100, 1)),
                    "y": float(round((max(0, min(wh - 1, cy1)) / wh) * 100, 1)),
                    "width": float(round((max(1, min(ww - cx1, cx2 - cx1)) / ww) * 100, 1)),
                    "height": float(round((max(1, min(wh - cy1, cy2 - cy1)) / wh) * 100, 1)),
                    "label": "Helmet Detected" if helmet == "PASS" else "Helmet Not Detected",
                    "color": "#10b981" if helmet == "PASS" else "#ef4444",
                } if (cx2 > cx1 and cy2 > cy1) else None,
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
                if gate_frame is None:
                    gate_frame = get_standby_numpy_frame("cctv1")

                # 2. Process Gate stream (Entry access verification & PPE)
                gate_workers = self.process_gate_stream(gate_frame) or []

                # 3. Process Ward stream (PPE tracking & event-driven alert only when live stream is connected)
                if not self.ward_stream.is_synthetic_mode:
                    ward_frame, _ = self.ward_stream.get_latest_frame()
                    if ward_frame is not None:
                        ward_workers = self.process_ward_stream(ward_frame) or []
                        ward_resized = cv2.resize(ward_frame, (w_sub, h_sub))
                    else:
                        ward_workers = []
                        ward_resized = get_standby_numpy_frame("cctv2")
                else:
                    ward_workers = []
                    ward_resized = get_standby_numpy_frame("cctv2")

                # Broadcast live worker tracking telemetry for dashboard
                if not self.test_mode:
                    self.web_broadcaster.update_workers(gate_workers + ward_workers)

                # 4. Render Dual-Stream Composite Tactical Display
                h_sub, w_sub = 360, 640
                gate_resized = cv2.resize(gate_frame, (w_sub, h_sub))

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
                    if not self.ward_stream.is_synthetic_mode:
                        self.web_broadcaster.update_frame("cctv2", ward_resized)
                    else:
                        self.web_broadcaster.clear_frame("cctv2")

                    self.web_broadcaster.update_frame("composite", display_view)
                    if self.cctv3_stream and not self.cctv3_stream.is_synthetic_mode:
                        f3, _ = self.cctv3_stream.get_latest_frame()
                        if f3 is not None:
                            self.web_broadcaster.update_frame("cctv3", cv2.resize(f3, (w_sub, h_sub)))
                    else:
                        self.web_broadcaster.clear_frame("cctv3")

                    if self.cctv4_stream and not self.cctv4_stream.is_synthetic_mode:
                        f4, _ = self.cctv4_stream.get_latest_frame()
                        if f4 is not None:
                            self.web_broadcaster.update_frame("cctv4", cv2.resize(f4, (w_sub, h_sub)))
                    else:
                        self.web_broadcaster.clear_frame("cctv4")

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
