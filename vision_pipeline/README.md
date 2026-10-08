# SafetyIntel AI Vision Pipeline (PS-06)

Real-time YOLOv8 object detection, worker tracking, PPE compliance verification, and Cloud Firestore integration for Problem Statement 06.

---

## 🚀 Quick Start

### 1. Requirements
Ensure dependencies are installed:
```bash
pip install ultralytics opencv-python requests numpy
```

### 2. Run the Vision Pipeline
From the project root:
```bash
python vision_pipeline/main.py
```

Or specify a camera source or video file:
```bash
python vision_pipeline/main.py --source 0 --facility STPI_HOST_01 --zone WELDING_ZONE
```
*(If no physical webcam is plugged in, the pipeline automatically runs an animated synthetic industrial test generator so you can test full inference and Firestore synchronization without a camera).*

---

## 🎮 Interactive Keyboard Controls (Inside OpenCV Window)

| Key | Action | Description |
| :--- | :--- | :--- |
| **`H`** | **Toggle Helmet Override** | Cycle between `AUTO` (vision color detection), `FORCE FAIL` (missing helmet), and `FORCE PASS`. |
| **`V`** | **Toggle Vest Override** | Cycle between `AUTO`, `FORCE FAIL` (missing vest), and `FORCE PASS`. |
| **`F`** | **Simulate Fire (P3)** | Triggers a **Critical P3 Fire Event** and immediately sends it to Cloud Firestore (launches P3 Screen Takeover on the web dashboard!). |
| **`S`** | **Simulate Smoke (P2)** | Triggers a **P2 Smoke Event** and pushes to Cloud Firestore. |
| **`Q`** / **`ESC`** | **Quit** | Exits the camera loop and closes the OpenCV GUI window. |

---

## 🧠 Architectural Highlights
- **Model:** YOLOv8 nano (`yolov8n.pt`) with real-time ByteTrack worker tracking.
- **PPE Verification:** Evaluates head (hardhat) and torso (high-visibility vest) regions.
- **Temporal Confirmation:** A violation must persist for $\ge 5$ consecutive frames before raising an incident to prevent false flickers.
- **Live Cloud Sync:** Real-time push to Cloud Firestore (`facilities/STPI_HOST_01/incidents`), which immediately displays on the Next.js Operations Console.
