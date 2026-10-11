"""
PS6 Autonomous YOLO Dataset Validator
Verifies dataset integrity, annotation format, class consistency,
split balance, and detects data leakage or malformed boxes.
"""

import os
import sys
import yaml
import hashlib
from pathlib import Path
from typing import Dict, List, Tuple, Set, Optional

SUPPORTED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}

class DatasetValidator:
    def __init__(self, yaml_path: str):
        self.yaml_path = Path(yaml_path).resolve()
        self.root_dir = self.yaml_path.parent
        self.config: dict = {}
        self.class_names: Dict[int, str] = {}
        self.results: dict = {
            "valid": True,
            "errors": [],
            "warnings": [],
            "splits": {},
            "class_counts": {},
            "leakage_detected": False,
        }

    def load_config(self) -> bool:
        if not self.yaml_path.exists():
            self.results["valid"] = False
            self.results["errors"].append(f"Dataset YAML file not found: {self.yaml_path}")
            return False

        try:
            with open(self.yaml_path, "r", encoding="utf-8") as f:
                self.config = yaml.safe_load(f) or {}
        except Exception as e:
            self.results["valid"] = False
            self.results["errors"].append(f"Failed to parse YAML file: {e}")
            return False

        raw_names = self.config.get("names", {})
        if isinstance(raw_names, list):
            self.class_names = {i: name for i, name in enumerate(raw_names)}
        elif isinstance(raw_names, dict):
            self.class_names = {int(k): str(v) for k, v in raw_names.items()}
        else:
            self.results["valid"] = False
            self.results["errors"].append("Invalid 'names' field in YAML. Must be a list or dictionary.")
            return False

        for cid, cname in self.class_names.items():
            self.results["class_counts"][cname] = 0

        # Resolve base dataset path
        cfg_path = self.config.get("path", "")
        if cfg_path:
            p = Path(cfg_path)
            self.dataset_base = p if p.is_absolute() else (self.yaml_path.parent / p).resolve()
        else:
            self.dataset_base = self.yaml_path.parent

        return True

    def _get_split_dir(self, key: str) -> Optional[Path]:
        rel = self.config.get(key)
        if not rel:
            return None
        p = Path(rel)
        return p if p.is_absolute() else (self.dataset_base / p).resolve()

    def _file_hash(self, path: Path) -> str:
        h = hashlib.md5()
        with open(path, "rb") as f:
            while chunk := f.read(65536):
                h.update(chunk)
        return h.hexdigest()

    def validate(self) -> dict:
        if not self.load_config():
            return self.results

        splits_to_check = ["train", "val", "test"]
        split_hashes: Dict[str, Dict[str, str]] = {}  # split -> {hash: filename}
        split_files: Dict[str, Set[str]] = {}

        for split in splits_to_check:
            img_dir = self._get_split_dir(split)
            if img_dir is None:
                if split in ["train", "val"]:
                    self.results["errors"].append(f"Required split '{split}' not defined in YAML.")
                    self.results["valid"] = False
                continue

            if not img_dir.exists():
                if split in ["train", "val"]:
                    self.results["errors"].append(f"Directory for split '{split}' does not exist: {img_dir}")
                    self.results["valid"] = False
                continue

            # Expected labels directory
            # Ultralytics convention: replace '/images/' with '/labels/'
            parts = list(img_dir.parts)
            if "images" in parts:
                lbl_parts = [p if p != "images" else "labels" for p in parts]
                lbl_dir = Path(*lbl_parts)
            else:
                lbl_dir = img_dir.parent / "labels" / img_dir.name

            img_files = [f for f in img_dir.iterdir() if f.is_file() and f.suffix.lower() in SUPPORTED_IMAGE_EXTS]
            split_files[split] = {f.name for f in img_files}
            split_hashes[split] = {}

            split_stat = {
                "image_count": len(img_files),
                "label_dir": str(lbl_dir),
                "paired_labels": 0,
                "missing_labels": 0,
                "empty_labels": 0,
                "malformed_lines": 0,
                "out_of_bounds_boxes": 0,
                "invalid_class_ids": 0,
                "total_boxes": 0,
            }

            if len(img_files) == 0:
                if split in ["train", "val"]:
                    self.results["warnings"].append(f"Split '{split}' directory contains 0 images.")

            for img_path in img_files:
                # Track hash for split leakage
                try:
                    fhash = self._file_hash(img_path)
                    split_hashes[split][fhash] = img_path.name
                except Exception:
                    pass

                lbl_file = lbl_dir / f"{img_path.stem}.txt"
                if not lbl_file.exists():
                    split_stat["missing_labels"] += 1
                    continue

                split_stat["paired_labels"] += 1

                try:
                    with open(lbl_file, "r", encoding="utf-8") as lf:
                        lines = [line.strip() for line in lf if line.strip()]

                    if len(lines) == 0:
                        split_stat["empty_labels"] += 1
                        continue

                    for line_idx, line in enumerate(lines, start=1):
                        tokens = line.split()
                        if len(tokens) != 5:
                            split_stat["malformed_lines"] += 1
                            self.results["errors"].append(
                                f"Malformed label in {lbl_file.name}:{line_idx} (expected 5 tokens, got {len(tokens)})"
                            )
                            continue

                        try:
                            cls_id = int(tokens[0])
                            xc, yc, w, h = map(float, tokens[1:])
                        except ValueError:
                            split_stat["malformed_lines"] += 1
                            self.results["errors"].append(f"Non-numeric values in {lbl_file.name}:{line_idx}")
                            continue

                        # Check Class ID range
                        if cls_id not in self.class_names:
                            split_stat["invalid_class_ids"] += 1
                            self.results["errors"].append(
                                f"Invalid class ID {cls_id} in {lbl_file.name}:{line_idx} (configured classes: {list(self.class_names.keys())})"
                            )
                        else:
                            cname = self.class_names[cls_id]
                            self.results["class_counts"][cname] = self.results["class_counts"].get(cname, 0) + 1

                        # Check Normalized Coordinates
                        if not (0.0 <= xc <= 1.0 and 0.0 <= yc <= 1.0 and 0.0 < w <= 1.0 and 0.0 < h <= 1.0):
                            split_stat["out_of_bounds_boxes"] += 1
                            self.results["warnings"].append(
                                f"Coordinate out of [0, 1] bounds in {lbl_file.name}:{line_idx} [cls={cls_id}, xc={xc:.3f}, yc={yc:.3f}, w={w:.3f}, h={h:.3f}]"
                            )

                        split_stat["total_boxes"] += 1

                except Exception as e:
                    self.results["errors"].append(f"Failed to read label file {lbl_file}: {e}")

            self.results["splits"][split] = split_stat

        # Check for split leakage (train vs val / train vs test)
        for s1, s2 in [("train", "val"), ("train", "test"), ("val", "test")]:
            if s1 in split_hashes and s2 in split_hashes:
                common_hashes = set(split_hashes[s1].keys()) & set(split_hashes[s2].keys())
                if common_hashes:
                    self.results["leakage_detected"] = True
                    self.results["warnings"].append(
                        f"CRITICAL DATA LEAKAGE: {len(common_hashes)} identical images found between '{s1}' and '{s2}' splits!"
                    )

        # Check class balance
        total_boxes = sum(self.results["class_counts"].values())
        if total_boxes > 0:
            for cname, count in self.results["class_counts"].items():
                pct = (count / total_boxes) * 100
                if pct < 2.0:
                    self.results["warnings"].append(
                        f"Severe class imbalance: Class '{cname}' represents only {pct:.2f}% of total labels ({count}/{total_boxes})."
                    )

        if len(self.results["errors"]) > 0:
            self.results["valid"] = False

        return self.results

    def print_summary(self):
        print("=" * 60)
        print("      PS6 AUTONOMOUS YOLO DATASET VALIDATION REPORT")
        print("=" * 60)
        print(f"Config File:  {self.yaml_path}")
        print(f"Dataset Base: {getattr(self, 'dataset_base', 'N/A')}")
        print(f"Configured Classes ({len(self.class_names)}):")
        for cid, cname in sorted(self.class_names.items()):
            print(f"  [{cid}] {cname}")
        print("-" * 60)

        for split, stat in self.results.get("splits", {}).items():
            print(f"Split: '{split.upper()}'")
            print(f"  Images:        {stat['image_count']}")
            print(f"  Total Boxes:   {stat['total_boxes']}")
            print(f"  Paired Labels: {stat['paired_labels']}")
            print(f"  Missing Labels:{stat['missing_labels']}")
            print(f"  Empty Labels:  {stat['empty_labels']}")
            if stat["malformed_lines"] > 0:
                print(f"  Malformed:     {stat['malformed_lines']} (FAIL)")
            if stat["invalid_class_ids"] > 0:
                print(f"  Invalid ClsIDs:{stat['invalid_class_ids']} (FAIL)")
            print()

        print("-" * 60)
        print("Class Distribution:")
        total = sum(self.results["class_counts"].values())
        for cname, count in self.results["class_counts"].items():
            pct = (count / total * 100) if total > 0 else 0
            print(f"  - {cname:15s}: {count:5d} ({pct:5.1f}%)")
        print("-" * 60)

        if self.results["leakage_detected"]:
            print("ALERT: Split leakage detected between splits!")

        if self.results["warnings"]:
            print(f"Warnings ({len(self.results['warnings'])}):")
            for w in self.results["warnings"][:10]:
                print(f"  [WARN] {w}")
            if len(self.results["warnings"]) > 10:
                print(f"  ... and {len(self.results['warnings']) - 10} more warnings.")

        if self.results["errors"]:
            print(f"Errors ({len(self.results['errors'])}):")
            for e in self.results["errors"][:10]:
                print(f"  [ERROR] {e}")
            if len(self.results["errors"]) > 10:
                print(f"  ... and {len(self.results['errors']) - 10} more errors.")
        print("=" * 60)
        status = "PASSED" if self.results["valid"] and not self.results["errors"] else "FAILED / INCOMPLETE"
        print(f"Overall Status: {status}")
        print("=" * 60)


if __name__ == "__main__":
    target_yaml = sys.argv[1] if len(sys.argv) > 1 else "vision_pipeline/dataset/ppe_dataset.yaml"
    validator = DatasetValidator(target_yaml)
    res = validator.validate()
    validator.print_summary()
    sys.exit(0 if res["valid"] else 1)
