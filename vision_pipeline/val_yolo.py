"""
PS6 Autonomous YOLO Model Validation & Benchmark Pipeline
Problem Statement 06 — Multimodal Industrial Safety & Hazard Monitoring System
Computes mAP@50, mAP@50-95, precision, recall, and tests inference on representative images.
"""

import os
import sys
import argparse
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))


def validate_yolo(
    weights_path: str,
    data_yaml: str,
    img_size: int = 640,
    device: str = "auto",
    project: str = "runs/detect",
    name: str = "val_ppe",
) -> dict:
    """
    Runs formal validation against the validation split defined in data_yaml.
    """
    from ultralytics import YOLO

    w_path = Path(weights_path)
    if not w_path.exists():
        candidate = SCRIPT_DIR / weights_path
        if candidate.exists():
            w_path = candidate
        else:
            raise FileNotFoundError(f"Model weights file not found: {weights_path}")

    d_path = Path(data_yaml)
    is_builtin = not d_path.exists() and len(d_path.parts) == 1
    if not d_path.exists() and not is_builtin:
        raise FileNotFoundError(f"Dataset YAML file not found: {data_yaml}")

    if device == "auto":
        import torch
        target_device = "0" if (torch.cuda.is_available() and torch.cuda.device_count() > 0) else "cpu"
    else:
        target_device = device

    print("=" * 65)
    print("      PS6 AUTONOMOUS YOLO VALIDATION & BENCHMARK")
    print("=" * 65)
    print(f"Weights: {w_path}")
    print(f"Data:    {d_path}")
    print(f"Device:  {target_device}")

    model = YOLO(str(w_path))
    metrics = model.val(
        data=str(d_path),
        imgsz=img_size,
        device=target_device,
        project=project,
        name=name,
        exist_ok=True,
        verbose=True,
    )

    print("\n" + "=" * 65)
    print("      MEASURED VALIDATION BENCHMARKS")
    print("=" * 65)
    map50 = getattr(metrics.box, "map50", 0.0)
    map50_95 = getattr(metrics.box, "map", 0.0)
    mp = getattr(metrics.box, "mp", 0.0)
    mr = getattr(metrics.box, "mr", 0.0)

    print(f"  - Precision (all classes): {mp:.4f} ({mp*100:.1f}%)")
    print(f"  - Recall (all classes):    {mr:.4f} ({mr*100:.1f}%)")
    print(f"  - mAP@50:                  {map50:.4f} ({map50*100:.1f}%)")
    print(f"  - mAP@50-95:               {map50_95:.4f} ({map50_95*100:.1f}%)")

    # Per-class breakdown
    names = getattr(model, "names", {})
    maps = getattr(metrics.box, "maps", [])
    if len(maps) > 0 and isinstance(names, dict):
        print("\n  Per-Class mAP@50-95 Breakdown:")
        for idx, val in enumerate(maps):
            cname = names.get(idx, f"Class {idx}")
            print(f"    - [{idx}] {cname:15s}: {val:.4f} ({val*100:.1f}%)")

    print("=" * 65)
    return {
        "precision": float(mp),
        "recall": float(mr),
        "map50": float(map50),
        "map50_95": float(map50_95),
    }


def run_sample_inference(weights_path: str, image_path: str, conf: float = 0.25, save: bool = True):
    """
    Executes sample inference on an image and prints detected items.
    """
    from ultralytics import YOLO

    w_path = Path(weights_path)
    if not w_path.exists():
        candidate = SCRIPT_DIR / weights_path
        if candidate.exists():
            w_path = candidate

    model = YOLO(str(w_path))
    results = model.predict(source=image_path, conf=conf, save=save, verbose=False)

    print(f"\nInference Results on: {image_path}")
    print(f"Model: {w_path.name} | Conf Threshold: {conf}")
    print("-" * 50)
    if not results or len(results[0].boxes) == 0:
        print("  No objects detected above confidence threshold.")
        return []

    detections = []
    names = model.names
    boxes = results[0].boxes.xyxy.cpu().numpy().astype(int)
    classes = results[0].boxes.cls.cpu().numpy().astype(int)
    scores = results[0].boxes.conf.cpu().numpy()

    for box, cls_id, score in zip(boxes, classes, scores):
        label = names.get(cls_id, str(cls_id))
        detections.append({"label": label, "conf": float(score), "box": box.tolist()})
        print(f"  Detected: {label:15s} | Conf: {score:.3f} | BBox: {box.tolist()}")
    print("-" * 50)
    return detections


def main():
    parser = argparse.ArgumentParser(description="PS6 YOLO Model Validation & Benchmark")
    parser.add_argument("--weights", type=str, default="vision_pipeline/yolov8n_ppe.pt", help="Path to weights")
    parser.add_argument("--data", type=str, default="vision_pipeline/dataset/ppe_dataset.yaml", help="Path to data YAML")
    parser.add_argument("--imgsz", type=int, default=640, help="Image resolution")
    parser.add_argument("--device", type=str, default="auto", help="Device ('auto', 'cpu', '0')")
    parser.add_argument("--infer", type=str, default=None, help="Optional image path to test inference on")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold for inference")

    args = parser.parse_args()

    if args.infer:
        run_sample_inference(args.weights, args.infer, conf=args.conf)
    else:
        validate_yolo(args.weights, args.data, img_size=args.imgsz, device=args.device)


if __name__ == "__main__":
    main()
