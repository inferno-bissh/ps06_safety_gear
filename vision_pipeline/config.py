import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
ENV_LOCAL_PATH = PROJECT_ROOT / "dashboard" / ".env.local"

# Helper to load .env.local without requiring python-dotenv
def load_env_local():
    env_vars = {}
    if ENV_LOCAL_PATH.exists():
        with open(ENV_LOCAL_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    val = val.strip().strip('"').strip("'")
                    env_vars[key.strip()] = val
    return env_vars

_env = load_env_local()

# Firebase Settings
FIREBASE_PROJECT_ID = _env.get("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "ps06-safety-gear")
FIREBASE_API_KEY = _env.get("NEXT_PUBLIC_FIREBASE_API_KEY", "")
FACILITY_ID = _env.get("NEXT_PUBLIC_DEFAULT_FACILITY_ID", "STPI_HOST_01")

# Service account path (optional fallback if user generates it)
SERVICE_ACCOUNT_PATH = PROJECT_ROOT / "serviceAccountKey.json"

# Vision & Safety Configurations
ZONE_ID = "WELDING_ZONE"
ZONE_NAME = "Welding & Fabrication Bay"
CAMERA_ID = "CAM_01"

# Temporal Confirmation (consecutive frames required before raising an incident, ~1s)
TEMPORAL_CONFIRMATION_FRAMES = 25

# Confidence Thresholds
PERSON_CONF_THRESHOLD = 0.50
HELMET_CONF_THRESHOLD = 0.60
FIRE_CONF_THRESHOLD = 0.70

# Webcam input (0 for default laptop camera, or path to video file)
CAMERA_SOURCE = 0
FRAME_WIDTH = 1280
FRAME_HEIGHT = 720
TARGET_FPS = 30
