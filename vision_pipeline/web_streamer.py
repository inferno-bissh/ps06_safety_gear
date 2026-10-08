import cv2
import time
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Dict, Optional
import numpy as np

# Global in-memory frame cache
_FRAME_LOCK = threading.Lock()
_ACTIVE_FRAMES: Dict[str, Optional[bytes]] = {
    "cctv1": None,
    "cctv2": None,
    "cctv3": None,
    "cctv4": None,
    "composite": None,
}

class MJPEGStreamHandler(BaseHTTPRequestHandler):
    """
    High-performance MJPEG HTTP Streamer.
    Serves multipart/x-mixed-replace live JPEG feeds to any browser with sub-30ms latency.
    """
    def log_message(self, format, *args):
        # Suppress spammy HTTP access logs in terminal
        return

    def do_GET(self):
        # Determine requested stream channel
        path = self.path.strip("/").lower()
        channel = "composite"
        if "cctv1" in path:
            channel = "cctv1"
        elif "cctv2" in path:
            channel = "cctv2"
        elif "cctv3" in path:
            channel = "cctv3"
        elif "cctv4" in path:
            channel = "cctv4"
        elif "composite" in path or "all" in path:
            channel = "composite"
        elif path == "" or path == "health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b'{"status":"ONLINE","engine":"SafetyIntel MJPEG Streamer"}')
            return

        # Start multipart MJPEG stream
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Age", "0")
        self.send_header("Cache-Control", "no-cache, private")
        self.send_header("Pragma", "no-cache")
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=FRAME")
        self.end_headers()

        try:
            while True:
                with _FRAME_LOCK:
                    frame_bytes = _ACTIVE_FRAMES.get(channel) or _ACTIVE_FRAMES.get("composite")

                if frame_bytes is not None:
                    self.wfile.write(b"--FRAME\r\n")
                    self.send_header("Content-Type", "image/jpeg")
                    self.send_header("Content-Length", str(len(frame_bytes)))
                    self.end_headers()
                    self.wfile.write(frame_bytes)
                    self.wfile.write(b"\r\n")
                
                # Stream at ~25-30 FPS
                time.sleep(0.035)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            pass

class WebStreamBroadcaster:
    """
    Manages background ThreadingHTTPServer on port 5000 to broadcast
    real-time annotated frames to the Next.js Operations Console.
    """
    def __init__(self, host: str = "0.0.0.0", port: int = 5000):
        self.host = host
        self.port = port
        self.server: Optional[ThreadingHTTPServer] = None
        self.thread: Optional[threading.Thread] = None
        self.jpeg_params = [int(cv2.IMWRITE_JPEG_QUALITY), 75]

    def start(self):
        """Starts HTTP streaming server on background daemon thread."""
        try:
            self.server = ThreadingHTTPServer((self.host, self.port), MJPEGStreamHandler)
            self.thread = threading.Thread(target=self.server.serve_forever, daemon=True, name="MJPEGServerThread")
            self.thread.start()
            print(f"[WebStreamer] Live MJPEG video broadcaster active at http://localhost:{self.port}/")
            print(f"  -> CCTV 1: http://localhost:{self.port}/video/cctv1")
            print(f"  -> CCTV 2: http://localhost:{self.port}/video/cctv2")
            print(f"  -> All Feeds: http://localhost:{self.port}/video/composite")
        except Exception as e:
            print(f"[WebStreamer Error] Could not bind port {self.port}: {e}")

    def update_frame(self, channel: str, frame: np.ndarray):
        """Encodes and updates the active JPEG frame for a specific camera channel."""
        if frame is None or frame.size == 0:
            return

        ret, buffer = cv2.imencode(".jpg", frame, self.jpeg_params)
        if ret:
            with _FRAME_LOCK:
                _ACTIVE_FRAMES[channel] = buffer.tobytes()

    def stop(self):
        if self.server:
            self.server.shutdown()
            self.server.server_close()
            print("[WebStreamer] Stopped video broadcaster.")
