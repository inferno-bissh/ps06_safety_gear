import os
import cv2
import threading
import time
import socket
from urllib.parse import urlparse
import numpy as np
from typing import Tuple, Optional, Union

# Set FFmpeg network timeout and low-latency flags to prevent buffer accumulation on IP cameras
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "timeout;2000000|rw_timeout;2000000|fflags;nobuffer|flags;low_delay"

def is_host_reachable(url: str, timeout: float = 0.4) -> bool:
    """Pre-checks network reachability of IP camera endpoint to prevent FFmpeg crashes."""
    try:
        parsed = urlparse(url)
        host = parsed.hostname
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        if not host:
            return False
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False

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
        self.lock = threading.RLock()
        
        self.latest_frame: Optional[np.ndarray] = None
        self.latest_timestamp: float = 0.0
        self.frame_count: int = 0
        self.is_running: bool = False
        self.is_synthetic_mode: bool = False
        
        # Connect to stream with resilient backend fallback on Windows
        self.cap = None
        if isinstance(self.src, int) and os.name == "nt":
            for backend in [cv2.CAP_DSHOW, cv2.CAP_MSMF, cv2.CAP_ANY]:
                temp_cap = cv2.VideoCapture(self.src, backend)
                if temp_cap.isOpened():
                    ret, test_frame = temp_cap.read()
                    if ret and test_frame is not None:
                        self.cap = temp_cap
                        break
                    temp_cap.release()
            if self.cap is None:
                self.cap = cv2.VideoCapture(self.src)
        elif isinstance(self.src, str) and (self.src.startswith("http://") or self.src.startswith("https://") or self.src.startswith("rtsp://")):
            # Auto-normalize IP Webcam endpoints: append /video if port 8080 or 4747 lacks endpoint
            if (":8080" in self.src or ":4747" in self.src) and not any(ep in self.src for ep in ["/video", "/videofeed", "/mjpeg", "/feed"]):
                self.src = self.src.rstrip("/") + "/video"
            # Connect network streams asynchronously in background thread to guarantee sub-50ms engine startup
            self.is_synthetic_mode = True
            print(f"[Stream Manager] Registering network camera {camera_id} at '{self.src}' (asynchronous auto-reconnect active).")
        else:
            self.cap = cv2.VideoCapture(self.src)
        
        if not self.is_synthetic_mode:
            if self.cap is None or not self.cap.isOpened():
                print(f"[Stream Warning] Unable to open physical stream '{self.src}'. Running synthetic generator for {camera_id}.")
                self.is_synthetic_mode = True
            else:
                self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
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

            # If stream is offline/synthetic, periodically attempt reconnection for BOTH physical webcam (int) and network IP (str)
            if self.is_synthetic_mode:
                if now - last_reconnect_attempt > 2.0:
                    last_reconnect_attempt = now
                    try:
                        test_cap = None
                        if isinstance(self.src, int):
                            backends = [cv2.CAP_DSHOW, cv2.CAP_MSMF, cv2.CAP_ANY] if os.name == "nt" else [cv2.CAP_ANY]
                            for backend in backends:
                                c = cv2.VideoCapture(self.src, backend)
                                if c.isOpened():
                                    ret_test, frame_test = c.read()
                                    if ret_test and frame_test is not None:
                                        test_cap = c
                                        break
                                    c.release()
                        else:
                            can_connect = True
                            if str(self.src).startswith("http://") or str(self.src).startswith("https://"):
                                can_connect = is_host_reachable(str(self.src), timeout=0.4)
                            if can_connect:
                                c = cv2.VideoCapture(self.src)
                                if c.isOpened():
                                    ret_test, frame_test = c.read()
                                    if ret_test and frame_test is not None:
                                        test_cap = c
                                    else:
                                        c.release()

                        if test_cap is not None and test_cap.isOpened():
                            self.cap = test_cap
                            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                            self.is_synthetic_mode = False
                            print(f"[Stream Restored] Successfully connected camera feed for {self.camera_id} via '{self.src}'.")
                            with self.lock:
                                self.latest_frame = frame_test
                                self.latest_timestamp = now
                                self.frame_count += 1
                            continue
                    except Exception:
                        pass

                # Serve lightweight standby frame without burning CPU on animated gradient rendering
                if step % 15 == 0 or self.latest_frame is None:
                    synth = generate_synthetic_industrial_frame(640, 360, 0, self.camera_id)
                    with self.lock:
                        self.latest_frame = synth
                        self.latest_timestamp = now
                        self.frame_count += 1
                time.sleep(0.08)
                continue

            # In physical capture mode: read frame
            try:
                ret, frame = self.cap.read()
                if ret and frame is not None:
                    # If frame exceeds 1280 wide (e.g. 1080p mobile camera), downscale immediately to slash GIL/memory load
                    if frame.shape[1] > 1280:
                        frame = cv2.resize(frame, (1280, 720))
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

    def get_latest_frame(self, copy: bool = False) -> Tuple[Optional[np.ndarray], float]:
        """Returns the most recent frame and capture timestamp without blocking."""
        with self.lock:
            if self.latest_frame is None:
                return None, 0.0
            return (self.latest_frame.copy() if copy else self.latest_frame), self.latest_timestamp

    def get_latency(self) -> float:
        """Returns time in seconds since the latest frame was ingested."""
        with self.lock:
            if self.latest_timestamp == 0.0:
                return 0.0
            return time.time() - self.latest_timestamp

    def update_source(self, new_src: Union[str, int]) -> bool:
        """
        Dynamically updates the stream source URL or device index in real time.
        Safely releases previous video capture resources without terminating background worker.
        """
        if isinstance(new_src, str):
            new_src = new_src.strip().strip('"').strip("'")
            if (":8080" in new_src or ":4747" in new_src) and not any(ep in new_src for ep in ["/video", "/videofeed", "/mjpeg", "/feed"]):
                new_src = new_src.rstrip("/") + "/video"
        elif isinstance(new_src, (int, float)):
            new_src = int(new_src)

        with self.lock:
            self.src = new_src
            self.is_synthetic_mode = True
            if self.cap is not None:
                try:
                    self.cap.release()
                except Exception:
                    pass
                self.cap = None

        print(f"[Stream Manager] Dynamically switched {self.camera_id} source to '{self.src}'. Triggering immediate reconnection...")
        return True

    def disconnect(self):
        """Safely disconnects current stream and puts feed into standby synthetic mode."""
        with self.lock:
            self.src = "STANDBY"
            self.is_synthetic_mode = True
            if self.cap is not None:
                try:
                    self.cap.release()
                except Exception:
                    pass
                self.cap = None
        print(f"[Stream Manager] Disconnected stream for {self.camera_id}. Standby mode active.")

    def get_status(self) -> dict:
        """Returns live stream connectivity status and telemetry."""
        with self.lock:
            lat = 0.0
            if self.latest_timestamp != 0.0:
                lat = time.time() - self.latest_timestamp
            return {
                "camera_id": self.camera_id,
                "source": str(self.src),
                "is_connected": not self.is_synthetic_mode and self.cap is not None and self.cap.isOpened(),
                "is_synthetic": self.is_synthetic_mode,
                "frame_count": self.frame_count,
                "latency_sec": round(lat, 3),
            }

    def stop(self):
        """Stops background thread and releases hardware handles."""
        self.is_running = False
        if hasattr(self, 'cap') and self.cap is not None and self.cap.isOpened():
            self.cap.release()
        print(f"[Stream Closed] Released {self.camera_id}.")
