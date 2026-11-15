"""
Compact Convolutional Neural Network for Facial Emotion Recognition.
Optimized for low-latency client-side WebGL / WASM inference in browser environments.

Input shape:  [Batch, 1, 48, 48] (grayscale normalized to [0.0, 1.0])
Output shape: [Batch, 4] (probabilities or logits for: angry, happy, neutral, sad)
Model size:   ~1.4 MB in FP32 ONNX (< 5 MB target)
"""

import torch
import torch.nn as nn


class ConvBlock(nn.Module):
    """
    Two 3x3 convolutions with BatchNorm, ReLU, and MaxPool2d.
    """
    def __init__(self, in_channels: int, out_channels: int):
        super().__init__()
        self.conv1 = nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(out_channels)
        self.relu1 = nn.ReLU(inplace=True)

        self.conv2 = nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(out_channels)
        self.relu2 = nn.ReLU(inplace=True)

        self.pool = nn.MaxPool2d(kernel_size=2, stride=2)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.relu1(self.bn1(self.conv1(x)))
        x = self.relu2(self.bn2(self.conv2(x)))
        x = self.pool(x)
        return x


class EmoDentCNN(nn.Module):
    """
    4-Stage High-Performance CNN for 5-Class Facial Emotion Recognition (angry, fear, happy, neutral, sad).
    """
    def __init__(self, num_classes: int = 5, export_softmax: bool = False):
        super().__init__()
        self.num_classes = num_classes
        self.export_softmax = export_softmax

        # 4 Conv stages: 48x48 -> 24x24 -> 12x12 -> 6x6 -> 3x3
        self.block1 = ConvBlock(1, 32)
        self.block2 = ConvBlock(32, 64)
        self.block3 = ConvBlock(64, 128)
        self.block4 = nn.Sequential(
            nn.Conv2d(128, 128, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.AdaptiveAvgPool2d((1, 1))
        )

        # Classification Head with Regularization
        self.head = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(p=0.35),
            nn.Linear(128, 64, bias=False),
            nn.BatchNorm1d(64),
            nn.ReLU(inplace=True),
            nn.Dropout(p=0.25),
            nn.Linear(64, num_classes)
        )
        self.softmax = nn.Softmax(dim=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.block1(x)
        x = self.block2(x)
        x = self.block3(x)
        x = self.block4(x)
        logits = self.head(x)

        if self.export_softmax:
            return self.softmax(logits)
        return logits

    def count_parameters(self) -> int:
        return sum(p.numel() for p in self.parameters() if p.requires_grad)


if __name__ == "__main__":
    model = EmoDentCNN(num_classes=4)
    params = model.count_parameters()
    print(f"Total trainable parameters: {params:,}")
    est_size_mb = (params * 4) / (1024 * 1024)
    print(f"Estimated FP32 parameter footprint: {est_size_mb:.2f} MB")

    dummy_input = torch.randn(2, 1, 48, 48)
    out_logits = model(dummy_input)
    print("Dummy input shape:", dummy_input.shape)
    print("Logits output shape:", out_logits.shape)

    model.export_softmax = True
    out_probs = model(dummy_input)
    print("Softmax output shape:", out_probs.shape)
    print("Softmax output sum across classes:", out_probs.sum(dim=1).detach().numpy())
 