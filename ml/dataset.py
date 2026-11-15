"""
Dataset loader for EmoDent FER-2013 with 5-class remapping, in-memory caching, and augmentations.

Target classes (5):
  0: angry
  1: fear
  2: happy
  3: neutral
  4: sad
"""

import os
import time
from typing import List, Tuple, Dict
from PIL import Image
import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms

TARGET_CLASSES = ['angry', 'fear', 'happy', 'neutral', 'sad']
CLASS_TO_IDX = {name: idx for idx, name in enumerate(TARGET_CLASSES)}
IDX_TO_CLASS = {idx: name for idx, name in enumerate(TARGET_CLASSES)}


class CachedFER5Dataset(Dataset):
    """
    Fast In-Memory Cached FER-2013 5-Class Dataset.
    Preloads all 48x48 grayscale images into RAM (only ~55 MB) on initialization,
    eliminating slow disk I/O and enabling rapid training epochs on CPU.
    """
    def __init__(self, root_dir: str, split: str = 'train', transform=None):
        self.split_dir = os.path.join(root_dir, split)
        self.transform = transform
        self.class_counts: Dict[str, int] = {cls: 0 for cls in TARGET_CLASSES}

        if not os.path.isdir(self.split_dir):
            raise FileNotFoundError(f"Directory not found: {self.split_dir}")

        images_list = []
        labels_list = []

        t0 = time.time()
        print(f"Preloading {split} dataset into RAM from {self.split_dir}...")
        for cls_name in TARGET_CLASSES:
            cls_folder = os.path.join(self.split_dir, cls_name)
            if not os.path.isdir(cls_folder):
                continue
            cls_idx = CLASS_TO_IDX[cls_name]
            files = [f for f in os.listdir(cls_folder) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
            self.class_counts[cls_name] = len(files)

            for f in files:
                p = os.path.join(cls_folder, f)
                with Image.open(p) as img:
                    img_gray = img.convert('L')
                    images_list.append(np.array(img_gray, dtype=np.uint8))
                    labels_list.append(cls_idx)

        self.images = np.stack(images_list, axis=0) # [N, 48, 48]
        self.labels = np.array(labels_list, dtype=np.int64)
        print(f"✓ Cached {len(self.images)} images in {time.time() - t0:.2f}s ({self.images.nbytes / 1024 / 1024:.1f} MB)")

    def __len__(self) -> int:
        return len(self.images)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, int]:
        img_np = self.images[idx]
        label = int(self.labels[idx])

        # PIL image for transforms
        img = Image.fromarray(img_np, mode='L')
        if self.transform is not None:
            img_tensor = self.transform(img)
        else:
            img_tensor = transforms.functional.to_tensor(img)

        return img_tensor, label

    def compute_class_weights(self) -> torch.Tensor:
        total = len(self.images)
        num_classes = len(TARGET_CLASSES)
        weights = []
        for cls_name in TARGET_CLASSES:
            count = max(self.class_counts[cls_name], 1)
            weights.append(total / (num_classes * count))
        return torch.tensor(weights, dtype=torch.float32)


def get_transforms(is_train: bool = True):
    if is_train:
        return transforms.Compose([
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.RandomRotation(degrees=10),
            transforms.ColorJitter(brightness=0.2, contrast=0.2),
            transforms.ToTensor(),
            transforms.RandomErasing(
                p=0.2,
                scale=(0.02, 0.15),
                ratio=(0.5, 2.0),
                value=0.0
            )
        ])
    else:
        return transforms.Compose([
            transforms.ToTensor(),
        ])


def build_dataloaders(data_dir: str = "./data/fer2013", batch_size: int = 128, num_workers: int = 0):
    train_dataset = CachedFER5Dataset(data_dir, split='train', transform=get_transforms(is_train=True))
    test_dataset = CachedFER5Dataset(data_dir, split='test', transform=get_transforms(is_train=False))

    train_loader = DataLoader(
        train_dataset,
        batch_size=batch_size,
        shuffle=True,
        num_workers=num_workers,
        pin_memory=False
    )
    test_loader = DataLoader(
        test_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=False
    )

    return train_loader, test_loader, train_dataset.compute_class_weights()
