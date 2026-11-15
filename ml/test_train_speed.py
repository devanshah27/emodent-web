import time
import os
import torch
import torch.nn as nn
from PIL import Image
import numpy as np

torch.set_num_threads(10)

TARGET_CLASSES = ['angry', 'fear', 'happy', 'neutral', 'sad']
CLASS_TO_IDX = {name: idx for idx, name in enumerate(TARGET_CLASSES)}

def load_data(split='train'):
    split_dir = os.path.join('data', 'fer2013', split)
    images_list = []
    labels_list = []
    for cls_name in TARGET_CLASSES:
        p = os.path.join(split_dir, cls_name)
        if not os.path.isdir(p):
            continue
        idx = CLASS_TO_IDX[cls_name]
        for f in os.listdir(p):
            if f.lower().endswith(('.png', '.jpg', '.jpeg')):
                with Image.open(os.path.join(p, f)) as img:
                    img_np = np.array(img.convert('L'), dtype=np.float32)
                    images_list.append(img_np)
                    labels_list.append(idx)
    X = np.stack(images_list, axis=0) # [N, 48, 48]
    y = np.array(labels_list, dtype=np.int64)
    # Match web/src/services/FaceTracker.ts: normalize to [0.0, 1.0]
    X = torch.from_numpy(X).unsqueeze(1) / 255.0
    y = torch.from_numpy(y)
    return X, y

print("Loading data...")
t0 = time.time()
X_train, y_train = load_data('train')
X_test, y_test = load_data('test')
print(f"Loaded train {X_train.shape} and test {X_test.shape} in {time.time()-t0:.1f}s")

class ConvBlock(nn.Module):
    def __init__(self, in_c, out_c):
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(in_c, out_c, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_c),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_c, out_c, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_c),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
        )
    def forward(self, x):
        return self.block(x)

class EmoDentCNN(nn.Module):
    def __init__(self, num_classes=5, export_softmax=False):
        super().__init__()
        self.export_softmax = export_softmax
        self.block1 = ConvBlock(1, 32)    # 48 -> 24
        self.block2 = ConvBlock(32, 64)   # 24 -> 12
        self.block3 = ConvBlock(64, 128)  # 12 -> 6
        self.block4 = nn.Sequential(
            nn.Conv2d(128, 128, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.AdaptiveAvgPool2d((1, 1))
        )
        self.head = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(0.35),
            nn.Linear(128, 64, bias=False),
            nn.BatchNorm1d(64),
            nn.ReLU(inplace=True),
            nn.Dropout(0.25),
            nn.Linear(64, num_classes)
        )
        self.softmax = nn.Softmax(dim=1)

    def forward(self, x):
        x = self.block1(x)
        x = self.block2(x)
        x = self.block3(x)
        x = self.block4(x)
        logits = self.head(x)
        if self.export_softmax:
            return self.softmax(logits)
        return logits

model = EmoDentCNN()
params = sum(p.numel() for p in model.parameters() if p.requires_grad)
print(f"Model parameters: {params:,} (approx {params*4/1024/1024:.2f} MB FP32)")

# Class weights
class_counts = torch.bincount(y_train)
class_weights = len(y_train) / (5.0 * class_counts.float())
print("Class weights:", class_weights.numpy().round(3))

criterion = nn.CrossEntropyLoss(weight=class_weights, label_smoothing=0.04)
optimizer = torch.optim.AdamW(model.parameters(), lr=2e-3, weight_decay=1e-3)
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=8, eta_min=5e-5)

batch_size = 128
num_samples = len(X_train)

best_acc = 0.0
for epoch in range(1, 9):
    model.train()
    perm = torch.randperm(num_samples)
    t_start = time.time()
    correct = 0
    total = 0
    running_loss = 0.0

    for i in range(0, num_samples, batch_size):
        idx = perm[i:i+batch_size]
        xb = X_train[idx].clone()
        yb = y_train[idx]

        # Fast random horizontal flip
        flip_mask = torch.rand(xb.size(0)) > 0.5
        if flip_mask.any():
            xb[flip_mask] = torch.flip(xb[flip_mask], dims=[3])

        optimizer.zero_grad()
        out = model(xb)
        loss = criterion(out, yb)
        loss.backward()
        optimizer.step()

        running_loss += loss.item() * xb.size(0)
        _, preds = out.max(1)
        correct += preds.eq(yb).sum().item()
        total += xb.size(0)

    scheduler.step()
    train_acc = correct / total * 100.0

    # Test
    model.eval()
    val_correct = 0
    val_total = 0
    with torch.no_grad():
        for i in range(0, len(X_test), 256):
            xb, yb = X_test[i:i+256], y_test[i:i+256]
            out = model(xb)
            _, preds = out.max(1)
            val_correct += preds.eq(yb).sum().item()
            val_total += xb.size(0)

    val_acc = val_correct / val_total * 100.0
    print(f"Epoch {epoch:02d} ({time.time()-t_start:.1f}s) - Train Loss: {running_loss/total:.4f}, Train Acc: {train_acc:.1f}% | Test Acc: {val_acc:.2f}% (lr={scheduler.get_last_lr()[0]:.1e})", flush=True)

    if val_acc > best_acc:
        best_acc = val_acc
        os.makedirs('ml/checkpoints', exist_ok=True)
        torch.save({
            'epoch': epoch,
            'model_state_dict': model.state_dict(),
            'accuracy': best_acc,
            'classes': TARGET_CLASSES,
        }, 'ml/checkpoints/best_model.pth')
        print(f"  --> Saved new best checkpoint (Acc: {best_acc:.2f}%)", flush=True)

print(f"Done. Best test accuracy: {best_acc:.2f}%")
