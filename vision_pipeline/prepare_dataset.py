"""
PS6 YOLO Dataset Ingestion & Auto-Split Utility
Problem Statement 06 — Multimodal Industrial Safety & Hazard Monitoring System
Organizes raw image + label pairs into standard YOLO splits (train/val/test)
and updates dataset configuration YAML.
"""

import os
import sys
import shutil
import random
import argparse
from pathlib import Path

# Add vision_pipeline to sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from dataset_validator import DatasetValidator, SUPPORTED_IMAGE_EXTS


def organize_and_split_dataset(
    source_dir: str,
    target_dataset_dir: str = "vision_pipeline/dataset",
    train_ratio: float = 0.80,
    val_ratio: float = 0.15,
    test_ratio: float = 0.05,
    seed: int = 42,
    copy_files: bool = True,
) -> dict:
    """
    Ingests images and corresponding .txt labels from source_dir,
    splits them into train/val/test, and copies/moves them into target_dataset_dir.
    """
    src = Path(source_dir).resolve()
    dst = Path(target_dataset_dir).resolve()

    if not src.exists():
        raise FileNotFoundError(f"Source directory does not exist: {src}")

    # Gather images
    all_images = [f for f in src.rglob("*") if f.is_file() and f.suffix.lower() in SUPPORTED_IMAGE_EXTS]
    print(f"[Dataset Ingest] Discovered {len(all_images)} images in {src}")

    if len(all_images) == 0:
        print("[Dataset Ingest] Warning: No supported images found in source directory.")
        return {"total_images": 0, "status": "NO_IMAGES"}

    random.seed(seed)
    random.shuffle(all_images)

    n_total = len(all_images)
    n_train = int(n_total * train_ratio)
    n_val = int(n_total * val_ratio)
    n_test = n_total - n_train - n_val

    splits = {
        "train": all_images[:n_train],
        "val": all_images[n_train : n_train + n_val],
        "test": all_images[n_train + n_val :],
    }

    print(f"[Dataset Split] Partition plan: {n_train} train, {n_val} val, {n_test} test")

    stats = {"train": 0, "val": 0, "test": 0, "missing_labels": 0}

    for split_name, img_list in splits.items():
        img_out = dst / "images" / split_name
        lbl_out = dst / "labels" / split_name
        img_out.mkdir(parents=True, exist_ok=True)
        lbl_out.mkdir(parents=True, exist_ok=True)

        for img_path in img_list:
            # Transfer image
            target_img = img_out / img_path.name
            if copy_files:
                shutil.copy2(img_path, target_img)
            else:
                shutil.move(img_path, target_img)

            # Locate matching label
            candidate_labels = [
                img_path.with_suffix(".txt"),
                img_path.parent / f"{img_path.stem}.txt",
                src / "labels" / f"{img_path.stem}.txt",
            ]
            found_label = None
            for cl in candidate_labels:
                if cl.exists():
                    found_label = cl
                    break

            if found_label:
                target_lbl = lbl_out / f"{img_path.stem}.txt"
                if copy_files:
                    shutil.copy2(found_label, target_lbl)
                else:
                    shutil.move(found_label, target_lbl)
            else:
                stats["missing_labels"] += 1

            stats[split_name] += 1

    print("\n[Dataset Ingest] Organization complete:")
    print(f"  - Train: {stats['train']} images")
    print(f"  - Val:   {stats['val']} images")
    print(f"  - Test:  {stats['test']} images")
    if stats["missing_labels"] > 0:
        print(f"  - Missing .txt annotations: {stats['missing_labels']}")

    # Run certification validator
    yaml_target = dst / "ppe_dataset.yaml"
    if yaml_target.exists():
        print("\n[Certification] Validating newly populated dataset...")
        validator = DatasetValidator(str(yaml_target))
        validator.validate()
        validator.print_summary()

    return stats


def main():
    parser = argparse.ArgumentParser(description="PS6 YOLO Dataset Ingestion & Split Tool")
    parser.add_argument("--source", type=str, required=True, help="Directory containing raw images & labels")
    parser.add_argument("--target", type=str, default="vision_pipeline/dataset", help="Target dataset root")
    parser.add_argument("--train-ratio", type=float, default=0.80, help="Train ratio (default 0.80)")
    parser.add_argument("--val-ratio", type=float, default=0.15, help="Val ratio (default 0.15)")
    parser.add_argument("--test-ratio", type=float, default=0.05, help="Test ratio (default 0.05)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    parser.add_argument("--move", action="store_true", help="Move files instead of copying")

    args = parser.parse_args()
    organize_and_split_dataset(
        source_dir=args.source,
        target_dataset_dir=args.target,
        train_ratio=args.train_ratio,
        val_ratio=args.val_ratio,
        test_ratio=args.test_ratio,
        seed=args.seed,
        copy_files=not args.move,
    )


if __name__ == "__main__":
    main()
