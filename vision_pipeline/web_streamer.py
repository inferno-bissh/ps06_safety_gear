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

def get_standby_numpy_frame(channel: str) -> np.ndarray:
    """Generates a high-tech tactical standby card for disconnected/standby camera channels."""
    img = np.zeros((360, 640, 3), dtype=np.uint8)
    # Tactical industrial slate background
    img[:] = (20, 16, 12)

    # Subtle radar grid lines
    for x in range(40, 640, 60):
        cv2.line(img, (x, 30), (x, 330), (32, 26, 20), 1)
    for y in range(40, 360, 60):
        cv2.line(img, (30, y), (610, y), (32, 26, 20), 1)

    # Outer tactical border
    cv2.rectangle(img, (20, 20), (620, 340), (45, 38, 30), 1)

    # High-tech corner brackets
    c_len = 16
    # Top-Left
    cv2.line(img, (20, 20), (20 + c_len, 20), (0, 220, 255), 2)
    cv2.line(img, (20, 20), (20, 20 + c_len), (0, 220, 255), 2)
    # Top-Right
    cv2.line(img, (620, 20), (620 - c_len, 20), (0, 220, 255), 2)
    cv2.line(img, (620, 20), (620, 20 + c_len), (0, 220, 255), 2)
    # Bottom-Left
    cv2.line(img, (20, 340), (20 + c_len, 340), (0, 220, 255), 2)
    cv2.line(img, (20, 340), (20, 340 - c_len), (0, 220, 255), 2)
    # Bottom-Right
    cv2.line(img, (620, 340), (620 - c_len, 340), (0, 220, 255), 2)
    cv2.line(img, (620, 340), (620, 340 - c_len), (0, 220, 255), 2)

    # Center tactical reticle
    cx, cy = 320, 180
    cv2.circle(img, (cx, cy), 32, (50, 42, 32), 1)
    cv2.line(img, (cx - 45, cy), (cx - 20, cy), (0, 200, 255), 1)
    cv2.line(img, (cx + 20, cy), (cx + 45, cy), (0, 200, 255), 1)
    cv2.line(img, (cx, cy - 45), (cx, cy - 20), (0, 200, 255), 1)
    cv2.line(img, (cx, cy + 20), (cx, cy + 45), (0, 200, 255), 1)

    ch = str(channel).lower()
    if ch in ("cctv2", "ward", "phone1"):
        title = "[CCTV 2] PRODUCTION BAY — PHONE 1 STREAM"
        status_txt = "STATUS: STANDBY — AWAITING MOBILE STREAM"
        inst1 = "Launch 'IP Webcam' app on Phone 1 -> Start Server"
        inst2 = "Target Endpoint: http://<PHONE_IP>:8080/video"
        accent_col = (0, 210, 255)
    elif ch in ("cctv3", "left", "phone2"):
        title = "[CCTV 3] SIDE ANGLE LEFT — PHONE 2 STREAM"
        status_txt = "STATUS: STANDBY — AWAITING MOBILE STREAM"
        inst1 = "Launch 'IP Webcam' app on Phone 2 -> Start Server"
        inst2 = "Configure Phone 2 URL in Dashboard Settings"
        accent_col = (255, 180, 0)
    elif ch in ("cctv4", "right", "phone3"):
        title = "[CCTV 4] SIDE ANGLE RIGHT — PHONE 3 STREAM"
        status_txt = "STATUS: STANDBY — AWAITING MOBILE STREAM"
        inst1 = "Launch 'IP Webcam' app on Phone 3 -> Start Server"
        inst2 = "Configure Phone 3 URL in Dashboard Settings"
        accent_col = (180, 100, 255)
    elif ch in ("cctv1", "gate"):
        title = "[CCTV 1] GATE CHOKE-POINT — WEBCAM"
        status_txt = "STATUS: INITIALIZING DIRECTSHOW WEBCAM..."
        inst1 = "Checking device index 0 (Integrated Webcam)"
        inst2 = "Stream will resume automatically"
        accent_col = (0, 255, 180)
    else:
        title = f"[{channel.upper()}] CCTV MONITORING STANDBY"
        status_txt = "STATUS: STANDBY — AWAITING CAMERA FEED"
        inst1 = "Configure camera endpoint in settings"
        inst2 = "Port 5000 Video Broadcaster Ready"
        accent_col = (200, 200, 200)

    # Header Bar
    cv2.rectangle(img, (22, 22), (618, 56), (30, 24, 18), -1)
    cv2.circle(img, (40, 39), 5, accent_col, -1)
    cv2.putText(img, title, (54, 44), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (230, 240, 250), 1)

    # Status & Instructions Overlay
    cv2.putText(img, status_txt, (50, 110), cv2.FONT_HERSHEY_SIMPLEX, 0.46, accent_col, 1)
    cv2.putText(img, inst1, (50, 260), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (180, 195, 210), 1)
    cv2.putText(img, inst2, (50, 285), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (140, 155, 170), 1)
    cv2.putText(img, "SAFETYINTEL INDUSTRIAL VISION ENGINE — PORT 5000", (50, 320), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (90, 105, 120), 1)
    return img

def _get_default_standby_frame(channel: str) -> bytes:
    if channel in _STANDBY_CACHE:
        return _STANDBY_CACHE[channel]
    img = get_standby_numpy_frame(channel)
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
            if "cctv1" in path:
                cam = "cctv1"
            elif "cctv2" in path:
                cam = "cctv2"
            elif "cctv3" in path:
                cam = "cctv3"
            elif "cctv4" in path:
                cam = "cctv4"
            else:
                cam = "composite"
            with _FRAME_LOCK:
                frame_bytes = _ACTIVE_FRAMES.get(cam)
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
                    if channel == "composite":
                        frame_bytes = _ACTIVE_FRAMES.get("composite") or _ACTIVE_FRAMES.get("cctv1")
                    else:
                        frame_bytes = _ACTIVE_FRAMES.get(channel)

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

    def clear_frame(self, channel: str):
        """Removes the active JPEG frame for a specific camera channel so it falls back to its standby frame."""
        with _FRAME_LOCK:
            _ACTIVE_FRAMES.pop(channel, None)

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
