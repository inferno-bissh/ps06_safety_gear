import sys
import time
from pathlib import Path
import numpy as np
import cv2
from typing import Dict, Tuple, Optional, List

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from config import (
    TEMPORAL_CONFIRMATION_FRAMES,
    PPE_MODEL_PATH,
    PPE_CONF_THRESHOLD,
    HELMET_CONF_THRESHOLD,
    GLOVES_CONF_THRESHOLD,
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
        face_bbox: Optional[Tuple[int, int, int, int]] = None,
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
        bare_hands_neural = False

        if frame_ppe_items:
            for item in frame_ppe_items:
                lbl = item["label"].lower()
                ix1, iy1, ix2, iy2 = item["box"]
                icx = (ix1 + ix2) / 2.0
                icy = (iy1 + iy2) / 2.0
                iconf = item["conf"]

                # Horizontal alignment check (item center within worker column + 35% margin)
                if not (x1 - max(30, int(box_w * 0.35)) <= icx <= x2 + max(30, int(box_w * 0.35))):
                    continue

                # Helmet: center within upper 55% of worker box or directly above head
                if "helmet" in lbl:
                    if (y1 - max(80, int(box_h * 0.45))) <= icy <= (y1 + max(80, int(box_h * 0.55))):
                        helmet_neural = True
                        helmet_neural_conf = max(helmet_neural_conf, iconf)

                # Vest: center within torso (12% to 90% of worker box)
                elif "vest" in lbl:
                    if (y1 + int(box_h * 0.12)) <= icy <= (y1 + int(box_h * 0.90)):
                        if iconf >= 0.32:
                            vx1, vy1, vx2, vy2 = max(0, ix1), max(0, iy1), min(w, ix2), min(h, iy2)
                            v_crop = frame[vy1:vy2, vx1:vx2]
                            if v_crop.size > 0:
                                v_ycrcb = cv2.cvtColor(v_crop, cv2.COLOR_BGR2YCrCb)
                                v_skin = cv2.inRange(v_ycrcb, np.array([0, 133, 77]), np.array([255, 173, 127]))
                                v_skin_ratio = cv2.countNonZero(v_skin) / max(1, v_crop.shape[0] * v_crop.shape[1])
                                # A genuine safety vest is not bare chest/skin!
                                if v_skin_ratio < 0.35:
                                    vest_neural = True
                                    vest_neural_conf = max(vest_neural_conf, iconf)

                # Gloves / Hands: anywhere from upper chest down to lower body
                elif "glove" in lbl:
                    if (y1 + int(box_h * 0.10)) <= icy <= (y2 + int(box_h * 0.20)):
                        if iconf >= 0.20:
                            gx1, gy1, gx2, gy2 = max(0, ix1), max(0, iy1), min(w, ix2), min(h, iy2)
                            g_crop = frame[gy1:gy2, gx1:gx2]
                            if g_crop.size > 0:
                                g_hsv = cv2.cvtColor(g_crop, cv2.COLOR_BGR2HSV)
                                mask_skin = cv2.inRange(g_hsv, np.array([0, 25, 40]), np.array([28, 180, 255]))
                                skin_ratio = cv2.countNonZero(mask_skin) / max(1, (g_crop.shape[0] * g_crop.shape[1]))
                                # Safety gloves must NOT be bare human skin!
                                # If skin pixels exceed 18% of hand box, it is a bare hand/wrist: mark bare hands!
                                if skin_ratio < 0.18:
                                    gloves_neural = True
                                else:
                                    bare_hands_neural = True

                # Goggles: near eyes/face (top 35% of worker box)
                elif "goggle" in lbl or "glasses" in lbl:
                    if (y1 - box_h * 0.05) <= icy <= (y1 + box_h * 0.35):
                        goggles_neural = True

                # Safety Shoes: anywhere in lower half of worker box or extending below
                elif "shoe" in lbl or "boot" in lbl:
                    if (y1 + int(box_h * 0.35)) <= icy <= (y2 + int(box_h * 0.25)):
                        shoes_neural = True

        # Worker dimensions & aspect ratio
        aspect_ratio = box_h / max(1, box_w)
        worker_h_pct = box_h / max(1, h)
        worker_bottom_pct = y2 / max(1, h)

        # 2. Adaptive Posture Crops & Precise Skull Crown ROI
        if aspect_ratio < 1.6:
            head_h_ratio = 0.35
            torso_y1_ratio = 0.30
            torso_y2_ratio = 0.95
        else:
            head_h_ratio = 0.25
            torso_y1_ratio = 0.22
            torso_y2_ratio = 0.68

        # Target skull crown ROI: use face_bbox anchor if available (eliminating wall background bleed)
        if face_bbox is not None:
            fx, fy, fw, fh = face_bbox
            sx1 = max(0, fx + int(fw * 0.10))
            sx2 = min(w, fx + fw - int(fw * 0.10))
            sy1 = max(0, fy - int(fh * 0.65))
            sy2 = min(h, fy + int(fh * 0.05))
            head_crop = frame[sy1:sy2, sx1:sx2]
            crown_roi = (sx1, sy1, sx2, sy2)
        else:
            head_h = max(20, int(box_h * head_h_ratio))
            sx1 = max(0, x1 + int(box_w * 0.20))
            sx2 = min(w, x2 - int(box_w * 0.20))
            sy1 = y1
            sy2 = min(h, y1 + int(head_h * 0.55))
            head_crop = frame[sy1:sy2, sx1:sx2]
            crown_roi = (sx1, sy1, sx2, sy2)

        torso_y1 = y1 + int(box_h * torso_y1_ratio)
        torso_y2 = y1 + int(box_h * torso_y2_ratio)
        torso_crop = frame[torso_y1:torso_y2, x1:x2]

        # Check bare hands and arms via illumination-robust skin segmentation
        bare_hands_skin = self._check_bare_hands_skin(frame, (x1, y1, x2, y2))

        # Feet visibility check: full-body standing or downward phone scan of feet
        feet_visible = (worker_bottom_pct >= 0.88) and (worker_h_pct >= 0.65) and (aspect_ratio >= 1.65)

        # Run Secondary HSV Inspection for Helmet and Vest
        helmet_hsv_pass, helmet_hsv_color, white_pct, colored_pct, crown_roi = self._check_helmet_hsv(
            head_crop, crown_roi
        )
        vest_hsv_pass, vest_hsv_color, vest_pct = self._check_vest_hsv(torso_crop)

        # 3. Hybrid Fusion: Neural YOLO + Color/Dome Shell Classification
        # HELMET EVALUATION:
        # Passes if hardhat shell/color confirms helmet OR Neural YOLO detects helmet (with bare hair protection)!
        if helmet_hsv_pass:
            helmet_pass = True
            helmet_source = "HELMET_SHELL"
            helmet_color = helmet_hsv_color
        elif (
            helmet_neural
            and helmet_neural_conf >= HELMET_CONF_THRESHOLD
            and helmet_hsv_color not in ["PAPER_BAG", "BARE_HAIR", "HAIR_TEXTURE", "BARE_SKIN"]
        ):
            # Neural YOLO confirms helmet only when bare hair or scalp is NOT detected on skull
            helmet_pass = True
            helmet_source = "NEURAL_YOLO"
            helmet_color = helmet_hsv_color if helmet_hsv_color not in ["NONE"] else "VERIFIED"
        elif helmet_neural and helmet_neural_conf >= 0.75 and helmet_hsv_color != "PAPER_BAG":
            # Extremely high neural confidence exception (>75%)
            helmet_pass = True
            helmet_source = "NEURAL_YOLO"
            helmet_color = "VERIFIED"
        else:
            helmet_pass = False
            helmet_source = "NONE"
            helmet_color = helmet_hsv_color if helmet_hsv_color in ["BARE_HAIR", "HAIR_TEXTURE", "BARE_SKIN"] else "NONE"

        # VEST EVALUATION:
        # Directly passes if Neural YOLO detected Vest OR HSV confirmed high-vis vest!
        torso_in_frame = (
            box_h >= 65
            and box_w >= 45
            and (y2 - (y1 + int(box_h * head_h_ratio))) >= 30
        )
        if vest_neural and vest_neural_conf >= PPE_CONF_THRESHOLD:
            vest_pass = True
            vest_status = "PASS"
            vest_source = "NEURAL_YOLO"
            vest_color = vest_hsv_color if vest_hsv_color not in ["NONE"] else "VERIFIED"
            torso_visible = True
        elif vest_hsv_pass:
            vest_pass = True
            vest_status = "PASS"
            vest_source = "HSV_HIGH_VIS"
            vest_color = vest_hsv_color
            torso_visible = True
        else:
            # Torso visibility check: is the worker's chest/shirt presented in camera?
            # If the chest/torso is shown in camera without a safety vest -> FAIL!
            if torso_in_frame:
                vest_pass = False
                vest_status = "FAIL"
                vest_source = "NO_VEST"
                vest_color = "NONE"
                torso_visible = True
            else:
                vest_pass = False
                vest_status = "UNKNOWN"
                vest_source = "OUT_OF_FRAME"
                vest_color = "NOT_VISIBLE"
                torso_visible = False

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

        # FOOTWEAR / SAFETY SHOES EVALUATION:
        # 1. Neural YOLO detection -> PASS directly (vital when scanning with phone camera!)
        if shoes_neural:
            shoes_status = "PASS"
        else:
            # Check if feet / footwear are visible in frame:
            # - Standing full-body view: worker reaches floor (worker_bottom_pct >= 0.80 and box_h >= 120 and AR >= 1.25)
            # - Downward phone camera scan: box in lower half (y2 >= h - 25 and y1 >= h * 0.15 and box_h >= 65)
            feet_in_frame = (
                (worker_bottom_pct >= 0.80 and box_h >= 120 and aspect_ratio >= 1.25)
                or (worker_bottom_pct >= 0.85 and y1 >= int(h * 0.15) and box_h >= 65)
            )
            if feet_in_frame:
                shoes_status = "FAIL"
            else:
                shoes_status = "UNKNOWN"

        # GLOVES / HANDS EVALUATION:
        # 1. If neural model or HSV confirms safety gloves -> PASS
        # 2. Else if bare hands/arms detected (from YOLO or skin inspection) -> FAIL
        # 3. Else if worker full-body standing in frame without gloves -> FAIL
        # GLOVES / HANDS EVALUATION:
        # 1. If neural model confirms safety gloves -> PASS
        # 2. Else if bare hands/arms detected (from YOLO or skin inspection) -> FAIL
        # 3. Else if worker full-body standing in frame without gloves -> FAIL
        # 4. Otherwise (hands tucked away / out of frame) -> UNKNOWN
        if gloves_neural:
            gloves_status = "PASS"
            hands_visible = True
        elif bare_hands_neural or bare_hands_skin:
            gloves_status = "FAIL"
            hands_visible = True
        elif aspect_ratio >= 1.50 and feet_visible:
            gloves_status = "FAIL"
            hands_visible = True
        else:
            gloves_status = "UNKNOWN"
            hands_visible = False

        # Overall Compliance:
        # Mandatory requirements: Helmet PASS and Vest PASS.
        # Strict violation check: Neither gloves nor shoes can be FAIL if visible!
        is_compliant = (
            (helmet_status == "PASS")
            and (vest_status == "PASS")
            and (gloves_status != "FAIL")
            and (shoes_status != "FAIL")
        )
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

    def _check_bare_hands_skin(
        self, frame: np.ndarray, bbox: Tuple[int, int, int, int]
    ) -> bool:
        """
        Detects whether bare hands/arms are visible in the frame via
        illumination-invariant YCrCb + HSV skin segmentation.
        Returns:
            bare_hands_visible: bool
        """
        x1, y1, x2, y2 = bbox
        h, w = frame.shape[:2]
        box_w = max(1, x2 - x1)
        box_h = max(1, y2 - y1)

        # Hands search zone: region below chin down to lower body, horizontally wider for raised/outstretched hands
        hz_y1 = max(0, y1 + int(box_h * 0.28))
        hz_y2 = min(h, y2 + int(box_h * 0.15))
        hz_x1 = max(0, x1 - int(box_w * 0.35))
        hz_x2 = min(w, x2 + int(box_w * 0.35))

        crop = frame[hz_y1:hz_y2, hz_x1:hz_x2]
        if crop.size == 0:
            return False

        crop_h, crop_w = crop.shape[:2]
        ycrcb = cv2.cvtColor(crop, cv2.COLOR_BGR2YCrCb)
        hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)

        # 1. Illumination-invariant skin segmentation (YCrCb + HSV)
        mask_ycrcb = cv2.inRange(ycrcb, np.array([0, 133, 77]), np.array([255, 173, 127]))
        mask_hsv = cv2.inRange(hsv, np.array([0, 25, 45]), np.array([28, 220, 255]))
        skin_mask = cv2.bitwise_and(mask_ycrcb, mask_hsv)

        # Morphological noise removal
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        skin_mask = cv2.morphologyEx(skin_mask, cv2.MORPH_OPEN, kernel)

        # Connected component blob inspection
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(skin_mask)
        hand_blobs = 0
        total_skin_px = 0

        for i in range(1, num_labels):
            area = stats[i, cv2.CC_STAT_AREA]
            bx = stats[i, cv2.CC_STAT_LEFT]
            by = stats[i, cv2.CC_STAT_TOP]
            bw = stats[i, cv2.CC_STAT_WIDTH]
            bh = stats[i, cv2.CC_STAT_HEIGHT]

            # Require substantial hand/arm size
            if area < 300:
                continue

            # Filter out small center neck notch directly below chin
            is_neck = (by < int(crop_h * 0.16)) and (0.32 * crop_w <= (bx + bw / 2.0) <= 0.68 * crop_w) and (bw < 0.35 * crop_w)
            if is_neck and area < 1000:
                continue

            hand_blobs += 1
            total_skin_px += area

        return bool(hand_blobs > 0 and total_skin_px >= 380)

    def _check_helmet_hsv(
        self, head_crop: np.ndarray, global_head_coords: Tuple[int, int, int, int]
    ) -> Tuple[bool, str, float, float, Tuple[int, int, int, int]]:
        """
        Evaluates the central skull crown region to detect:
        1. Authentic Industrial Hardhat Colors (Yellow, Orange, Blue, Red, Green, White)
        2. Discriminates bare hair (dark follicles, natural texture) from hardhat plastic shells.
        Eliminates background wall interference by confining analysis strictly to the 
        central skull dome.
        """
        if head_crop.size == 0:
            return False, "NONE", 0.0, 0.0, (0, 0, 0, 0)

        gx1, gy1, gx2, gy2 = global_head_coords
        crown_crop = head_crop
        crown_roi_global = (gx1, gy1, gx2, gy2)

        crown_pixels = crown_crop.shape[0] * crown_crop.shape[1]
        if crown_pixels == 0:
            return False, "NONE", 0.0, 0.0, crown_roi_global

        crown_hsv = cv2.cvtColor(crown_crop, cv2.COLOR_BGR2HSV)
        crown_ycrcb = cv2.cvtColor(crown_crop, cv2.COLOR_BGR2YCrCb)
        crown_gray = cv2.cvtColor(crown_crop, cv2.COLOR_BGR2GRAY)
        lap_var = float(cv2.Laplacian(crown_gray, cv2.CV_64F).var())

        # 1. Hair Segmentation in Skull Zone:
        # Human hair is dark (V < 92) and low-to-moderate saturation, or dark brown
        m_hair1 = cv2.inRange(crown_hsv, np.array([0, 0, 0]), np.array([180, 110, 92]))
        m_hair2 = cv2.inRange(crown_hsv, np.array([5, 40, 30]), np.array([25, 140, 110]))
        m_hair = cv2.bitwise_or(m_hair1, m_hair2)
        hair_ratio = cv2.countNonZero(m_hair) / crown_pixels

        # 2. Forehead Skin Segmentation:
        m_skin_ycrcb = cv2.inRange(crown_ycrcb, np.array([0, 133, 77]), np.array([255, 173, 127]))
        m_skin_hsv = cv2.inRange(crown_hsv, np.array([0, 25, 45]), np.array([28, 220, 255]))
        m_skin = cv2.bitwise_and(m_skin_ycrcb, m_skin_hsv)
        skin_ratio = cv2.countNonZero(m_skin) / crown_pixels

        # 3. Authentic High-Vis Industrial Hardhat Colors (Yellow, Orange, Blue, Red, Green, White)
        # Note: Blue requires S >= 130 and V >= 95 so cool white/grey room walls and monitor glow never pass!
        mask_yellow = cv2.inRange(crown_hsv, np.array([20, 105, 115]), np.array([38, 255, 255]))
        mask_orange = cv2.inRange(crown_hsv, np.array([8, 140, 125]), np.array([22, 255, 255]))
        mask_blue = cv2.inRange(crown_hsv, np.array([98, 130, 95]), np.array([128, 255, 255]))
        mask_red = cv2.bitwise_or(
            cv2.inRange(crown_hsv, np.array([0, 140, 95]), np.array([8, 255, 255])),
            cv2.inRange(crown_hsv, np.array([170, 140, 95]), np.array([180, 255, 255]))
        )
        mask_green = cv2.inRange(crown_hsv, np.array([42, 105, 95]), np.array([85, 255, 255]))
        mask_white = cv2.inRange(crown_hsv, np.array([0, 0, 155]), np.array([180, 45, 255]))

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

        best_color, max_pixels = max(color_counts.items(), key=lambda item: item[1])
        best_ratio = max_pixels / crown_pixels

        # 4. Kraft Paper Bag Rejection:
        mask_kraft = cv2.inRange(crown_hsv, np.array([10, 60, 90]), np.array([20, 160, 210]))
        kraft_ratio = cv2.countNonZero(mask_kraft) / crown_pixels
        mean_h = float(np.mean(crown_hsv[:, :, 0]))
        mean_s = float(np.mean(crown_hsv[:, :, 1]))
        mean_v = float(np.mean(crown_hsv[:, :, 2]))
        if kraft_ratio >= 0.32 or ((12 <= mean_h <= 20) and (75 <= mean_s <= 160) and (95 <= mean_v <= 210)):
            return False, "PAPER_BAG", white_ratio, colored_ratio, crown_roi_global

        # 5. Authentic Colored Hardhat (Yellow, Orange, Blue, Red, Green):
        # Requires at least 28% coverage of skull dome, strictly exceeding hair ratio, and plastic smoothness
        if best_color != "WHITE" and best_ratio >= 0.28 and best_ratio > hair_ratio and lap_var < 340:
            return True, best_color, white_ratio, colored_ratio, crown_roi_global

        # 6. Authentic White Hardhat:
        # Requires at least 35% solid white plastic coverage, low hair (<20%), and smooth finish (lap_var < 200)
        if best_color == "WHITE" and white_ratio >= 0.35 and hair_ratio < 0.20 and white_ratio > hair_ratio and lap_var < 200:
            return True, "WHITE", white_ratio, colored_ratio, crown_roi_global

        # 7. Explicit Bare Hair Rejection:
        # If dark/brown hair covers 25%+ of skull dome, it is unequivocally bare hair!
        if hair_ratio >= 0.25:
            return False, "BARE_HAIR", white_ratio, colored_ratio, crown_roi_global

        # 8. Explicit Bare Forehead/Skin Rejection:
        if skin_ratio >= 0.28:
            return False, "BARE_SKIN", white_ratio, colored_ratio, crown_roi_global

        # 9. Natural Hair Fiber Texture Rejection:
        if lap_var >= 260 and hair_ratio >= 0.15:
            return False, "HAIR_TEXTURE", white_ratio, colored_ratio, crown_roi_global

        return False, "NONE", white_ratio, colored_ratio, crown_roi_global

    def _check_vest_hsv(self, torso_crop: np.ndarray) -> Tuple[bool, str, float]:
        """
        Checks for genuine fluorescent safety vest colors (Neon Yellow / Lime / Hi-Vis Orange).
        Subtracted against human skin and brown/tan clothes to prevent bare chest / tank top false passes.
        """
        if torso_crop.size == 0:
            return False, "NONE", 0.0

        hsv = cv2.cvtColor(torso_crop, cv2.COLOR_BGR2HSV)
        ycrcb = cv2.cvtColor(torso_crop, cv2.COLOR_BGR2YCrCb)
        total_pixels = torso_crop.shape[0] * torso_crop.shape[1]
        if total_pixels == 0:
            return False, "NONE", 0.0

        # Illumination-robust skin mask to prevent bare chest from passing as an orange/yellow vest
        mask_skin = cv2.bitwise_and(
            cv2.inRange(ycrcb, np.array([0, 133, 77]), np.array([255, 173, 127])),
            cv2.inRange(hsv, np.array([0, 25, 45]), np.array([28, 220, 255])),
        )

        # Fluorescent Neon Yellow / Lime: H: 24-45, S: 110-255, V: 115-255 (intensely fluorescent)
        mask_neon_raw = cv2.inRange(hsv, np.array([24, 110, 115]), np.array([45, 255, 255]))
        mask_neon = cv2.bitwise_and(mask_neon_raw, cv2.bitwise_not(mask_skin))

        # Fluorescent Neon Green: H: 45-80, S: 110-255, V: 115-255
        mask_green = cv2.inRange(hsv, np.array([45, 110, 115]), np.array([80, 255, 255]))

        # Hi-Vis Fluorescent Safety Orange: H: 7-20, S: 155-255, V: 125-255 (MUST NOT be skin or brown clothes!)
        mask_orange_raw = cv2.inRange(hsv, np.array([7, 155, 125]), np.array([20, 255, 255]))
        mask_orange = cv2.bitwise_and(mask_orange_raw, cv2.bitwise_not(mask_skin))

        # Industrial Safety Blue: H: 98-128, S: 120-255, V: 90-255
        mask_blue = cv2.inRange(hsv, np.array([98, 120, 90]), np.array([128, 255, 255]))

        neon_px = cv2.countNonZero(mask_neon) + cv2.countNonZero(mask_green)
        orange_px = cv2.countNonZero(mask_orange)
        blue_px = cv2.countNonZero(mask_blue)

        neon_ratio = neon_px / total_pixels
        orange_ratio = orange_px / total_pixels
        blue_ratio = blue_px / total_pixels

        if neon_ratio >= 0.16:
            return True, "NEON_YELLOW", neon_ratio
        elif orange_ratio >= 0.16:
            return True, "HI_VIS_ORANGE", orange_ratio
        elif blue_ratio >= 0.20:
            return True, "SAFETY_BLUE", blue_ratio

        return False, "NONE", max(neon_ratio, orange_ratio, blue_ratio)
