import os
import sys
import cv2
import time
import json
import argparse
import urllib.request
from typing import Optional, List
import numpy as np
from pathlib import Path

# Add vision_pipeline to sys.path
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from face_engine import WorkerFaceEngine

KNOWN_WORKERS_DIR = BASE_DIR / "known_workers"
AIML_TEST_DATA_DIR = BASE_DIR.parent / "aiml_test_data"
ROSTER_JSON_PATH = AIML_TEST_DATA_DIR / "roster.json"

def fetch_stream_frame(stream_url: str = "http://localhost:5000/snapshot/cctv1") -> Optional[np.ndarray]:
    """Fetches a single JPEG frame from the running orchestrator web streamer."""
    try:
        req = urllib.request.Request(stream_url, headers={"User-Agent": "SafetyIntel-Enrollment"})
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = resp.read()
            if data:
                nparr = np.frombuffer(data, np.uint8)
                return cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    except Exception:
        pass
    return None

def is_streamer_online(base_url: str = "http://localhost:5000") -> bool:
    """Checks if the background orchestrator is currently serving on port 5000."""
    try:
        with urllib.request.urlopen(f"{base_url}/health", timeout=1.5) as resp:
            return resp.status == 200
    except Exception:
        return False

def enroll_from_stream(
    name: str,
    engine: WorkerFaceEngine,
    num_samples: int = 5,
    camera: str = "cctv1",
    auto_capture: bool = False,
):
    """
    Enrolls a team member by capturing frames directly from the live CCTV 1 stream.
    Eliminates Windows MSMF camera locking collisions while orchestrator is running.
    """
    snapshot_url = f"http://localhost:5000/snapshot/{camera}"
    print(f"\n=======================================================")
    print(f" [FACE ID ENROLLMENT] Enrolling '{name}' via Live Stream ({camera})")
    print(f" Target Test Data: {AIML_TEST_DATA_DIR / 'faces' / name}")
    print(f"=======================================================")
    print(" Instructions:")
    print("  1. Look directly at CCTV 1 (webcam).")
    print("  2. A green box will indicate detected face.")
    print("  3. Press SPACE to capture each sample (or use slight slant/tilt).")
    print("  4. Press 'Q' to abort.")
    print(f"=======================================================\n")

    samples = []
    window_name = f"SafetyIntel Face ID Enrollment - {name}"
    last_auto_capture_time = time.time()

    try:
        while len(samples) < num_samples:
            frame = fetch_stream_frame(snapshot_url)
            if frame is None:
                # Try fallback to composite
                frame = fetch_stream_frame("http://localhost:5000/snapshot/composite")
            if frame is None:
                print(f"[Enroll Error] Unable to fetch frame from {snapshot_url}. Is orchestrator running?")
                time.sleep(0.5)
                continue

            display = frame.copy()
            h, w = display.shape[:2]

            # Detect face for live visualization
            face_detected = False
            best_face = None
            if engine.detector:
                engine.detector.setInputSize((w, h))
                _, faces = engine.detector.detect(frame)
                if faces is not None and len(faces) > 0:
                    face_detected = True
                    best_face = faces[0]
                    fx, fy, fw, fh = map(int, best_face[:4])
                    # Draw futuristic enrollment target reticle
                    cv2.rectangle(display, (fx, fy), (fx + fw, fy + fh), (0, 255, 120), 2)
                    cv2.putText(
                        display,
                        f"Face Detected ({fw}x{fh})",
                        (fx, max(20, fy - 10)),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.55,
                        (0, 255, 120),
                        2,
                    )

            # Header HUD
            cv2.rectangle(display, (0, 0), (w, 60), (20, 25, 30), -1)
            cv2.putText(
                display,
                f"FACE ID ENROLLMENT: {name.upper()}",
                (20, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.75,
                (255, 255, 255),
                2,
            )
            status_text = f"Samples: {len(samples)}/{num_samples} | " + (
                "READY TO CAPTURE [PRESS SPACE]" if face_detected else "NO FACE DETECTED - LOOK AT CAMERA"
            )
            status_color = (0, 255, 120) if face_detected else (0, 140, 255)
            cv2.putText(display, status_text, (20, 52), cv2.FONT_HERSHEY_SIMPLEX, 0.5, status_color, 1)

            cv2.imshow(window_name, display)
            k = cv2.waitKey(40) & 0xFF

            # Capture trigger
            should_capture = False
            if k == ord(' '):
                should_capture = True
            elif auto_capture and face_detected and (time.time() - last_auto_capture_time >= 1.5):
                should_capture = True
                last_auto_capture_time = time.time()
            elif k == ord('q'):
                print("Enrollment cancelled by user.")
                cv2.destroyAllWindows()
                return

            if should_capture:
                if not face_detected:
                    print("  [!] Cannot capture: No face detected in frame. Please face the camera.")
                    continue
                samples.append(frame.copy())
                print(f"  -> Captured sample {len(samples)}/{num_samples} for '{name}'")
                # Visual capture flash
                flash = display.copy()
                cv2.rectangle(flash, (0, 0), (w, h), (255, 255, 255), 8)
                cv2.imshow(window_name, flash)
                cv2.waitKey(120)

    except KeyboardInterrupt:
        print("Enrollment interrupted.")
    finally:
        cv2.destroyAllWindows()

    if samples:
        print(f"\nProcessing {len(samples)} samples with SFace 128-D neural engine...")
        success = engine.enroll_worker(name, samples, save_crops=True)
        if success:
            print(f"\n=======================================================")
            print(f" [SUCCESS] Worker '{name}' registered in Face ID database!")
            print(f" Test Data Location: {AIML_TEST_DATA_DIR / 'faces' / name}")
            print(f" Enrolled Database:  {engine.db_path}")
            print(f" Real-time detector will now identify '{name}' automatically!")
            print(f"=======================================================\n")
        else:
            print(f"\n[Error] Failed to enroll '{name}'. Please try again with better lighting.\n")

def enroll_from_webcam(
    name: str,
    engine: WorkerFaceEngine,
    num_samples: int = 5,
    camera_idx: int = 0,
):
    """Interactively captures webcam images of a team member to enroll them."""
    cap = cv2.VideoCapture(camera_idx)
    if not cap.isOpened():
        print(f"[Enroll Error] Unable to open webcam index {camera_idx}.")
        print("Note: If multicam_orchestrator is running, use live stream enrollment instead:")
        print(f"  python vision_pipeline/enroll_workers.py --enroll \"{name}\" --from-stream")
        return

    print(f"\n[ENROLLMENT] Enrolling '{name}'. Look at camera index {camera_idx}. Press 'SPACE' to capture, 'Q' to abort.")
    samples = []
    window_name = f"SafetyIntel Worker Enrollment - {name}"

    while len(samples) < num_samples:
        ret, frame = cap.read()
        if not ret:
            break

        display = frame.copy()
        cv2.putText(
            display,
            f"Enrolling: {name} ({len(samples)}/{num_samples} captured)",
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 120),
            2,
        )
        cv2.putText(display, "Press SPACE to take photo, Q to quit", (20, 75), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 220, 240), 1)
        cv2.imshow(window_name, display)

        k = cv2.waitKey(1) & 0xFF
        if k == ord(' '):
            samples.append(frame.copy())
            print(f"  -> Captured sample {len(samples)}/{num_samples}")
            flash = display.copy()
            cv2.rectangle(flash, (0, 0), (display.shape[1], display.shape[0]), (255, 255, 255), 6)
            cv2.imshow(window_name, flash)
            cv2.waitKey(100)
        elif k == ord('q'):
            print("Enrollment aborted.")
            cap.release()
            cv2.destroyAllWindows()
            return

    cap.release()
    cv2.destroyAllWindows()

    if samples:
        success = engine.enroll_worker(name, samples, save_crops=True)
        if success:
            print(f"\n[SUCCESS] Worker '{name}' successfully enrolled into worker_face_db.pkl!\n")

def enroll_from_images(name: str, engine: WorkerFaceEngine, image_paths: List[str]):
    """Enrolls a worker from existing image files on disk."""
    print(f"\n[FILE ENROLLMENT] Enrolling '{name}' from {len(image_paths)} images...")
    images = []
    for p in image_paths:
        path = Path(p)
        if not path.exists():
            print(f"  [Warning] File not found: {p}")
            continue
        img = cv2.imread(str(path))
        if img is not None:
            images.append(img)
            print(f"  -> Loaded image: {path.name}")

    if not images:
        print("[Error] No valid images loaded.")
        return

    success = engine.enroll_worker(name, images, save_crops=True)
    if success:
        print(f"\n[SUCCESS] Worker '{name}' successfully enrolled from image files!\n")

def enroll_from_directory(name: str, engine: WorkerFaceEngine, dir_path: str):
    """Enrolls a worker by loading all photos from a directory."""
    folder = Path(dir_path)
    if not folder.exists() or not folder.is_dir():
        print(f"[Error] Directory not found: {dir_path}")
        return
    valid_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    files = [str(f) for f in folder.iterdir() if f.suffix.lower() in valid_exts]
    enroll_from_images(name, engine, files)

def create_synthetic_portrait(name: str, seed: int = 42) -> np.ndarray:
    """Generates a synthetic portrait image for demo enrollment verification."""
    np.random.seed(seed)
    img = np.zeros((300, 300, 3), dtype=np.uint8)
    bg_col = (50 + seed % 40, 60 + seed % 30, 70 + seed % 50)
    img[:] = bg_col

    center = (150, 140)
    axes = (70, 95)
    skin_col = (140 + seed % 30, 160 + seed % 20, 200 + seed % 30)
    cv2.ellipse(img, center, axes, 0, 0, 360, skin_col, -1)

    cv2.circle(img, (120, 120), 10, (40, 30, 20), -1)
    cv2.circle(img, (180, 120), 10, (40, 30, 20), -1)
    cv2.ellipse(img, (150, 190), (25, 12), 0, 0, 180, (80, 70, 140), -1)
    cv2.ellipse(img, (150, 85), (75, 45), 0, 180, 360, (25, 20, 20), -1)

    cv2.putText(img, name, (20, 280), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    return img

def enroll_demo_roster(engine: WorkerFaceEngine):
    """Pre-populates demonstration roster with standard industrial safety team members."""
    print("\n[DEMO ENROLLMENT] Populating known worker profiles...")
    roster = [
        ("Rahul Sharma", 101),
        ("Amit Patel", 202),
        ("Priya Verma", 303),
        ("Suresh Das", 404),
    ]

    for name, seed in roster:
        portraits = [
            create_synthetic_portrait(name, seed=seed),
            create_synthetic_portrait(name, seed=seed + 1),
            create_synthetic_portrait(name, seed=seed + 2),
        ]
        engine.enroll_worker(name, portraits, save_crops=True)

    print(f"\n[DEMO ENROLLMENT COMPLETE] Enrolled {len(roster)} personnel reference embeddings.\n")

def list_enrolled_workers(engine: WorkerFaceEngine):
    """Lists all enrolled workers and their test data assets."""
    names = engine.database.get("names", [])
    print("\n=======================================================")
    print(f" CURRENTLY ENROLLED PERSONNEL IN FACE ID DATABASE ({len(names)})")
    print("=======================================================")
    if not names:
        print("  (Database is empty)")
    for i, name in enumerate(names):
        test_dir = AIML_TEST_DATA_DIR / "faces" / name
        count = len(list(test_dir.glob("*.jpg"))) if test_dir.exists() else 0
        print(f"  [{i+1:02d}] {name:<24} | Test Photos: {count:02d} | Folder: aiml_test_data/faces/{name}")
    print("=======================================================\n")

def main():
    parser = argparse.ArgumentParser(description="SafetyIntel Worker Face ID Enrollment & AIML Test Data Tool")
    parser.add_argument("--enroll", help="Name of team member to enroll (e.g. 'Dehur', 'Rahul Sharma')")
    parser.add_argument("--from-stream", action="store_true", help="Force enrollment from live CCTV 1 stream (port 5000)")
    parser.add_argument("--webcam", type=int, default=None, help="Enroll directly from webcam index (e.g. --webcam 0)")
    parser.add_argument("--images", nargs="+", help="Enroll from one or more image files on disk")
    parser.add_argument("--dir", help="Enroll from a folder containing photos")
    parser.add_argument("--samples", type=int, default=5, help="Number of facial reference samples to capture (default: 5)")
    parser.add_argument("--auto-capture", action="store_true", help="Auto-capture photos every 1.5 seconds when face is detected")
    parser.add_argument("--delete", help="Name of worker to remove from database")
    parser.add_argument("--list", action="store_true", help="List currently enrolled workers and test data")
    parser.add_argument("--demo", action="store_true", help="Auto-enroll standard demo roster")
    args = parser.parse_args()

    engine = WorkerFaceEngine()

    if args.list:
        list_enrolled_workers(engine)
    elif args.delete:
        engine.delete_worker(args.delete)
    elif args.demo:
        enroll_demo_roster(engine)
    elif args.enroll:
        name = args.enroll.strip()
        if args.images:
            enroll_from_images(name, engine, args.images)
        elif args.dir:
            enroll_from_directory(name, engine, args.dir)
        elif args.webcam is not None:
            enroll_from_webcam(name, engine, num_samples=args.samples, camera_idx=args.webcam)
        else:
            # Intelligent auto-selection: If stream is running, use stream; otherwise use webcam 0
            if args.from_stream or is_streamer_online():
                print("[Auto-Detection] Live orchestrator streamer is ACTIVE on port 5000.")
                print("[Auto-Detection] Enrolling directly from CCTV 1 stream (no camera lock conflicts).")
                enroll_from_stream(name, engine, num_samples=args.samples, auto_capture=args.auto_capture)
            else:
                print("[Auto-Detection] Live orchestrator streamer is offline. Opening webcam 0.")
                enroll_from_webcam(name, engine, num_samples=args.samples, camera_idx=0)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
