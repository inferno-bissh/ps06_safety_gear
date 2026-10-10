import time
from pathlib import Path
import numpy as np
import cv2
from typing import Dict, Tuple, Optional, List
from config import (
    TEMPORAL_CONFIRMATION_FRAMES,
    PPE_MODEL_PATH,
    PPE_CONF_THRESHOLD,
    HELMET_CONF_THRESHOLD,
)

class WorkerPPEEvaluator:
    def __init__(
        self,
        temporal_threshold: int = TEMPORAL_CONFIRMATION_FRAMES,
        ppe_model_path: Optional[str] = None,
    ):
        self.temporal_threshold = temporal_threshold
        # Stores track_id -> { "consecutive_fail": int, "last_reported": float, "history": [] }
        self.worker_tracks: Dict[str, dict] = {}
        self.last_global_incident_time: float = 0.0
        # Demo simulation overrides
        self.sim_force_helmet: Optional[bool] = None  # None = use computer vision, True = force PASS, False = force FAIL
        self.sim_force_vest: Optional[bool] = None

        # Load Dedicated Neural YOLO PPE Model
        self.ppe_model = None
        target_path = Path(ppe_model_path) if ppe_model_path else PPE_MODEL_PATH
        if target_path and target_path.exists():
            try:
                from ultralytics import YOLO
                self.ppe_model = YOLO(str(target_path))
                print(f"[PPE Neural Model] Loaded dedicated YOLO PPE model from: {target_path}")
            except Exception as e:
                print(f"[PPE Neural Model] Warning: Could not load PPE model ({e}), using HSV fallback.")

    def detect_frame_ppe(self, frame: np.ndarray, conf: float = PPE_CONF_THRESHOLD) -> List[dict]:
        """
        Runs dedicated neural YOLO PPE detection on a single frame.
        Returns list of detected PPE items with bounding boxes, labels, and confidence scores.
        """
        if self.ppe_model is None or frame is None or frame.size == 0:
            return []

        try:
            results = self.ppe_model(frame, conf=conf, verbose=False)
            if not results or len(results[0].boxes) == 0:
                return []

            items = []
            names = self.ppe_model.names
            boxes = results[0].boxes.xyxy.cpu().numpy().astype(int)
            classes = results[0].boxes.cls.cpu().numpy().astype(int)
            confidences = results[0].boxes.conf.cpu().numpy()

            for box, cls_id, score in zip(boxes, classes, confidences):
                label = names.get(cls_id, str(cls_id))
                items.append({
                    "label": label,  # 'Gloves', 'Vest', 'goggles', 'helmet', 'mask', 'safety_shoe'
                    "conf": float(score),
                    "box": tuple(map(int, box)),
                })
            return items
        except Exception as e:
            return []

    def evaluate_ppe(
        self,
        frame: np.ndarray,
        bbox: Tuple[int, int, int, int],
        track_id: str,
        frame_ppe_items: Optional[List[dict]] = None,
    ) -> dict:
        """
        Evaluates PPE compliance for a single detected worker bounding box (x1, y1, x2, y2).
        Combines neural YOLO detection with secondary HSV crown dome and torso heuristics.
        Returns:
            dict containing helmet, vest, gloves, shoes, and overall compliance status.
        """
        x1, y1, x2, y2 = bbox
        h, w = frame.shape[:2]

        # Clamp coordinates
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        box_w = x2 - x1
        box_h = y2 - y1

        if box_w < 20 or box_h < 40:
            return {
                "helmet": "UNKNOWN",
                "helmet_color": "NONE",
                "helmet_source": "FALLBACK",
                "vest": "UNKNOWN",
                "vest_color": "NONE",
                "vest_source": "FALLBACK",
                "safety_shoes": "UNKNOWN",
                "gloves": "UNKNOWN",
                "goggles": "UNKNOWN",
                "is_compliant": True,
                "confidence": 0.85,
                "consecutive_fail_count": 0,
                "temporal_confirmed": False,
                "should_raise_incident": False,
                "metrics": {"white_pct": 0.0, "colored_pct": 0.0, "vest_pct": 0.0},
                "crown_roi": (0, 0, 0, 0),
            }

        # If frame-level PPE detection was not passed in, run on this frame
        if frame_ppe_items is None and self.ppe_model is not None:
            frame_ppe_items = self.detect_frame_ppe(frame)

        # 1. Neural YOLO PPE Matching via Spatial Containment
        helmet_neural = False
        helmet_neural_conf = 0.0
        vest_neural = False
        vest_neural_conf = 0.0
        gloves_neural = False
        goggles_neural = False
        shoes_neural = False

        if frame_ppe_items:
            for item in frame_ppe_items:
                lbl = item["label"].lower()
                ix1, iy1, ix2, iy2 = item["box"]
                icx = (ix1 + ix2) / 2.0
                icy = (iy1 + iy2) / 2.0
                iconf = item["conf"]

                # Horizontal alignment check (item center within worker column + 15% margin)
                if not (x1 - box_w * 0.15 <= icx <= x2 + box_w * 0.15):
                    continue

                # Helmet: center within upper 40% of worker box or slightly above head
                if "helmet" in lbl:
                    if (y1 - box_h * 0.15) <= icy <= (y1 + box_h * 0.42):
                        helmet_neural = True
                        helmet_neural_conf = max(helmet_neural_conf, iconf)

                # Vest: center within torso (18% to 80% of worker box)
                elif "vest" in lbl:
                    if (y1 + box_h * 0.15) <= icy <= (y1 + box_h * 0.85):
                        vest_neural = True
                        vest_neural_conf = max(vest_neural_conf, iconf)

                # Gloves: mid to lower body hands
                elif "glove" in lbl:
                    if (y1 + box_h * 0.25) <= icy <= (y1 + box_h * 0.95):
                        gloves_neural = True

                # Goggles: near eyes/face (top 35% of worker box)
                elif "goggle" in lbl or "glasses" in lbl:
                    if (y1 - box_h * 0.05) <= icy <= (y1 + box_h * 0.35):
                        goggles_neural = True

                # Safety Shoes: feet/bottom 30% of worker box
                elif "shoe" in lbl or "boot" in lbl:
                    if (y1 + box_h * 0.65) <= icy <= (y2 + box_h * 0.15):
                        shoes_neural = True

        # Worker dimensions & aspect ratio
        aspect_ratio = box_h / max(1, box_w)
        worker_h_pct = box_h / max(1, h)
        worker_bottom_pct = y2 / max(1, h)

        # 2. Adaptive Posture Crops for HSV Color Classification
        if aspect_ratio < 1.6:
            head_h_ratio = 0.35
            torso_y1_ratio = 0.30
            torso_y2_ratio = 0.95
        else:
            head_h_ratio = 0.25
            torso_y1_ratio = 0.22
            torso_y2_ratio = 0.68

        head_y2 = y1 + int(box_h * head_h_ratio)
        head_crop = frame[y1:head_y2, x1:x2]

        torso_y1 = y1 + int(box_h * torso_y1_ratio)
        torso_y2 = y1 + int(box_h * torso_y2_ratio)
        torso_crop = frame[torso_y1:torso_y2, x1:x2]

        # Torso / Body Visibility Check:
        # A worker's torso is only considered visible if:
        # 1. The box is sufficiently tall (box_h >= 75 and at least 18% of frame height)
        # 2. Aspect ratio is >= 1.12 (if box is square or wide, it's just a face/head close-up)
        # 3. Torso region has real pixel height (>= 30px)
        # 4. Lower chest is not cut off by the frame bottom edge
        torso_pixel_h = max(0, torso_y2 - torso_y1)
        torso_visible = (
            box_h >= 75
            and worker_h_pct >= 0.18
            and aspect_ratio >= 1.12
            and torso_pixel_h >= 30
            and (y1 + int(box_h * 0.45)) < (h - 8)
        )

        # Feet are only considered visible if worker is full-body and reaches the floor
        feet_visible = (worker_bottom_pct >= 0.88) and (worker_h_pct >= 0.65) and (aspect_ratio >= 1.65)

        # Hands / Gloves Visibility Check:
        # If neural model detected gloves -> hands are definitely visible in frame
        if gloves_neural:
            hands_visible = True
        else:
            # When a worker is cut off at the chest/waist by the camera's bottom edge (y2 >= h - 12 and aspect_ratio < 1.60),
            # or worker is framed waist-up without arms extending into view, hands are outside the frame!
            hands_cut_off = (y2 >= h - 12) and (aspect_ratio < 1.60)
            hands_visible = (
                (box_h >= 110)
                and (not hands_cut_off)
                and (aspect_ratio >= 1.40 or feet_visible)
            )

        # Run Secondary HSV Inspection
        helmet_hsv_pass, helmet_hsv_color, white_pct, colored_pct, crown_roi = self._check_helmet_hsv(
            head_crop, (x1, y1, x2, head_y2)
        )
        vest_hsv_pass, vest_hsv_color, vest_pct = self._check_vest_hsv(torso_crop)

        # 3. Hybrid Fusion: Neural YOLO + Color Classification
        # HELMET EVALUATION:
        # A paper carry bag, cardboard box, cloth, or hair must NEVER pass as a helmet!
        # When dedicated neural model is loaded, NEURAL YOLO is the mandatory gatekeeper.
        if self.ppe_model is not None:
            if helmet_neural and helmet_neural_conf >= HELMET_CONF_THRESHOLD:
                helmet_pass = True
                helmet_source = "NEURAL_YOLO"
                helmet_color = helmet_hsv_color if helmet_hsv_color not in ["NONE"] else "VERIFIED"
            else:
                helmet_pass = False
                helmet_source = "NONE"
                helmet_color = "NONE"
        else:
            # Fallback ONLY when neural model is not loaded:
            if helmet_hsv_pass:
                helmet_pass = True
                helmet_source = "HSV_DOME_FALLBACK"
                helmet_color = helmet_hsv_color
            else:
                helmet_pass = False
                helmet_source = "NONE"
                helmet_color = "NONE"

        # VEST EVALUATION:
        # If torso is not properly visible in frame, vest status is UNKNOWN!
        if not torso_visible:
            vest_status = "UNKNOWN"
            vest_color = "NOT_VISIBLE"
            vest_source = "OUT_OF_FRAME"
            vest_pass = False
        else:
            if self.ppe_model is not None:
                if vest_neural and vest_neural_conf >= PPE_CONF_THRESHOLD:
                    vest_pass = True
                    vest_source = "NEURAL_YOLO"
                    vest_color = vest_hsv_color if vest_hsv_color not in ["NONE"] else "VERIFIED"
                else:
                    vest_pass = False
                    vest_source = "NONE"
                    vest_color = "NONE"
            else:
                if vest_hsv_pass:
                    vest_pass = True
                    vest_source = "HSV_TORSO_FALLBACK"
                    vest_color = vest_hsv_color
                else:
                    vest_pass = False
                    vest_source = "NONE"
                    vest_color = "NONE"
            vest_status = "PASS" if vest_pass else "FAIL"

        # Apply simulation overrides if toggled by user keyboard
        if self.sim_force_helmet is not None:
            helmet_pass = self.sim_force_helmet
            helmet_color = "SIM_PASS" if helmet_pass else "SIM_FAIL"
            helmet_source = "KEYBOARD_SIM"
        if self.sim_force_vest is not None:
            vest_pass = self.sim_force_vest
            vest_color = "SIM_PASS" if vest_pass else "SIM_FAIL"
            vest_source = "KEYBOARD_SIM"
            vest_status = "PASS" if vest_pass else "FAIL"

        helmet_status = "PASS" if helmet_pass else "FAIL"

        # Footwear Status
        if not feet_visible:
            shoes_status = "UNKNOWN"
        else:
            shoes_status = "PASS" if shoes_neural else "FAIL"

        # Gloves Status:
        # If gloves detected -> PASS
        # If hands not properly in frame -> UNKNOWN
        # If hands are in frame but bare -> FAIL
        if gloves_neural:
            gloves_status = "PASS"
        elif not hands_visible:
            gloves_status = "UNKNOWN"
        else:
            gloves_status = "FAIL"

        # Overall Compliance:
        # Compliance strictly requires Helmet PASS and Vest PASS.
        # If body is not visible (vest is UNKNOWN) or helmet failed, compliance CANNOT pass!
        is_compliant = (helmet_status == "PASS") and (vest_status == "PASS")
        confidence_score = float(max(0.85, helmet_neural_conf, vest_neural_conf))

        # Temporal Confirmation update (debounce before raising persistent incidents)
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
            "helmet_source": helmet_source,
            "helmet_conf": float(round(helmet_neural_conf, 2)),
            "vest": vest_status,
            "vest_color": vest_color,
            "vest_source": vest_source,
            "vest_conf": float(round(vest_neural_conf, 2)),
            "safety_shoes": shoes_status,
            "gloves": gloves_status,
            "goggles": "PASS" if goggles_neural else "UNKNOWN",
            "is_compliant": is_compliant,
            "confidence": confidence_score,
            "consecutive_fail_count": state["consecutive_fail"],
            "temporal_confirmed": state["consecutive_fail"] >= self.temporal_threshold,
            "should_raise_incident": should_raise_incident,
            "body_visible": torso_visible,
            "hands_visible": hands_visible,
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

        # High-Vis Industrial Hardhat Color Masks (Strictly isolates genuine PPE)
        # 1. High-Vis Yellow Hardhat: H: 18-38, S: 115-255, V: 120-255 (excludes dull brown/tan paper)
        mask_yellow = cv2.inRange(crown_hsv, np.array([18, 115, 120]), np.array([38, 255, 255]))

        # 2. High-Vis Orange Hardhat: H: 6-18, S: 145-255, V: 120-255 (excludes kraft paper bag S ~ 125-135)
        mask_orange = cv2.inRange(crown_hsv, np.array([6, 145, 120]), np.array([18, 255, 255]))

        # 3. Industrial Blue Hardhat: H: 90-130, S: 90-255, V: 80-255
        mask_blue = cv2.inRange(crown_hsv, np.array([90, 90, 80]), np.array([130, 255, 255]))

        # 4. Industrial Red Hardhat: H: 0-8 or 170-180, S: 120-255, V: 90-255
        mask_red1 = cv2.inRange(crown_hsv, np.array([0, 120, 90]), np.array([8, 255, 255]))
        mask_red2 = cv2.inRange(crown_hsv, np.array([170, 120, 90]), np.array([180, 255, 255]))
        mask_red = cv2.bitwise_or(mask_red1, mask_red2)

        # 5. Safety Green Hardhat: H: 40-85, S: 90-255, V: 85-255
        mask_green = cv2.inRange(crown_hsv, np.array([40, 90, 85]), np.array([85, 255, 255]))

        # 6. Specular White Hardhat: V >= 185, S <= 30 (Strictly requires high-brightness dome; excludes beige/kraft paper)
        mask_white = cv2.inRange(crown_hsv, np.array([0, 0, 185]), np.array([180, 30, 255]))

        # Calculate pixel counts for each genuine hardhat color (NO DARK_CAP - black/dark hair must NEVER be counted as PPE)
        color_counts = {
            "YELLOW": cv2.countNonZero(mask_yellow),
            "ORANGE": cv2.countNonZero(mask_orange),
            "BLUE": cv2.countNonZero(mask_blue),
            "RED": cv2.countNonZero(mask_red),
            "GREEN": cv2.countNonZero(mask_green),
            "WHITE": cv2.countNonZero(mask_white),
        }

        white_px = color_counts["WHITE"]
        colored_px = sum(px for col, px in color_counts.items() if col != "WHITE")

        white_ratio = white_px / crown_pixels
        colored_ratio = colored_px / crown_pixels

        # Find dominant helmet color candidate
        best_color, max_pixels = max(color_counts.items(), key=lambda item: item[1])
        best_ratio = max_pixels / crown_pixels

        # Decision Thresholds: Require prominent hardhat presence in skull crown ROI
        if best_color != "WHITE" and best_ratio >= 0.32:
            return True, best_color, white_ratio, colored_ratio, crown_roi_global
        elif best_color == "WHITE" and white_ratio >= 0.40:
            return True, "WHITE", white_ratio, colored_ratio, crown_roi_global

        return False, "NONE", white_ratio, colored_ratio, crown_roi_global

    def _check_vest_hsv(self, torso_crop: np.ndarray) -> Tuple[bool, str, float]:
        """Checks for fluorescent safety vest colors (Neon Yellow / Lime / Hi-Vis Orange)."""
        if torso_crop.size == 0:
            return False, "NONE", 0.0

        hsv = cv2.cvtColor(torso_crop, cv2.COLOR_BGR2HSV)
        total_pixels = torso_crop.shape[0] * torso_crop.shape[1]
        if total_pixels == 0:
            return False, "NONE", 0.0

        # Neon Yellow / Lime: H: 22-45, S: 85-255, V: 90-255 (fluorescent high-vis)
        mask_neon = cv2.inRange(hsv, np.array([22, 85, 90]), np.array([45, 255, 255]))

        # Hi-Vis Orange: H: 6-22, S: 125-255, V: 90-255 (fluorescent safety orange)
        mask_orange = cv2.inRange(hsv, np.array([6, 125, 90]), np.array([22, 255, 255]))

        # Industrial Blue Vest: H: 95-130, S: 105-255, V: 80-255 (high-vis reflective blue vest)
        mask_blue = cv2.inRange(hsv, np.array([95, 105, 80]), np.array([130, 255, 255]))

        neon_px = cv2.countNonZero(mask_neon)
        orange_px = cv2.countNonZero(mask_orange)
        blue_px = cv2.countNonZero(mask_blue)

        neon_ratio = neon_px / total_pixels
        orange_ratio = orange_px / total_pixels
        blue_ratio = blue_px / total_pixels

        if neon_ratio >= 0.18:
            return True, "NEON_YELLOW", neon_ratio
        elif orange_ratio >= 0.18:
            return True, "HI_VIS_ORANGE", orange_ratio
        elif blue_ratio >= 0.22:
            return True, "SAFETY_BLUE", blue_ratio

        return False, "NONE", max(neon_ratio, orange_ratio, blue_ratio)
