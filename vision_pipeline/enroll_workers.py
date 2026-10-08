import os
import cv2
import argparse
import numpy as np
from pathlib import Path
from face_engine import WorkerFaceEngine

KNOWN_WORKERS_DIR = Path(__file__).resolve().parent / "known_workers"

def create_synthetic_portrait(name: str, seed: int = 42) -> np.ndarray:
    """Generates a synthetic portrait image for demo enrollment verification."""
    np.random.seed(seed)
    img = np.zeros((300, 300, 3), dtype=np.uint8)
    # Background tone
    bg_col = (50 + seed % 40, 60 + seed % 30, 70 + seed % 50)
    img[:] = bg_col
    
    # Face oval
    center = (150, 140)
    axes = (70, 95)
    skin_col = (140 + seed % 30, 160 + seed % 20, 200 + seed % 30)
    cv2.ellipse(img, center, axes, 0, 0, 360, skin_col, -1)
    
    # Eyes
    cv2.circle(img, (120, 120), 10, (40, 30, 20), -1)
    cv2.circle(img, (180, 120), 10, (40, 30, 20), -1)
    
    # Mouth
    cv2.ellipse(img, (150, 190), (25, 12), 0, 0, 180, (80, 70, 140), -1)
    
    # Hair
    cv2.ellipse(img, (150, 85), (75, 45), 0, 180, 360, (25, 20, 20), -1)
    
    cv2.putText(img, name, (20, 280), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    return img

def enroll_from_webcam(name: str, engine: WorkerFaceEngine, num_samples: int = 5):
    """Interactively captures webcam images of a team member to enroll them."""
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[Enroll Error] Unable to open webcam index 0.")
        return

    print(f"\n[ENROLLMENT] Enrolling '{name}'. Look at the camera. Press 'SPACE' to capture, 'Q' to abort.")
    samples = []
    
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
        cv2.putText(display, "Press SPACE to take photo", (20, 75), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 220, 240), 1)
        cv2.imshow("SafetyIntel Worker Enrollment", display)
        
        k = cv2.waitKey(1) & 0xFF
        if k == ord(' '):
            samples.append(frame.copy())
            print(f"  -> Captured sample {len(samples)}/{num_samples}")
            cv2.rectangle(display, (0, 0), (display.shape[1], display.shape[0]), (255, 255, 255), 6)
            cv2.imshow("SafetyIntel Worker Enrollment", display)
            cv2.waitKey(100)
        elif k == ord('q'):
            print("Enrollment aborted.")
            cap.release()
            cv2.destroyAllWindows()
            return

    cap.release()
    cv2.destroyAllWindows()
    
    if samples:
        success = engine.enroll_worker(name, samples)
        if success:
            print(f"\n[SUCCESS] Worker '{name}' successfully enrolled into worker_face_db.pkl!\n")

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
        engine.enroll_worker(name, portraits)
        
    print(f"\n[DEMO ENROLLMENT COMPLETE] Enrolled {len(roster)} personnel reference embeddings.\n")

def main():
    parser = argparse.ArgumentParser(description="SafetyIntel Worker Face Enrollment Tool")
    parser.add_argument("--enroll", help="Name of worker to enroll from webcam")
    parser.add_argument("--demo", action="store_true", help="Auto-enroll standard hackathon demonstration team")
    parser.add_argument("--list", action="store_true", help="List currently enrolled workers")
    args = parser.parse_args()

    engine = WorkerFaceEngine()

    if args.list:
        print("\n=== CURRENTLY ENROLLED WORKERS ===")
        for i, name in enumerate(engine.database.get("names", [])):
            print(f"  [{i+1}] {name}")
        print("===================================\n")
    elif args.demo:
        enroll_demo_roster(engine)
    elif args.enroll:
        enroll_from_webcam(args.enroll, engine)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
