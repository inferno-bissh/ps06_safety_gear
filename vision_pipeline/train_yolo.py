"""
PS6 Autonomous YOLO Training Pipeline
Problem Statement 06 — Multimodal Industrial Safety & Hazard Monitoring System
Supports Ultralytics YOLOv8 / YOLO11, automated device selection (CPU / RTX 3050),
dataset validation gates, smoke testing, and checkpoint tracking.
"""

import os
import sys
import argparse
import time
from pathlib import Path

# Add vision_pipeline to sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from dataset_validator import DatasetValidator


def detect_optimal_device() -> str:
    """
    Detects hardware capabilities and selects device ('0' for CUDA GPU, 'cpu' for CPU).
    """
    try:
        import torch
        if torch.cuda.is_available() and torch.cuda.device_count() > 0:
            gpu_name = torch.cuda.get_device_name(0)
            print(f"[Hardware] CUDA GPU Detected: {gpu_name}")
            return "0"
        else:
            print("[Hardware] No active CUDA device available in current PyTorch build. Using CPU.")
            return "cpu"
    except Exception as e:
        print(f"[Hardware] PyTorch device detection error ({e}). Defaulting to CPU.")
        return "cpu"


def train_yolo(
    data_yaml: str,
    base_model: str = "yolov8n.pt",
    epochs: int = 50,
    batch_size: int = 8,
    img_size: int = 640,
    device: str = "auto",
    project: str = "runs/detect",
    name: str = "ps6_ppe_train",
    smoke_test: bool = False,
    resume: bool = False,
    workers: int = 2,
) -> dict:
    """
    Executes YOLO model training with validation gates and logging.
    """
    print("=" * 65)
    print("      PS6 AUTONOMOUS YOLO TRAINING ENGINE")
    print("=" * 65)
    start_time = time.time()

    yaml_path = Path(data_yaml)
    is_builtin = not yaml_path.exists() and len(yaml_path.parts) == 1

    if not yaml_path.exists() and not is_builtin:
        raise FileNotFoundError(f"Dataset configuration YAML does not exist: {yaml_path}")

    # Step 1: Dataset Validation Gate
    if not is_builtin:
        print(f"[Phase 1/4] Validating Dataset Integrity: {yaml_path.name}...")
        validator = DatasetValidator(str(yaml_path))
        val_report = validator.validate()

        total_train_imgs = val_report.get("splits", {}).get("train", {}).get("image_count", 0)
        total_val_imgs = val_report.get("splits", {}).get("val", {}).get("image_count", 0)

        if not smoke_test and (total_train_imgs == 0 or total_val_imgs == 0):
            print("\n[VALIDATION HALT] Cannot start full training run:")
            print(f"  - Training images available: {total_train_imgs}")
            print(f"  - Validation images available: {total_val_imgs}")
            print("  - Place training images and labels into 'images/train', 'images/val' before launching full training.")
            return {
                "status": "HALTED_MISSING_DATA",
                "message": "Dataset contains 0 images in train/val split.",
                "val_report": val_report,
            }
    else:
        print(f"[Phase 1/4] Using Built-in Ultralytics Dataset: {data_yaml} (Smoke/Benchmark Mode)...")

    # Step 2: Resolve Target Device & Batch Configuration
    if device == "auto":
        target_device = detect_optimal_device()
    else:
        target_device = device

    # For 4GB VRAM GPU or CPU, enforce safe batch size
    if target_device == "0" and batch_size > 16:
        print(f"[Resource Guard] Throttling batch size from {batch_size} to 16 to avoid VRAM OOM on 4GB GPU.")
        batch_size = 16
    elif target_device == "cpu" and batch_size > 8:
        print(f"[Resource Guard] Adjusting batch size to 4 for CPU execution.")
        batch_size = 4

    if smoke_test:
        print("[Smoke Test Mode] Overriding parameters for rapid pipeline verification:")
        epochs = 1
        batch_size = min(batch_size, 2)
        img_size = min(img_size, 320)
        print(f"  - Epochs: {epochs}, Batch: {batch_size}, ImgSize: {img_size}")

    # Step 3: Model Initialization
    print(f"[Phase 2/4] Initializing Base Model: {base_model}...")
    from ultralytics import YOLO

    # Resolve local or standard weights
    model_path = Path(base_model)
    if not model_path.exists():
        # Check vision_pipeline/
        candidate = SCRIPT_DIR / base_model
        if candidate.exists():
            model_path = candidate

    model = YOLO(str(model_path))
    print(f"  - Base Architecture: {model.task}")
    print(f"  - Loaded Weights: {model_path}")

    # Step 4: Training Execution
    print(f"[Phase 3/4] Launching Training on device='{target_device}'...")
    print(f"  - Dataset: {yaml_path}")
    print(f"  - Output Dir: {project}/{name}")
    print(f"  - Epochs: {epochs} | Batch: {batch_size} | Resolution: {img_size}x{img_size}")

    try:
        results = model.train(
            data=str(yaml_path),
            epochs=epochs,
            batch=batch_size,
            imgsz=img_size,
            device=target_device,
            project=project,
            name=name,
            workers=workers,
            resume=resume,
            exist_ok=True,
            verbose=True,
            plots=True,
            save=True,
            cache=False,
        )

        elapsed = time.time() - start_time
        print("=" * 65)
        print(f"[Phase 4/4] Training Completed Successfully in {elapsed:.1f}s!")
        save_dir = getattr(results, "save_dir", Path(project) / name)
        best_pt = Path(save_dir) / "weights" / "best.pt"
        last_pt = Path(save_dir) / "weights" / "last.pt"

        print(f"  - Checkpoints Directory: {save_dir}")
        print(f"  - Best Model: {best_pt} (Exists: {best_pt.exists()})")
        print(f"  - Last Model: {last_pt} (Exists: {last_pt.exists()})")
        print("=" * 65)

        return {
            "status": "SUCCESS",
            "save_dir": str(save_dir),
            "best_weights": str(best_pt) if best_pt.exists() else None,
            "last_weights": str(last_pt) if last_pt.exists() else None,
            "elapsed_seconds": elapsed,
        }

    except Exception as e:
        print(f"\n[TRAINING FAILURE] Error during training execution: {e}")
        import traceback
        traceback.print_exc()
        return {
            "status": "FAILED",
            "error": str(e),
        }


def main():
    parser = argparse.ArgumentParser(description="PS6 Autonomous YOLO Training Pipeline")
    parser.add_argument("--data", type=str, default="vision_pipeline/dataset/ppe_dataset.yaml", help="Path to data YAML")
    parser.add_argument("--model", type=str, default="yolov8n.pt", help="Base model weights")
    parser.add_argument("--epochs", type=int, default=50, help="Number of training epochs")
    parser.add_argument("--batch", type=int, default=8, help="Batch size")
    parser.add_argument("--imgsz", type=int, default=640, help="Image resolution")
    parser.add_argument("--device", type=str, default="auto", help="Device ('auto', 'cpu', '0')")
    parser.add_argument("--project", type=str, default="runs/detect", help="Experiment save folder")
    parser.add_argument("--name", type=str, default="ps6_ppe_train", help="Experiment run name")
    parser.add_argument("--smoke-test", action="store_true", help="Run rapid 1-epoch pipeline smoke test")
    parser.add_argument("--resume", action="store_true", help="Resume interrupted training")
    parser.add_argument("--workers", type=int, default=2, help="DataLoader worker threads")

    args = parser.parse_args()

    res = train_yolo(
        data_yaml=args.data,
        base_model=args.model,
        epochs=args.epochs,
        batch_size=args.batch,
        img_size=args.imgsz,
        device=args.device,
        project=args.project,
        name=args.name,
        smoke_test=args.smoke_test,
        resume=args.resume,
        workers=args.workers,
    )

    if res.get("status") not in ["SUCCESS"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
