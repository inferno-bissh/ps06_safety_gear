import json
import cv2
import time
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Dict, Optional, List
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

_WORKERS_LOCK = threading.Lock()
_ACTIVE_WORKERS: List[dict] = []

_HAZARD_LOCK = threading.Lock()
_HAZARD_STATE: Dict[str, any] = {
    "smoke": False,
    "smoke_index": 0.0,
    "fire": False,
    "last_updated": 0.0,
}

def get_hazard_state() -> dict:
    with _HAZARD_LOCK:
        return dict(_HAZARD_STATE)

def set_hazard_state(smoke: Optional[bool] = None, fire: Optional[bool] = None, smoke_index: Optional[float] = None):
    with _HAZARD_LOCK:
        if smoke is not None:
            _HAZARD_STATE["smoke"] = smoke
            if smoke and smoke_index is not None:
                _HAZARD_STATE["smoke_index"] = smoke_index
            elif not smoke:
                _HAZARD_STATE["smoke_index"] = 0.0
        if fire is not None:
            _HAZARD_STATE["fire"] = fire
        _HAZARD_STATE["last_updated"] = time.time()

_STANDBY_CACHE: Dict[str, bytes] = {}
_CAMERA_SOURCE_CALLBACK = None
_CAMERA_STATUS_CALLBACK = None

def register_camera_callbacks(source_callback=None, status_callback=None):
    """Registers dynamic orchestrator callbacks to allow in-process stream reconfiguration without restarts."""
    global _CAMERA_SOURCE_CALLBACK, _CAMERA_STATUS_CALLBACK
    _CAMERA_SOURCE_CALLBACK = source_callback
    _CAMERA_STATUS_CALLBACK = status_callback

def _get_default_standby_frame(channel: str) -> bytes:
    if channel in _STANDBY_CACHE:
        return _STANDBY_CACHE[channel]
    img = np.zeros((360, 640, 3), dtype=np.uint8)
    img[:] = (20, 26, 36)
    cv2.rectangle(img, (20, 20), (620, 340), (45, 55, 72), 2)
    label = f"[{channel.upper()}] INITIALIZING VIDEO FEED..."
    cv2.putText(img, label, (40, 170), cv2.FONT_HERSHEY_SIMPLEX, 0.60, (0, 220, 255), 2)
    cv2.putText(img, "Connecting to camera hardware stream...", (40, 210), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (160, 180, 200), 1)
    ret, jpeg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 80])
    data = jpeg.tobytes() if ret else b""
    _STANDBY_CACHE[channel] = data
    return data

class MJPEGStreamHandler(BaseHTTPRequestHandler):
    """
    High-performance MJPEG HTTP Streamer.
    Serves multipart/x-mixed-replace live JPEG feeds to any browser with sub-30ms latency.
    """
    def log_message(self, format, *args):
        # Suppress spammy HTTP access logs in terminal
        return

    def do_GET(self):
        path = self.path.strip("/").lower()

        # 1. Health & Status
        if path == "" or path == "health":
            body = b'{"status":"ONLINE","engine":"SafetyIntel MJPEG Streamer"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
            return

        # 2. Live Active Workers State
        elif path == "api/workers" or path == "workers":
            with _WORKERS_LOCK:
                data = json.dumps(_ACTIVE_WORKERS).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(data)
            return

        # 3. Single Frame Snapshots (JPEG)
        elif "snapshot" in path:
            cam = "cctv1" if "cctv1" in path else ("cctv2" if "cctv2" in path else "composite")
            with _FRAME_LOCK:
                frame_bytes = _ACTIVE_FRAMES.get(cam) or _ACTIVE_FRAMES.get("cctv1") or _ACTIVE_FRAMES.get("composite")
            if not frame_bytes:
                frame_bytes = _get_default_standby_frame(cam)
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(frame_bytes)))
            self.end_headers()
            self.wfile.write(frame_bytes)
            return

        # 4. Enrolled Face Roster
        elif path == "api/roster" or path == "api/enrolled":
            try:
                from face_engine import WorkerFaceEngine
                fe = WorkerFaceEngine()
                roster = fe.database.get("names", [])
            except Exception:
                roster = []
            body = json.dumps({"enrolled_workers": roster, "count": len(roster)}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
            return

        # 5. Live Hazard State (Smoke / Fire)
        elif path == "api/hazard" or path == "api/hazard/status":
            with _HAZARD_LOCK:
                data = json.dumps(_HAZARD_STATE).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(data)
            return

        # 6. Live Camera Sources & Status
        elif path == "api/cameras/source" or path == "api/cameras/status" or path == "api/camera/config":
            data = {}
            if _CAMERA_STATUS_CALLBACK:
                try:
                    data = _CAMERA_STATUS_CALLBACK()
                except Exception as e:
                    data = {"error": str(e)}
            body = json.dumps(data).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
            return

        # 7. Multipart MJPEG Streaming Channels
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

                if frame_bytes is None:
                    frame_bytes = _get_default_standby_frame(channel)

                chunk = (
                    b"--FRAME\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    b"Content-Length: " + str(len(frame_bytes)).encode("ascii") + b"\r\n\r\n"
                    + frame_bytes + b"\r\n"
                )
                self.wfile.write(chunk)
                
                # Stream at ~25-30 FPS
                time.sleep(0.035)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        path = self.path.strip("/").lower()
        if path == "api/enroll":
            content_length = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_length)
            try:
                payload = json.loads(post_data.decode("utf-8")) if post_data else {}
                name = payload.get("name", "").strip()
                if not name:
                    self.send_response(400)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(b'{"error": "Worker name is required"}')
                    return

                cam = payload.get("camera", "cctv1").lower()
                with _FRAME_LOCK:
                    frame_bytes = _ACTIVE_FRAMES.get(cam) or _ACTIVE_FRAMES.get("cctv1")

                if not frame_bytes:
                    self.send_response(503)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(b'{"error": "No camera frame available"}')
                    return

                nparr = np.frombuffer(frame_bytes, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                from face_engine import WorkerFaceEngine
                fe = WorkerFaceEngine()
                success = fe.enroll_worker(name, [frame], save_crops=True)

                self.send_response(200 if success else 422)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                if success:
                    res = json.dumps({"status": "SUCCESS", "message": f"Worker '{name}' enrolled into Face ID database!"})
                else:
                    res = json.dumps({"status": "FAIL", "message": "No clear face detected in the live frame. Please face the camera directly."})
                self.wfile.write(res.encode("utf-8"))
                return
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
                return

        elif "api/hazard" in path:
            content_length = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_length)
            try:
                payload = json.loads(post_data.decode("utf-8")) if post_data else {}
                with _HAZARD_LOCK:
                    if "reset" in path or "clear" in path or payload.get("reset"):
                        _HAZARD_STATE["smoke"] = False
                        _HAZARD_STATE["smoke_index"] = 0.0
                        _HAZARD_STATE["fire"] = False
                    elif "smoke" in path:
                        active = payload.get("smoke") if "smoke" in payload else payload.get("active", True)
                        _HAZARD_STATE["smoke"] = bool(active)
                        _HAZARD_STATE["smoke_index"] = float(payload.get("smoke_index", 0.88 if active else 0.0))
                    elif "fire" in path:
                        active = payload.get("fire") if "fire" in payload else payload.get("active", True)
                        _HAZARD_STATE["fire"] = bool(active)
                    _HAZARD_STATE["last_updated"] = time.time()
                    resp = json.dumps({"status": "SUCCESS", "hazard_state": _HAZARD_STATE}).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(resp)
                return
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
                return

        elif "api/cameras/source" in path or "api/camera/config" in path:
            content_length = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_length)
            try:
                payload = json.loads(post_data.decode("utf-8")) if post_data else {}
                channel = payload.get("channel", "cctv2").lower()
                source = payload.get("source", "").strip()
                action = payload.get("action", "connect").lower()

                if _CAMERA_SOURCE_CALLBACK:
                    success, msg = _CAMERA_SOURCE_CALLBACK(channel, source, action)
                    status_code = 200 if success else 400
                    resp = json.dumps({"status": "SUCCESS" if success else "FAIL", "message": msg, "source": source})
                else:
                    status_code = 503
                    resp = json.dumps({"status": "ERROR", "message": "Camera controller callback not registered"})

                body = resp.encode("utf-8")
                self.send_response(status_code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(body)
                return
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
                return

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

    def update_workers(self, workers_data: list):
        """Updates active tracked worker metadata for dashboard live polling."""
        global _ACTIVE_WORKERS
        with _WORKERS_LOCK:
            _ACTIVE_WORKERS = list(workers_data)

    def stop(self):
        if self.server:
            self.server.shutdown()
            self.server.server_close()
            print("[WebStreamer] Stopped video broadcaster.")
