import os
import cv2
import pickle
import time
import urllib.request
import numpy as np
from pathlib import Path
from typing import Optional, Tuple, List, Dict

MODELS_DIR = Path(__file__).resolve().parent / "models"
DB_PATH = Path(__file__).resolve().parent / "worker_face_db.pkl"

YUNET_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
SFACE_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx"

class WorkerFaceEngine:
    """
    High-performance CPU face detection and recognition engine.
    Uses OpenCV SOTA YuNet detector + SFace recognizer with resilient fallback.
    """
    def __init__(self, db_path: Optional[Path] = None, cosine_threshold: float = 0.38):
        self.db_path = db_path or DB_PATH
        self.cosine_threshold = cosine_threshold
        self.database: Dict[str, np.ndarray] = {"names": [], "embeddings": np.empty((0, 128), dtype=np.float32)}
        self._last_db_mtime: float = 0.0
        
        self.detector = None
        self.recognizer = None
        self.use_native_sface = False
        
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        self.yunet_path = MODELS_DIR / "face_detection_yunet_2023mar.onnx"
        self.sface_path = MODELS_DIR / "face_recognition_sface_2021dec.onnx"
        
        self._init_models()
        self.load_database()

    def _init_models(self):
        """Attempts to load OpenCV SOTA YuNet & SFace models, downloading if missing."""
        try:
            # Check/download YuNet
            if not self.yunet_path.exists():
                print(f"[FaceEngine] Downloading YuNet face detector model to {self.yunet_path}...")
                try:
                    urllib.request.urlretrieve(YUNET_URL, str(self.yunet_path))
                except Exception as e:
                    print(f"[FaceEngine Warning] Could not download YuNet: {e}")

            # Check/download SFace
            if not self.sface_path.exists():
                print(f"[FaceEngine] Downloading SFace face recognition model to {self.sface_path}...")
                try:
                    urllib.request.urlretrieve(SFACE_URL, str(self.sface_path))
                except Exception as e:
                    print(f"[FaceEngine Warning] Could not download SFace: {e}")

            if self.yunet_path.exists() and self.sface_path.exists():
                self.detector = cv2.FaceDetectorYN.create(
                    str(self.yunet_path), "", (320, 320), 0.6, 0.3, 5000
                )
                self.recognizer = cv2.FaceRecognizerSF.create(str(self.sface_path), "")
                self.use_native_sface = True
                print("[FaceEngine] Initialized native OpenCV YuNet + SFace models successfully.")
            else:
                print("[FaceEngine] Running in resilient Lightweight Feature Extraction mode.")
        except Exception as ex:
            print(f"[FaceEngine] Native SFace initialization fallback: {ex}")
            self.use_native_sface = False

    def load_database(self):
        """Loads serialized face embeddings from disk."""
        if self.db_path.exists():
            try:
                self._last_db_mtime = self.db_path.stat().st_mtime
                with open(self.db_path, "rb") as f:
                    data = pickle.load(f)
                    self.database["names"] = list(data.get("names", []))
                    embeddings = data.get("embeddings", [])
                    if len(embeddings) > 0:
                        self.database["embeddings"] = np.array(embeddings, dtype=np.float32)
                    else:
                        self.database["embeddings"] = np.empty((0, 128), dtype=np.float32)
                print(f"[FaceEngine] Loaded {len(self.database['names'])} enrolled worker profiles from {self.db_path.name}.")
            except Exception as e:
                print(f"[FaceEngine Error] Failed to read {self.db_path}: {e}")

    def save_database(self):
        """Saves current enrolled database to disk."""
        with open(self.db_path, "wb") as f:
            pickle.dump(self.database, f)
        if self.db_path.exists():
            self._last_db_mtime = self.db_path.stat().st_mtime
        print(f"[FaceEngine] Saved {len(self.database['names'])} worker profiles to {self.db_path}.")

    def _extract_fallback_embedding(self, face_crop: np.ndarray) -> np.ndarray:
        """Extracts a normalized 128-dimensional spatial and color descriptor on CPU."""
        resized = cv2.resize(face_crop, (64, 64))
        # Color distribution (HSV 32 bins)
        hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
        hist_h = cv2.calcHist([hsv], [0], None, [16], [0, 180]).flatten()
        hist_s = cv2.calcHist([hsv], [1], None, [16], [0, 256]).flatten()
        
        # Spatial gradients (Sobel 64 bins)
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
        mag, _ = cv2.cartToPolar(gx, gy)
        grad_hist = cv2.calcHist([mag], [0], None, [32], [0, 255]).flatten()
        
        # Geometric block luminance (64 bins)
        blocks = cv2.resize(gray, (8, 8)).flatten().astype(np.float32)
        
        vec = np.concatenate([hist_h, hist_s, grad_hist, blocks])  # 16 + 16 + 32 + 64 = 128-D
        norm = np.linalg.norm(vec)
        if norm > 1e-6:
            vec = vec / norm
        return vec.astype(np.float32)

    def extract_embedding(self, image: np.ndarray) -> Optional[np.ndarray]:
        """Detects frontal face and extracts normalized 128-D embedding."""
        if image is None or image.size == 0:
            return None

        h, w = image.shape[:2]

        if self.use_native_sface and self.detector and self.recognizer:
            self.detector.setInputSize((w, h))
            _, faces = self.detector.detect(image)
            if faces is not None and len(faces) > 0:
                best_face = faces[0]
                aligned_face = self.recognizer.alignCrop(image, best_face)
                feature = self.recognizer.feature(aligned_face)
                norm = np.linalg.norm(feature)
                if norm > 1e-6:
                    feature = feature / norm
                return feature.flatten().astype(np.float32)
            else:
                # No face detected in the image
                return None

        # Resilient fallback using upper crop when native models unavailable
        return self._extract_fallback_embedding(image)

    def enroll_worker(
        self,
        name: str,
        face_images: List[np.ndarray],
        save_crops: bool = True,
    ) -> bool:
        """
        Enrolls a worker by averaging embeddings across multiple reference photos.
        Saves cropped face photos to aiml_test_data/faces/<name> and updates database.
        """
        embeddings = []
        clean_name = "".join(c for c in name if c.isalnum() or c in (" ", "_", "-")).strip()
        if not clean_name:
            clean_name = "Worker"

        test_data_dir = Path(__file__).resolve().parent.parent / "aiml_test_data" / "faces" / clean_name
        known_workers_dir = Path(__file__).resolve().parent / "known_workers" / clean_name
        if save_crops:
            test_data_dir.mkdir(parents=True, exist_ok=True)
            known_workers_dir.mkdir(parents=True, exist_ok=True)

        sample_idx = 0
        for img in face_images:
            if img is None or img.size == 0:
                continue

            h, w = img.shape[:2]
            best_face = None
            if self.use_native_sface and self.detector:
                self.detector.setInputSize((w, h))
                _, faces = self.detector.detect(img)
                if faces is not None and len(faces) > 0:
                    best_face = faces[0]

            emb = None
            if best_face is not None and self.recognizer:
                aligned_face = self.recognizer.alignCrop(img, best_face)
                feature = self.recognizer.feature(aligned_face)
                norm = np.linalg.norm(feature)
                if norm > 1e-6:
                    emb = (feature / norm).flatten().astype(np.float32)

                if save_crops:
                    sample_idx += 1
                    cv2.imwrite(str(test_data_dir / f"face_{sample_idx:02d}.jpg"), aligned_face)
                    cv2.imwrite(str(known_workers_dir / f"face_{sample_idx:02d}.jpg"), aligned_face)
            else:
                emb = self.extract_embedding(img)
                if emb is not None and save_crops:
                    sample_idx += 1
                    cv2.imwrite(str(test_data_dir / f"face_{sample_idx:02d}.jpg"), img)
                    cv2.imwrite(str(known_workers_dir / f"face_{sample_idx:02d}.jpg"), img)

            if emb is not None:
                embeddings.append(emb)

        if not embeddings:
            print(f"[FaceEngine] Failed to extract facial reference for {clean_name}.")
            return False

        avg_emb = np.mean(embeddings, axis=0)
        norm = np.linalg.norm(avg_emb)
        if norm > 1e-6:
            avg_emb = avg_emb / norm

        # If worker already exists, update their embedding instead of appending duplicate
        if clean_name in self.database["names"]:
            idx = self.database["names"].index(clean_name)
            self.database["embeddings"][idx] = avg_emb
            print(f"[FaceEngine] Updated existing profile: {clean_name}")
        else:
            self.database["names"].append(clean_name)
            if len(self.database["embeddings"]) == 0:
                self.database["embeddings"] = np.array([avg_emb], dtype=np.float32)
            else:
                self.database["embeddings"] = np.vstack([self.database["embeddings"], avg_emb])
            print(f"[FaceEngine] Enrolled new worker: {clean_name} (Total profiles: {len(self.database['names'])})")

        self.save_database()

        # Update aiml_test_data roster manifest
        try:
            import json
            roster_file = Path(__file__).resolve().parent.parent / "aiml_test_data" / "roster.json"
            roster_file.parent.mkdir(parents=True, exist_ok=True)
            roster_data = {}
            if roster_file.exists():
                try:
                    with open(roster_file, "r", encoding="utf-8") as rf:
                        roster_data = json.load(rf)
                except Exception:
                    roster_data = {}
            roster_data[clean_name] = {
                "enrolled_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "samples_count": len(embeddings),
                "model": "SFace_2021dec_128D",
                "cosine_threshold": float(self.cosine_threshold),
            }
            with open(roster_file, "w", encoding="utf-8") as rf:
                json.dump(roster_data, rf, indent=2)
        except Exception as ex:
            print(f"[FaceEngine] Warning: Could not update roster.json: {ex}")

        return True

    def delete_worker(self, name: str) -> bool:
        """Removes a worker from the enrolled face database."""
        if name not in self.database["names"]:
            return False
        idx = self.database["names"].index(name)
        self.database["names"].pop(idx)
        self.database["embeddings"] = np.delete(self.database["embeddings"], idx, axis=0)
        self.save_database()
        print(f"[FaceEngine] Removed worker '{name}' from database.")
        return True

    def identify_face(
        self,
        person_crop: np.ndarray,
        matched_face_raw: Optional[np.ndarray] = None,
        full_frame: Optional[np.ndarray] = None,
    ) -> Tuple[str, float]:
        """
        Matches a person image crop or raw face landmarks against the enrolled database.
        Auto-reloads if worker_face_db.pkl was modified on disk.
        Returns:
            Tuple of (Identified Worker Name, Cosine Match Score)
        """
        # Hot-reload face database if touched on disk
        if self.db_path.exists():
            try:
                mtime = self.db_path.stat().st_mtime
                if mtime > self._last_db_mtime:
                    self.load_database()
            except Exception:
                pass

        if len(self.database["names"]) == 0 or len(self.database["embeddings"]) == 0:
            return "Unregistered Worker", 0.0

        emb = None
        # Prefer direct alignment from full frame with YuNet landmarks (highest precision)
        if (
            self.use_native_sface
            and self.recognizer
            and matched_face_raw is not None
            and full_frame is not None
            and full_frame.size > 0
        ):
            try:
                aligned_face = self.recognizer.alignCrop(full_frame, matched_face_raw)
                feature = self.recognizer.feature(aligned_face)
                norm = np.linalg.norm(feature)
                if norm > 1e-6:
                    emb = (feature / norm).flatten().astype(np.float32)
            except Exception:
                emb = None

        if emb is None:
            emb = self.extract_embedding(person_crop)

        if emb is None:
            return "Unidentified Worker", 0.0

        # Cosine similarity across enrolled embeddings (all normalized)
        scores = np.dot(self.database["embeddings"], emb)
        best_idx = int(np.argmax(scores))
        best_score = float(scores[best_idx])

        if best_score >= self.cosine_threshold:
            return self.database["names"][best_idx], best_score

        return "Unidentified Worker", best_score
