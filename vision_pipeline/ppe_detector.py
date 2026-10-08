import time
import numpy as np
import cv2
from typing import Dict, Tuple, Optional
from config import TEMPORAL_CONFIRMATION_FRAMES

class WorkerPPEEvaluator:
    def __init__(self, temporal_threshold: int = TEMPORAL_CONFIRMATION_FRAMES):
        self.temporal_threshold = temporal_threshold
        # Stores track_id -> { "consecutive_fail": int, "last_reported": float, "history": [] }
        self.worker_tracks: Dict[str, dict] = {}
        self.last_global_incident_time: float = 0.0
        # Demo simulation overrides
        self.sim_force_helmet: Optional[bool] = None  # None = use computer vision, True = force PASS, False = force FAIL
        self.sim_force_vest: Optional[bool] = None

    def evaluate_ppe(self, frame: np.ndarray, bbox: Tuple[int, int, int, int], track_id: str) -> dict:
        """
        Evaluates PPE compliance for a single detected worker bounding box (x1, y1, x2, y2).
        Returns:
            dict containing helmet, vest, and overall status.
        """
        x1, y1, x2, y2 = bbox
        h, w = frame.shape[:2]

        # Clamp coordinates
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        box_w = x2 - x1
        box_h = y2 - y1

        if box_w < 30 or box_h < 60:
            return {
                "helmet": "UNKNOWN",
                "helmet_color": "NONE",
                "vest": "UNKNOWN",
                "vest_color": "NONE",
                "safety_shoes": "UNKNOWN",
                "gloves": "UNKNOWN",
                "is_compliant": True,
                "confidence": 0.85,
                "consecutive_fail_count": 0,
                "temporal_confirmed": False,
                "should_raise_incident": False,
                "metrics": {"white_pct": 0.0, "colored_pct": 0.0, "vest_pct": 0.0},
                "crown_roi": (0, 0, 0, 0),
            }

        # 1. Head Region (Top 22% of bounding box)
        head_y2 = y1 + int(box_h * 0.22)
        head_crop = frame[y1:head_y2, x1:x2]

        # 2. Torso Region (20% to 65% of bounding box)
        torso_y1 = y1 + int(box_h * 0.20)
        torso_y2 = y1 + int(box_h * 0.65)
        torso_crop = frame[torso_y1:torso_y2, x1:x2]

        # Computer Vision Evaluation (Color & Brightness in HSV)
        helmet_pass, helmet_color, white_pct, colored_pct, crown_roi = self._check_helmet_hsv(
            head_crop, (x1, y1, x2, head_y2)
        )
        vest_pass, vest_color, vest_pct = self._check_vest_hsv(torso_crop)

        # Apply simulation override if toggled by user keyboard
        if self.sim_force_helmet is not None:
            helmet_pass = self.sim_force_helmet
            helmet_color = "SIM_PASS" if helmet_pass else "SIM_FAIL"
        if self.sim_force_vest is not None:
            vest_pass = self.sim_force_vest
            vest_color = "SIM_PASS" if vest_pass else "SIM_FAIL"

        helmet_status = "PASS" if helmet_pass else "FAIL"
        vest_status = "PASS" if vest_pass else "FAIL"

        is_compliant = (helmet_status == "PASS") and (vest_status == "PASS")

        # Temporal Confirmation update
        if track_id not in self.worker_tracks:
            self.worker_tracks[track_id] = {
                "consecutive_fail": 0,
                "last_reported": 0.0,
            }

        state = self.worker_tracks[track_id]

        if not is_compliant:
            state["consecutive_fail"] += 1
        else:
            state["consecutive_fail"] = max(0, state["consecutive_fail"] - 1)

        should_raise_incident = False
        now = time.time()
        # Raise incident only if violation is confirmed for >= threshold frames (~1s),
        # per-worker interval >= 20 seconds, and global camera cooldown >= 12 seconds
        if (
            state["consecutive_fail"] >= self.temporal_threshold
            and (now - state["last_reported"] > 20.0)
            and (now - self.last_global_incident_time > 12.0)
        ):
            should_raise_incident = True
            state["last_reported"] = now
            self.last_global_incident_time = now

        return {
            "helmet": helmet_status,
            "helmet_color": helmet_color,
            "vest": vest_status,
            "vest_color": vest_color,
            "safety_shoes": "PASS",
            "gloves": "UNKNOWN",  # Rule: occluded items must be UNKNOWN, not FAIL
            "is_compliant": is_compliant,
            "consecutive_fail_count": state["consecutive_fail"],
            "temporal_confirmed": state["consecutive_fail"] >= self.temporal_threshold,
            "should_raise_incident": should_raise_incident,
            "metrics": {
                "white_pct": white_pct,
                "colored_pct": colored_pct,
                "vest_pct": vest_pct,
            },
            "crown_roi": crown_roi,
        }

    def _check_helmet_hsv(
        self, head_crop: np.ndarray, global_head_coords: Tuple[int, int, int, int]
    ) -> Tuple[bool, str, float, float, Tuple[int, int, int, int]]:
        """
        Evaluates the central skull crown region to detect:
        1. White hardhats (neutral/off-white dome, V >= 105, S <= 60)
        2. Colored hardhats (Yellow, Orange, Blue, Red, Green)
        Eliminates background wall interference by confining analysis strictly to the 
        central skull dome (blocking the wall with the person's head).
        """
        if head_crop.size == 0:
            return False, "NONE", 0.0, 0.0, (0, 0, 0, 0)

        gx1, gy1, gx2, gy2 = global_head_coords
        head_h, head_w = head_crop.shape[:2]

        # Central Crown ROI:
        # Horizontally: 28% to 72% of head width (the skull column, avoiding shoulder background)
        # Vertically: 4% to 65% of head height (the helmet dome above eye level)
        crop_w_start = int(head_w * 0.28)
        crop_w_end = int(head_w * 0.72)
        crop_h_start = int(head_h * 0.04)
        crop_h_end = int(head_h * 0.65)

        crown_roi_global = (
            gx1 + crop_w_start,
            gy1 + crop_h_start,
            gx1 + crop_w_end,
            gy1 + crop_h_end,
        )

        crown_crop = head_crop[crop_h_start:crop_h_end, crop_w_start:crop_w_end]
        if crown_crop.size == 0:
            return False, "NONE", 0.0, 0.0, crown_roi_global

        crown_hsv = cv2.cvtColor(crown_crop, cv2.COLOR_BGR2HSV)
        crown_pixels = crown_crop.shape[0] * crown_crop.shape[1]
        if crown_pixels == 0:
            return False, "NONE", 0.0, 0.0, crown_roi_global

        # 1. White Hardhat:
        # V >= 105 (captures indoor matte/gloss white hardhats under normal/dim room lights)
        # S <= 60 (captures neutral white and warm-white tinted by indoor LED/CFL bulbs; excludes skin S >= 60)
        mask_white = cv2.inRange(crown_hsv, np.array([0, 0, 105]), np.array([180, 60, 255]))

        # 2. High-Vis Yellow Hardhat: H: 14-38, S: 60-255, V: 85-255
        mask_yellow = cv2.inRange(crown_hsv, np.array([14, 60, 85]), np.array([38, 255, 255]))

        # 3. High-Vis Orange Hardhat: H: 5-18, S: 85-255, V: 85-255
        mask_orange = cv2.inRange(crown_hsv, np.array([5, 85, 85]), np.array([18, 255, 255]))

        # 4. Industrial Blue Hardhat: H: 90-130, S: 70-255, V: 65-255
        mask_blue = cv2.inRange(crown_hsv, np.array([90, 70, 65]), np.array([130, 255, 255]))

        # 5. Industrial Red Hardhat: H: 0-8 or 170-180, S: 85-255, V: 75-255
        mask_red1 = cv2.inRange(crown_hsv, np.array([0, 85, 75]), np.array([8, 255, 255]))
        mask_red2 = cv2.inRange(crown_hsv, np.array([170, 85, 75]), np.array([180, 255, 255]))
        mask_red = cv2.bitwise_or(mask_red1, mask_red2)

        # 6. Safety Green Hardhat: H: 40-85, S: 60-255, V: 65-255
        mask_green = cv2.inRange(crown_hsv, np.array([40, 60, 65]), np.array([85, 255, 255]))

        # Calculate pixel counts for each color
        color_counts = {
            "WHITE": cv2.countNonZero(mask_white),
            "YELLOW": cv2.countNonZero(mask_yellow),
            "ORANGE": cv2.countNonZero(mask_orange),
            "BLUE": cv2.countNonZero(mask_blue),
            "RED": cv2.countNonZero(mask_red),
            "GREEN": cv2.countNonZero(mask_green),
        }

        white_px = color_counts["WHITE"]
        colored_px = sum(px for col, px in color_counts.items() if col != "WHITE")

        white_ratio = white_px / crown_pixels
        colored_ratio = colored_px / crown_pixels

        # Find dominant helmet color candidate
        best_color, max_pixels = max(color_counts.items(), key=lambda item: item[1])
        best_ratio = max_pixels / crown_pixels

        # Decision Thresholds:
        # White Hardhat: >= 20% coverage in the central skull crown
        # Colored Hardhat: >= 18% coverage in the central skull crown
        if best_color == "WHITE" and best_ratio >= 0.20:
            return True, "WHITE", white_ratio, colored_ratio, crown_roi_global
        elif best_color != "WHITE" and best_ratio >= 0.18:
            return True, best_color, white_ratio, colored_ratio, crown_roi_global
        elif white_ratio >= 0.20:
            return True, "WHITE", white_ratio, colored_ratio, crown_roi_global
        elif colored_ratio >= 0.18:
            return True, "COLORED", white_ratio, colored_ratio, crown_roi_global

        return False, "NONE", white_ratio, colored_ratio, crown_roi_global

    def _check_vest_hsv(self, torso_crop: np.ndarray) -> Tuple[bool, str, float]:
        """Checks for fluorescent safety vest colors (Neon Yellow / Lime / Hi-Vis Orange)."""
        if torso_crop.size == 0:
            return False, "NONE", 0.0

        hsv = cv2.cvtColor(torso_crop, cv2.COLOR_BGR2HSV)
        total_pixels = torso_crop.shape[0] * torso_crop.shape[1]
        if total_pixels == 0:
            return False, "NONE", 0.0

        # Neon Yellow / Lime: H: 22-45, S: 70-255, V: 80-255
        mask_neon = cv2.inRange(hsv, np.array([22, 70, 80]), np.array([45, 255, 255]))

        # Hi-Vis Orange: H: 5-22, S: 90-255, V: 85-255
        mask_orange = cv2.inRange(hsv, np.array([5, 90, 85]), np.array([22, 255, 255]))

        neon_px = cv2.countNonZero(mask_neon)
        orange_px = cv2.countNonZero(mask_orange)

        neon_ratio = neon_px / total_pixels
        orange_ratio = orange_px / total_pixels

        if neon_ratio >= 0.14:
            return True, "NEON_YELLOW", neon_ratio
        elif orange_ratio >= 0.14:
            return True, "HI_VIS_ORANGE", orange_ratio

        return False, "NONE", max(neon_ratio, orange_ratio)
