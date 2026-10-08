# Phase 1 Verification Plan: Low-Latency Multi-Threaded Camera Ingestion

## 1. Scope & Objective
Validate [`vision_pipeline/stream_manager.py`](../vision_pipeline/stream_manager.py) (`ThreadedCameraStream`).
Ensures camera streams (integrated laptop webcams, USB webcams, and mobile phones running IP Webcam over Wi-Fi / RTSP / HTTP) are continuously ingested on decoupled daemon threads with zero buffer accumulation and sub-50ms latency drift.

---

## 2. Technical Invariants
1. `cv2.VideoCapture` must be non-blocking with `CAP_PROP_BUFFERSIZE = 1`.
2. Stale frames must be discarded if the inference pipeline takes longer than the stream's frame interval.
3. Thread safe reads via `threading.Lock`.
4. Graceful handling of disconnected streams with synthetic industrial fallback or reconnect attempts.

---

## 3. Test Cases & Acceptance Criteria

### Test Case 1.1: Web Camera / Local Source Stream
* **Input:** Integrated webcam (`0`) or synthetic video feed.
* **Expected:** Ingestion thread starts, `get_latest_frame()` returns valid `(frame, timestamp)` with timestamp variance $< 100\text{ms}$.
* **Pass/Fail:** Pass if $\ge 60$ frames grabbed without blocking the caller.

### Test Case 1.2: Disconnected / Invalid Stream Handling
* **Input:** Invalid source `http://192.168.1.999:8080/video`.
* **Expected:** Stream manager does not crash; falls back gracefully to synthetic industrial frame generator or logs clean warning without locking the main thread.
* **Pass/Fail:** Pass if main thread continues running at $\ge 25\text{ FPS}$.

### Test Case 1.3: Mobile Wi-Fi Latency Drift Test
* **Input:** Android/iOS IP Webcam HTTP MJPEG feed (`http://<phone_ip>:8080/video`).
* **Procedure:** Introduce an artificial 200ms processing delay in the consumer loop for 20 frames.
* **Expected:** When processing resumes, the next frame consumed is the instantaneous current frame, NOT the buffered 200ms-old frame.
* **Pass/Fail:** Pass if buffer latency stays $< 100\text{ms}$.

---

## 4. Verification Command
```powershell
python vision_pipeline/tests/test_stream_ingestion.py
```
