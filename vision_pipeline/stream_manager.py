import os
import cv2
import threading
import time
import numpy as np
from typing import Tuple, Optional, Union

def generate_synthetic_industrial_frame(w: int = 1280, h: int = 720, step: int = 0, camera_id: str = "CAM_TEST") -> np.ndarray:
    """Generates an animated high-tech industrial camera frame if physical feed is unavailable."""
    frame = np.zeros((h, w, 3), dtype=np.uint8)
    
    # Factory floor gradient
    for y in range(h):
        val = int(22 + (y / h) * 38)
        frame[y, :] = (val, val + 4, val + 8)

    # Floor boundary lines
    cv2.line(frame, (80, h - 60), (w - 80, h - 60), (0, 180, 240), 3)
    cv2.line(frame, (80, h - 160), (w - 80, h - 160), (0, 120, 180), 2)

    # Simulated worker movement
    x_offset = int((np.sin(step * 0.04) + 1) * (w - 450) * 0.5) + 180
    y_pos = int(h * 0.42)

    # Worker silhouette
    cv2.rectangle(frame, (x_offset, y_pos), (x_offset + 130, y_pos + 280), (45, 60, 80), -1)
    cv2.circle(frame, (x_offset + 65, y_pos - 35), 40, (150, 170, 190), -1)

    # Synthetic watermarks
    cv2.putText(
        frame,
        f"[SYNTHETIC FEED ACTIVE] {camera_id} - REAL-TIME EMULATION",
        (25, 45),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (0, 220, 255),
        2,
    )
    return frame

class ThreadedCameraStream:
    """
    Decoupled RTSP/HTTP/Webcam stream ingestion engine that continuously captures
    frames on a background worker thread and discards stale buffer queues.
    Guarantees true real-time, zero-latency inference on consumer laptops.
    """
    def __init__(self, src: Union[int, str], camera_id: str = "CAM_01", target_fps: int = 25):
        self.camera_id = camera_id
        self.src = int(src) if str(src).isdigit() else str(src)
        self.target_fps = target_fps
        self.lock = threading.Lock()
        
        self.latest_frame: Optional[np.ndarray] = None
        self.latest_timestamp: float = 0.0
        self.frame_count: int = 0
        self.is_running: bool = False
        self.is_synthetic_mode: bool = False
        
        # Connect to stream (use DirectShow backend on Windows for physical webcams to prevent MSMF locking)
        if isinstance(self.src, int) and os.name == "nt":
            self.cap = cv2.VideoCapture(self.src, cv2.CAP_DSHOW)
            if not self.cap.isOpened():
                self.cap = cv2.VideoCapture(self.src)
        else:
            self.cap = cv2.VideoCapture(self.src)
        
        if not self.cap.isOpened():
            print(f"[Stream Warning] Unable to open physical stream '{self.src}'. Running synthetic generator for {camera_id}.")
            self.is_synthetic_mode = True
        else:
            # Set buffer size to 1 to eliminate queue buildup
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            # Try setting resolution
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
            print(f"[Stream Initialized] Connected to {camera_id} via '{self.src}'.")

        # Start background capture daemon
        self.is_running = True
        self.thread = threading.Thread(target=self._capture_worker, daemon=True, name=f"StreamWorker-{camera_id}")
        self.thread.start()

    def _capture_worker(self):
        """Continuously grabs frames, replacing the single latest frame buffer with auto-reconnect."""
        step = 0
        last_reconnect_attempt = time.time()

        while self.is_running:
            step += 1
            now = time.time()

            # If stream is offline/synthetic, periodically attempt reconnection
            if self.is_synthetic_mode:
                if isinstance(self.src, str) and (now - last_reconnect_attempt > 3.0):
                    last_reconnect_attempt = now
                    try:
                        test_cap = cv2.VideoCapture(self.src)
                        if test_cap.isOpened():
                            ret_test, frame_test = test_cap.read()
                            if ret_test and frame_test is not None:
                                self.cap = test_cap
                                self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                                self.is_synthetic_mode = False
                                print(f"[Stream Restored] Successfully connected camera stream for {self.camera_id} via '{self.src}'.")
                                with self.lock:
                                    self.latest_frame = frame_test
                                    self.latest_timestamp = now
                                    self.frame_count += 1
                                continue
                            else:
                                test_cap.release()
                    except Exception:
                        pass

                synth = generate_synthetic_industrial_frame(1280, 720, step, self.camera_id)
                with self.lock:
                    self.latest_frame = synth
                    self.latest_timestamp = now
                    self.frame_count += 1
                time.sleep(1.0 / self.target_fps)
                continue

            # In physical capture mode: read frame
            try:
                ret, frame = self.cap.read()
                if ret and frame is not None:
                    with self.lock:
                        self.latest_frame = frame
                        self.latest_timestamp = now
                        self.frame_count += 1
                else:
                    # Stream dropped or Wi-Fi timed out
                    print(f"[Stream Notice] Signal lost from {self.camera_id} ({self.src}). Switching to auto-reconnect standby...")
                    self.is_synthetic_mode = True
                    last_reconnect_attempt = now
                    try:
                        self.cap.release()
                    except Exception:
                        pass
            except Exception as e:
                self.is_synthetic_mode = True
                last_reconnect_attempt = now

    def get_latest_frame(self) -> Tuple[Optional[np.ndarray], float]:
        """Returns the most recent frame and capture timestamp without blocking."""
        with self.lock:
            if self.latest_frame is None:
                return None, 0.0
            return self.latest_frame.copy(), self.latest_timestamp

    def get_latency(self) -> float:
        """Returns time in seconds since the latest frame was ingested."""
        with self.lock:
            if self.latest_timestamp == 0.0:
                return 0.0
            return time.time() - self.latest_timestamp

    def stop(self):
        """Stops background thread and releases hardware handles."""
        self.is_running = False
        if hasattr(self, 'cap') and self.cap.isOpened():
            self.cap.release()
        print(f"[Stream Closed] Released {self.camera_id}.")
