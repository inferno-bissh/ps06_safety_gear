import sys
import time
import argparse
import numpy as np
import cv2
from datetime import datetime
from pathlib import Path
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
    FRAME_WIDTH,
    FRAME_HEIGHT,
    TEMPORAL_CONFIRMATION_FRAMES,
    PERSON_CONF_THRESHOLD,
)
from firestore_client import FirestoreSyncClient
from ppe_detector import WorkerPPEEvaluator

def create_synthetic_frame(w=1280, h=720, step=0):
    """Generates a synthetic industrial camera view if physical webcam is unavailable."""
    frame = np.zeros((h, w, 3), dtype=np.uint8)
    # Industrial floor gradient
    for y in range(h):
        val = int(25 + (y / h) * 35)
        frame[y, :] = (val, val + 5, val + 10)

    # Factory floor markings (yellow diagonal hazard stripes)
    cv2.line(frame, (100, h - 50), (w - 100, h - 50), (0, 200, 255), 4)
    cv2.line(frame, (100, h - 150), (w - 100, h - 150), (0, 150, 200), 2)

    # Simulated worker movement
    x_offset = int((np.sin(step * 0.05) + 1) * (w - 500) * 0.5) + 200
    y_pos = int(h * 0.45)

    # Draw simulated worker silhouette
    cv2.rectangle(frame, (x_offset, y_pos), (x_offset + 140, y_pos + 300), (45, 65, 85), -1)
    # Head
    cv2.circle(frame, (x_offset + 70, y_pos - 40), 45, (160, 180, 200), -1)

    cv2.putText(
        frame,
        "[SYNTHETIC INDUSTRIAL TEST CAM - NO PHYSICAL WEBCAM DETECTED]",
        (30, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (0, 255, 255),
        2,
    )
    return frame

def draw_hud(frame, fps, worker_count, fire_sim, smoke_sim, firestore_status, ppe_evaluator):
    """Draws tactical high-tech HUD overlay on the camera frame."""
    h, w = frame.shape[:2]

    # 1. Top HUD Bar
    cv2.rectangle(frame, (0, 0), (w, 55), (15, 20, 28), -1)
    cv2.line(frame, (0, 55), (w, 55), (45, 55, 70), 1)

    # Title & Zone
    cv2.putText(frame, "SAFETYINTEL OS", (15, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)
    cv2.putText(frame, f"ZONE: {ZONE_NAME} | CAM: {CAMERA_ID}", (15, 46), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (180, 195, 210), 1)

    # Right metrics: FPS & Cloud Sync
    fps_color = (0, 255, 120) if fps > 20 else (0, 200, 255)
    cv2.putText(frame, f"FPS: {fps:.1f}", (w - 130, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.55, fps_color, 2)
    
    # Firestore Status indicator
    cloud_color = (0, 255, 120) if firestore_status else (0, 165, 255)
    cv2.circle(frame, (w - 260, 26), 5, cloud_color, -1)
    cv2.putText(frame, "CLOUD: SYNCED", (w - 245, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (200, 220, 240), 1)

    # Active Workers
    cv2.putText(frame, f"WORKERS: {worker_count}", (w - 260, 46), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (180, 200, 220), 1)

    # 2. Bottom Controls Bar
    cv2.rectangle(frame, (0, h - 35), (w, h), (15, 20, 28), -1)
    cv2.line(frame, (0, h - 35), (w, h - 35), (45, 55, 70), 1)

    controls_text = (
        "CONTROLS: [H] Toggle Helmet Override | [V] Toggle Vest Override | [F] Sim Fire (P3) | [S] Sim Smoke (P2) | [Q] Quit"
    )
    cv2.putText(frame, controls_text, (15, h - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (160, 180, 200), 1)

    # Hazard simulation banners
    if fire_sim:
        cv2.rectangle(frame, (w // 2 - 220, 70), (w // 2 + 220, 120), (0, 0, 200), -1)
        cv2.putText(frame, "CRITICAL: FIRE DETECTED (P3)", (w // 2 - 195, 105), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2)
    elif smoke_sim:
        cv2.rectangle(frame, (w // 2 - 200, 70), (w // 2 + 200, 120), (0, 140, 255), -1)
        cv2.putText(frame, "WARNING: SMOKE DETECTED (P2)", (w // 2 - 180, 105), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 0, 0), 2)

    # Active overrides status
    h_override_text = "AUTO" if ppe_evaluator.sim_force_helmet is None else ("PASS" if ppe_evaluator.sim_force_helmet else "FAIL")
    v_override_text = "AUTO" if ppe_evaluator.sim_force_vest is None else ("PASS" if ppe_evaluator.sim_force_vest else "FAIL")
    cv2.putText(
        frame,
        f"HELMET OVERRIDE: {h_override_text} | VEST OVERRIDE: {v_override_text}",
        (15, 80),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.45,
        (255, 200, 0),
        1,
    )

def main():
    parser = argparse.ArgumentParser(description="SafetyIntel Real-Time YOLO Vision Pipeline")
    parser.add_argument("--source", default=CAMERA_SOURCE, help="Webcam index (0) or video file path")
    parser.add_argument("--facility", default=FACILITY_ID, help="Facility ID")
    parser.add_argument("--zone", default=ZONE_ID, help="Zone ID")
    args = parser.parse_args()

    print("=" * 70)
    print("  PS-06 REAL-TIME AI VISION INFERENCE & PPE COMPLIANCE ENGINE")
    print(f"  Facility: {args.facility} | Zone: {args.zone}")
    print("=" * 70)

    # 1. Initialize Cloud Firestore Client
    firestore = FirestoreSyncClient(facility_id=args.facility)

    # 2. Initialize PPE Evaluator
    ppe_evaluator = WorkerPPEEvaluator()

    # 3. Load YOLOv8 Model
    print("\n[AI Vision] Loading YOLOv8 nano model (yolov8n.pt)...")
    model = YOLO("yolov8n.pt")
    print("[AI Vision] YOLOv8 model loaded successfully.")

    # 4. Open Camera Source
    source = int(args.source) if str(args.source).isdigit() else args.source
    cap = cv2.VideoCapture(source)

    is_synthetic = False
    if not cap.isOpened():
        print(f"\n[Camera Warning] Could not open camera source '{source}'. Running synthetic test generator.")
        is_synthetic = True
    else:
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
        print(f"[Camera] Connected to camera source {source} ({FRAME_WIDTH}x{FRAME_HEIGHT}).")

    print("\nStarting real-time inference loop. Press 'q' in the video window to stop.")

    prev_time = time.time()
    step_count = 0
    fire_sim_active = False
    smoke_sim_active = False

    while True:
        step_count += 1
        current_time = time.time()
        fps = 1.0 / max(0.001, (current_time - prev_time))
        prev_time = current_time

        if not is_synthetic:
            ret, frame = cap.read()
            if not ret or frame is None:
                print("[Camera] Frame read error. Falling back to synthetic.")
                is_synthetic = True
                frame = create_synthetic_frame(FRAME_WIDTH, FRAME_HEIGHT, step_count)
        else:
            frame = create_synthetic_frame(FRAME_WIDTH, FRAME_HEIGHT, step_count)

        h, w = frame.shape[:2]

        # Run YOLO Object Detection & Tracking (Class 0 = Person) with ByteTrack for stable IDs
        results = model.track(frame, persist=True, classes=[0], tracker="bytetrack.yaml", conf=PERSON_CONF_THRESHOLD, verbose=False)

        worker_count = 0
        boxes = []
        track_ids = []

        if results and len(results[0].boxes) > 0:
            boxes = results[0].boxes.xyxy.cpu().numpy().astype(int)
            confidences = results[0].boxes.conf.cpu().numpy()
            if results[0].boxes.id is not None:
                track_ids = results[0].boxes.id.cpu().numpy().astype(int)
            else:
                track_ids = [i + 1 for i in range(len(boxes))]
            worker_count = len(boxes)

            # Pre-compute dedicated neural PPE detections across the entire frame
            frame_ppe_items = ppe_evaluator.detect_frame_ppe(frame)

            for i, (box, track_id, conf) in enumerate(zip(boxes, track_ids, confidences)):
                x1, y1, x2, y2 = box
                str_track_id = f"TRACK_{track_id:02d}"

                # Evaluate Worker PPE Compliance using hybrid neural + HSV fusion
                ppe_result = ppe_evaluator.evaluate_ppe(
                    frame, (x1, y1, x2, y2), str_track_id, frame_ppe_items=frame_ppe_items
                )

                is_compliant = ppe_result["is_compliant"]
                helmet = ppe_result["helmet"]
                vest = ppe_result["vest"]
                fail_count = ppe_result["consecutive_fail_count"]

                # Color coding: Green = Compliant, Yellow = Evaluating, Red = Confirmed Violation
                if is_compliant:
                    box_color = (0, 230, 115)  # Green
                elif ppe_result["temporal_confirmed"]:
                    box_color = (0, 0, 235)    # Red
                else:
                    box_color = (0, 200, 255)  # Amber

                # Draw worker bounding box
                cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)

                # Draw Central Skull Crown ROI indicator (shows dome inspection zone)
                cx1, cy1, cx2, cy2 = ppe_result.get("crown_roi", (0, 0, 0, 0))
                if cx2 > cx1 and cy2 > cy1:
                    roi_col = (0, 255, 120) if helmet == "PASS" else (0, 180, 255)
                    cv2.rectangle(frame, (cx1, cy1), (cx2, cy2), roi_col, 1)

                # Draw Top Label Tag
                tag_text = f"Worker [{str_track_id}] {conf:.2f}"
                (tw, th), _ = cv2.getTextSize(tag_text, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                cv2.rectangle(frame, (x1, max(0, y1 - 22)), (x1 + tw + 10, y1), box_color, -1)
                cv2.putText(
                    frame,
                    tag_text,
                    (x1 + 5, y1 - 6),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.45,
                    (0, 0, 0) if is_compliant else (255, 255, 255),
                    1,
                )

                # Draw PPE Badges below tag with color classification (e.g. WHITE, YELLOW)
                h_col = ppe_result.get("helmet_color", "NONE")
                v_col = ppe_result.get("vest_color", "NONE")
                h_str = f"HELMET: PASS [{h_col}]" if helmet == "PASS" else "HELMET: FAIL"
                v_str = f"VEST: PASS [{v_col}]" if vest == "PASS" else "VEST: FAIL"
                ppe_text = f"{h_str} | {v_str}"
                cv2.putText(frame, ppe_text, (x1 + 4, y1 + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.42, box_color, 1)

                if not is_compliant and not ppe_result["temporal_confirmed"]:
                    # Show temporal confirmation progress bar
                    prog = f"Confirming Violation: {fail_count}/{TEMPORAL_CONFIRMATION_FRAMES} frames"
                    cv2.putText(frame, prog, (x1 + 4, y1 + 35), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 220, 255), 1)

                # Push Incident to Firestore if temporally confirmed!
                if ppe_result["should_raise_incident"]:
                    now_iso = datetime.utcnow().isoformat() + "Z"
                    incident_payload = {
                        "incident_id": f"PPE-{int(time.time()) % 1000000:06d}",
                        "facility_id": args.facility,
                        "zone_id": args.zone,
                        "zone_name": ZONE_NAME,
                        "camera_id": CAMERA_ID,
                        "worker_id": str_track_id,
                        "source_event_type": "PPE_VIOLATION",
                        "priority": "P1",
                        "timestamp": now_iso,
                        "confidence": float(round(float(conf), 2)),
                        "status": "OPEN",
                        "required_action": "SUPERVISOR REVIEW — ISSUE PPE COMPLIANCE WARNING",
                        "decision_reason": f"Computer vision verified missing PPE (Helmet: {helmet}, Vest: {vest}) for {TEMPORAL_CONFIRMATION_FRAMES}+ consecutive frames.",
                        "evidence_image": "https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?auto=format&fit=crop&w=800&q=80",
                        "vision_evidence": {
                            "missing_items": [item for item, st in [("HELMET", helmet), ("VEST", vest)] if st == "FAIL"]
                        },
                        "network_mode": "LAN",
                    }
                    print(f"\n[ALERT] Raising PPE Violation Incident for {str_track_id} -> Pushing to Cloud Firestore!")
                    firestore.push_incident(incident_payload)
                    firestore.update_zone_priority(args.zone, "P1")

                # Periodic terminal telemetry (once every ~1 sec / 30 frames)
                if step_count % 30 == 0:
                    metrics = ppe_result.get("metrics", {})
                    w_pct = metrics.get("white_pct", 0.0)
                    c_pct = metrics.get("colored_pct", 0.0)
                    v_pct = metrics.get("vest_pct", 0.0)
                    print(f"[PPE Telemetry] {str_track_id} | Helmet: {helmet} [{h_col}] (w={w_pct:.0%}, c={c_pct:.0%}) | Vest: {vest} [{v_col}] (v={v_pct:.0%})")

        # Overlay HUD
        draw_hud(frame, fps, worker_count, fire_sim_active, smoke_sim_active, True, ppe_evaluator)

        # Show Output Window
        cv2.imshow("SafetyIntel AI Vision Pipeline - PS-06", frame)

        # Handle Keyboard Input
        key = cv2.waitKey(1) & 0xFF
        if key in (ord("q"), ord("Q"), 27):  # 'q' or ESC
            print("\nExiting inference loop.")
            break
        elif key in (ord("h"), ord("H")):
            # Cycle helmet override: None -> False (Force FAIL) -> True (Force PASS) -> None
            if ppe_evaluator.sim_force_helmet is None:
                ppe_evaluator.sim_force_helmet = False
            elif ppe_evaluator.sim_force_helmet is False:
                ppe_evaluator.sim_force_helmet = True
            else:
                ppe_evaluator.sim_force_helmet = None
            print(f"[Key Toggle] Helmet Override set to: {ppe_evaluator.sim_force_helmet}")
        elif key in (ord("v"), ord("V")):
            if ppe_evaluator.sim_force_vest is None:
                ppe_evaluator.sim_force_vest = False
            elif ppe_evaluator.sim_force_vest is False:
                ppe_evaluator.sim_force_vest = True
            else:
                ppe_evaluator.sim_force_vest = None
            print(f"[Key Toggle] Vest Override set to: {ppe_evaluator.sim_force_vest}")
        elif key in (ord("f"), ord("F")):
            fire_sim_active = not fire_sim_active
            if fire_sim_active:
                now_iso = datetime.utcnow().isoformat() + "Z"
                fire_incident = {
                    "incident_id": f"HAZ-{int(time.time()) % 1000000:06d}",
                    "facility_id": args.facility,
                    "zone_id": args.zone,
                    "zone_name": ZONE_NAME,
                    "camera_id": CAMERA_ID,
                    "source_event_type": "FIRE",
                    "priority": "P3",
                    "timestamp": now_iso,
                    "confidence": 0.96,
                    "status": "OPEN",
                    "required_action": "EVACUATE ZONE IMMEDIATELY — SIREN ACTIVATED — DISPATCH FIRE BRIGADE",
                    "decision_reason": "Visual flame detection confirmed by IR sensor telemetry -> Critical P3 Emergency Takeover.",
                    "evidence_image": "https://images.unsplash.com/photo-1542385151-efd9000785a0?auto=format&fit=crop&w=800&q=80",
                    "vision_evidence": {"fire": True, "smoke": True},
                    "sensor_evidence": {"flame_detected": True, "gas_sensor_raw": 780, "smoke_index": 0.78},
                    "network_mode": "LAN",
                }
                print("\n[CRITICAL P3] Fire Triggered via Keyboard -> Pushing to Firestore & Dashboard!")
                firestore.push_incident(fire_incident)
                firestore.update_zone_priority(args.zone, "P3", fire_detected=True, smoke_detected=True)
            else:
                firestore.update_zone_priority(args.zone, "P0", fire_detected=False, smoke_detected=False)
        elif key in (ord("s"), ord("S")):
            smoke_sim_active = not smoke_sim_active
            if smoke_sim_active:
                now_iso = datetime.utcnow().isoformat() + "Z"
                smoke_incident = {
                    "incident_id": f"SMK-{int(time.time()) % 1000000:06d}",
                    "facility_id": args.facility,
                    "zone_id": args.zone,
                    "zone_name": ZONE_NAME,
                    "camera_id": CAMERA_ID,
                    "source_event_type": "SMOKE",
                    "priority": "P2",
                    "timestamp": now_iso,
                    "confidence": 0.88,
                    "status": "OPEN",
                    "required_action": "INSPECTION REQUIRED — VISUAL SMOKE CLOUD DETECTED",
                    "decision_reason": "Visual smoke column detected by AI vision service -> P2 Advisory Alert.",
                    "evidence_image": "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=80",
                    "vision_evidence": {"fire": False, "smoke": True},
                    "network_mode": "LAN",
                }
                print("\n[WARNING P2] Smoke Triggered via Keyboard -> Pushing to Firestore!")
                firestore.push_incident(smoke_incident)
                firestore.update_zone_priority(args.zone, "P2", smoke_detected=True)
            else:
                firestore.update_zone_priority(args.zone, "P0", smoke_detected=False)

    if not is_synthetic:
        cap.release()
    cv2.destroyAllWindows()
    print("[Shutdown] Vision Pipeline terminated cleanly.")

if __name__ == "__main__":
    main()
