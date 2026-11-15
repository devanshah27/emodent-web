"""
Training script for EmoDent 5-class Facial Emotion Recognition CNN.
Preloads dataset into RAM for high-throughput training on CPU.
Focuses on rock-solid Happy, Sad, Neutral, Angry, and Fear accuracy.
"""

import os
import time
import argparse
from typing import Dict, Tuple
from PIL import Image
import numpy as np
import torch
import torch.nn as nn
from torch.optim import AdamW
from torch.optim.lr_scheduler import OneCycleLR

from model import EmoDentCNN

TARGET_CLASSES = ['angry', 'fear', 'happy', 'neutral', 'sad']
CLASS_TO_IDX = {name: idx for idx, name in enumerate(TARGET_CLASSES)}
IDX_TO_CLASS = {idx: name for idx, name in enumerate(TARGET_CLASSES)}


def load_dataset(data_dir: str, split: str = 'train') -> Tuple[torch.Tensor, torch.Tensor]:
    split_dir = os.path.join(data_dir, split)
    if not os.path.isdir(split_dir):
        raise FileNotFoundError(f"Directory not found: {split_dir}")

    images_list = []
    labels_list = []

    print(f"Loading {split} dataset from {split_dir} into RAM...", flush=True)
    t0 = time.time()
    for cls_name in TARGET_CLASSES:
        cls_folder = os.path.join(split_dir, cls_name)
        if not os.path.isdir(cls_folder):
            continue
        cls_idx = CLASS_TO_IDX[cls_name]
        files = [f for f in os.listdir(cls_folder) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]

        for f in files:
            p = os.path.join(cls_folder, f)
            with Image.open(p) as img:
                img_gray = img.convert('L')
                images_list.append(np.array(img_gray, dtype=np.float32))
                labels_list.append(cls_idx)

    X_np = np.stack(images_list, axis=0) # [N, 48, 48]
    y_np = np.array(labels_list, dtype=np.int64)

    # Normalize to [0.0, 1.0] to exactly match web/src/services/FaceTracker.ts
    X = torch.from_numpy(X_np).unsqueeze(1) / 255.0
    y = torch.from_numpy(y_np)
    print(f"✓ Cached {len(X)} {split} samples in {time.time() - t0:.1f}s ({X.element_size() * X.nelement() / 1024 / 1024:.1f} MB)", flush=True)
    return X, y


def train_epoch(
    model: nn.Module,
    X: torch.Tensor,
    y: torch.Tensor,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer,
    scheduler: OneCycleLR,
    batch_size: int,
    device: torch.device
) -> Dict[str, float]:
    model.train()
    num_samples = len(X)
    perm = torch.randperm(num_samples)
    correct = 0
    total = 0
    running_loss = 0.0

    for i in range(0, num_samples, batch_size):
        idx = perm[i:i + batch_size]
        xb = X[idx].clone().to(device)
        yb = y[idx].to(device)

        # Vectorized data augmentation: random horizontal flip
        flip_mask = torch.rand(xb.size(0), device=device) > 0.5
        if flip_mask.any():
            xb[flip_mask] = torch.flip(xb[flip_mask], dims=[3])

        # Random small translation (+/- 2 pixels)
        if torch.rand(1).item() > 0.5:
            dx = int(torch.randint(-2, 3, (1,)).item())
            dy = int(torch.randint(-2, 3, (1,)).item())
            xb = torch.roll(xb, shifts=(dy, dx), dims=(2, 3))

        # Dental Lower-Face Masking (simulates mouth props, retractors, bite blocks, teeth exposure)
        # On 30% of samples, mask rows 28-48 with uniform random gray [0.15, 0.45]
        # This forces the CNN to learn upper-face cues (eyes, brows, glabella) invariant to mouth manipulation
        lower_mask = torch.rand(xb.size(0), device=device) < 0.30
        if lower_mask.any():
            gray_fill = torch.empty((lower_mask.sum(), 1, 1, 1), device=device).uniform_(0.15, 0.45)
            xb[lower_mask, :, 28:48, :] = gray_fill

        # Dental operatory light jitter (contrast [0.90, 1.10], brightness [-0.06, 0.06])
        if torch.rand(1).item() > 0.4:
            contrast = torch.empty((xb.size(0), 1, 1, 1), device=device).uniform_(0.90, 1.10)
            brightness = torch.empty((xb.size(0), 1, 1, 1), device=device).uniform_(-0.06, 0.06)
            xb = torch.clamp(xb * contrast + brightness, 0.0, 1.0)

        optimizer.zero_grad()
        outputs = model(xb)
        loss = criterion(outputs, yb)
        loss.backward()
        optimizer.step()
        scheduler.step()

        running_loss += loss.item() * xb.size(0)
        _, preds = outputs.max(1)
        correct += preds.eq(yb).sum().item()
        total += xb.size(0)

    return {
        "loss": running_loss / total,
        "accuracy": (correct / total) * 100.0
    }


@torch.no_grad()
def evaluate(
    model: nn.Module,
    X: torch.Tensor,
    y: torch.Tensor,
    criterion: nn.Module,
    batch_size: int,
    device: torch.device
) -> Dict[str, float]:
    model.eval()
    num_samples = len(X)
    correct = 0
    total = 0
    running_loss = 0.0

    for i in range(0, num_samples, batch_size):
        xb = X[i:i + batch_size].to(device)
        yb = y[i:i + batch_size].to(device)

        outputs = model(xb)
        loss = criterion(outputs, yb)

        running_loss += loss.item() * xb.size(0)
        _, preds = outputs.max(1)
        correct += preds.eq(yb).sum().item()
        total += xb.size(0)

    return {
        "loss": running_loss / total,
        "accuracy": (correct / total) * 100.0
    }


def main():
    parser = argparse.ArgumentParser(description="Train EmoDent CNN on FER-2013 5-class")
    parser.add_argument("--data-dir", type=str, default="./data/fer2013")
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--lr", type=float, default=2e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-3)
    parser.add_argument("--save-dir", type=str, default="./ml/checkpoints")
    parser.add_argument("--resume", action="store_true", help="Resume from best checkpoint if available")
    args = parser.parse_args()

    os.makedirs(args.save_dir, exist_ok=True)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}", flush=True)

    torch.set_num_threads(6)

    X_train, y_train = load_dataset(args.data_dir, split="train")
    X_test, y_test = load_dataset(args.data_dir, split="test")

    # Tuned class weights for ['angry', 'fear', 'happy', 'neutral', 'sad']:
    class_counts = torch.bincount(y_train)
    class_weights = torch.tensor([1.10, 1.20, 0.78, 1.00, 1.10], dtype=torch.float32)
    print(f"Target classes: {TARGET_CLASSES}", flush=True)
    print(f"Class counts: {class_counts.tolist()}", flush=True)
    print(f"Class weights: {class_weights.numpy().round(3)}", flush=True)

    model = EmoDentCNN(num_classes=len(TARGET_CLASSES), export_softmax=False).to(device)
    print(f"Trainable parameters: {model.count_parameters():,}", flush=True)

    best_acc = 0.0
    best_path = os.path.join(args.save_dir, "best_model.pth")
    if args.resume and os.path.exists(best_path):
        ckpt = torch.load(best_path, map_location=device)
        model.load_state_dict(ckpt["model_state_dict"])
        best_acc = ckpt.get("accuracy", 0.0)
        print(f"✓ Resumed from existing checkpoint {best_path} (previous accuracy: {best_acc:.2f}%)", flush=True)

    steps_per_epoch = (len(X_train) + args.batch_size - 1) // args.batch_size
    criterion = nn.CrossEntropyLoss(weight=class_weights.to(device), label_smoothing=0.02)
    optimizer = AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    scheduler = OneCycleLR(
        optimizer,
        max_lr=args.lr * 1.5,
        epochs=args.epochs,
        steps_per_epoch=steps_per_epoch,
        pct_start=0.25,
    )

    print("\nStarting high-throughput training...", flush=True)
    for epoch in range(1, args.epochs + 1):
        t0 = time.time()
        train_stats = train_epoch(model, X_train, y_train, criterion, optimizer, scheduler, args.batch_size, device)
        val_stats = evaluate(model, X_test, y_test, criterion, args.batch_size * 2, device)
        elapsed = time.time() - t0

        print(
            f"Epoch [{epoch:02d}/{args.epochs:02d}] ({elapsed:.1f}s) - "
            f"Train Loss: {train_stats['loss']:.4f}, Acc: {train_stats['accuracy']:.2f}% | "
            f"Test Loss: {val_stats['loss']:.4f}, Acc: {val_stats['accuracy']:.2f}% (lr={scheduler.get_last_lr()[0]:.1e})",
            flush=True
        )

        if val_stats["accuracy"] > best_acc or epoch == 1:
            best_acc = val_stats["accuracy"]
            torch.save({
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "accuracy": best_acc,
                "classes": TARGET_CLASSES,
            }, best_path)
            print(f"  --> Saved new best checkpoint to {best_path} (Acc: {best_acc:.2f}%)", flush=True)

    print(f"\nTraining completed! Best Test Accuracy: {best_acc:.2f}%", flush=True)


if __name__ == "__main__":
    main()
