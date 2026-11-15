"""
Evaluation script for EmoDent CNN.
Reports overall accuracy, per-class precision, recall, F1 score, and confusion matrix.
"""

import os
import json
import argparse
import numpy as np
import torch
from sklearn.metrics import classification_report, confusion_matrix

from model import EmoDentCNN
from train import load_dataset, TARGET_CLASSES


@torch.no_grad()
def evaluate_full(model: torch.nn.Module, X_test: torch.Tensor, y_test: torch.Tensor, device: torch.device):
    model.eval()
    all_preds = []
    all_targets = []

    batch_size = 256
    for i in range(0, len(X_test), batch_size):
        images = X_test[i:i + batch_size].to(device)
        targets = y_test[i:i + batch_size]
        outputs = model(images)
        _, preds = outputs.max(1)
        all_preds.extend(preds.cpu().numpy().tolist())
        all_targets.extend(targets.numpy().tolist())

    y_pred = np.array(all_preds)
    y_true = np.array(all_targets)

    report_dict = classification_report(
        y_true,
        y_pred,
        target_names=TARGET_CLASSES,
        output_dict=True,
        zero_division=0
    )
    report_text = classification_report(
        y_true,
        y_pred,
        target_names=TARGET_CLASSES,
        zero_division=0
    )
    conf_mat = confusion_matrix(y_true, y_pred)

    overall_acc = float((y_pred == y_true).mean() * 100.0)

    return {
        "overall_accuracy": overall_acc,
        "classification_report_dict": report_dict,
        "classification_report_text": report_text,
        "confusion_matrix": conf_mat.tolist(),
        "classes": TARGET_CLASSES
    }


def main():
    parser = argparse.ArgumentParser(description="Evaluate EmoDent CNN")
    parser.add_argument("--data-dir", type=str, default="./data/fer2013")
    parser.add_argument("--checkpoint", type=str, default="./ml/checkpoints/best_model.pth")
    parser.add_argument("--output-json", type=str, default="./ml/evaluation_report.json")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Loading checkpoint from: {args.checkpoint}")

    model = EmoDentCNN(num_classes=len(TARGET_CLASSES), export_softmax=False).to(device)
    if os.path.exists(args.checkpoint):
        ckpt = torch.load(args.checkpoint, map_location=device)
        model.load_state_dict(ckpt["model_state_dict"])
        print(f"Loaded checkpoint from epoch {ckpt.get('epoch', 'unknown')} (saved accuracy: {ckpt.get('accuracy', 0):.2f}%)")
    else:
        print(f"Warning: Checkpoint {args.checkpoint} not found. Running with initialized weights.")

    X_test, y_test = load_dataset(args.data_dir, split="test")

    results = evaluate_full(model, X_test, y_test, device)

    print("\n" + "=" * 55)
    print("EMODENT 5-CLASS EVALUATION REPORT")
    print("=" * 55)
    print(f"Overall Accuracy: {results['overall_accuracy']:.2f}%\n")
    print(results["classification_report_text"])

    print("Confusion Matrix (rows: True, cols: Pred):")
    header = "          " + " ".join(f"{c[:6]:>7}" for c in TARGET_CLASSES)
    print(header)
    for i, row in enumerate(results["confusion_matrix"]):
        row_str = " ".join(f"{val:7d}" for val in row)
        print(f"{TARGET_CLASSES[i][:8]:>8}: {row_str}")

    os.makedirs(os.path.dirname(args.output_json), exist_ok=True)
    with open(args.output_json, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved metrics to {args.output_json}")


if __name__ == "__main__":
    main()
