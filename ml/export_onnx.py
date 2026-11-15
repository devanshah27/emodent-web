"""
ONNX export and numerical verification script for EmoDent CNN.
Verifies that:
1. The ONNX model size is < 5 MB.
2. ONNX Runtime outputs match PyTorch outputs within numerical tolerance (< 1e-4).
3. The exported artifact is copied to /web/public/models/emodent_cnn.onnx.
"""

import os
import shutil
import argparse
import numpy as np
import torch
import onnx
import onnxruntime as ort

from model import EmoDentCNN
from train import TARGET_CLASSES


def export_and_verify(
    checkpoint_path: str = "./ml/checkpoints/best_model.pth",
    output_onnx_path: str = "./ml/emodent_cnn.onnx",
    web_public_path: str = "./web/public/models/emodent_cnn.onnx"
):
    print("Preparing model for export...")
    model = EmoDentCNN(num_classes=len(TARGET_CLASSES), export_softmax=True)
    model.eval()

    if os.path.exists(checkpoint_path):
        ckpt = torch.load(checkpoint_path, map_location="cpu")
        model.load_state_dict(ckpt["model_state_dict"])
        print(f"Loaded weights from {checkpoint_path}")
    else:
        print(f"Checkpoint not found at {checkpoint_path}. Exporting base model weights.")

    os.makedirs(os.path.dirname(output_onnx_path), exist_ok=True)

    dummy_input = torch.randn(1, 1, 48, 48, dtype=torch.float32)

    print(f"Exporting to ONNX: {output_onnx_path}...")
    torch.onnx.export(
        model,
        dummy_input,
        output_onnx_path,
        export_params=True,
        opset_version=18,
        do_constant_folding=True,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={
            "input": {0: "batch_size"},
            "output": {0: "batch_size"}
        }
    )

    # Convert external data (if any) into a single self-contained ONNX file for browser runtime
    temp_onnx = onnx.load(output_onnx_path, load_external_data=True)
    onnx.save_model(temp_onnx, output_onnx_path, save_as_external_data=False)
    # Remove leftover external data file if created
    ext_data_file = output_onnx_path + ".data"
    if os.path.exists(ext_data_file):
        os.remove(ext_data_file)

    # 1. Check ONNX Model Structure
    print("Verifying ONNX graph validity...")
    onnx_model = onnx.load(output_onnx_path)
    onnx.checker.check_model(onnx_model)
    print("✓ ONNX model checker passed.")

    # 2. Check File Size
    size_bytes = os.path.getsize(output_onnx_path)
    size_mb = size_bytes / (1024 * 1024)
    print(f"Model file size: {size_mb:.2f} MB ({size_bytes:,} bytes)")
    assert size_mb < 5.0, f"Error: Model size {size_mb:.2f} MB exceeds 5 MB limit!"
    print("✓ Model size is well below 5 MB threshold.")

    # 3. Numerical Verification with ONNX Runtime
    print("Testing numerical equivalence against ONNX Runtime...")
    ort_session = ort.InferenceSession(output_onnx_path, providers=["CPUExecutionProvider"])

    # Test across 10 random batches
    max_abs_diff = 0.0
    for seed in range(10):
        torch.manual_seed(42 + seed)
        test_input = torch.randn(4, 1, 48, 48, dtype=torch.float32)

        with torch.no_grad():
            torch_out = model(test_input).numpy()

        ort_inputs = {ort_session.get_inputs()[0].name: test_input.numpy()}
        ort_out = ort_session.run(None, ort_inputs)[0]

        diff = np.max(np.abs(torch_out - ort_out))
        if diff > max_abs_diff:
            max_abs_diff = diff

    print(f"Maximum absolute discrepancy across test samples: {max_abs_diff:.6e}")
    assert max_abs_diff < 1e-4, f"Discrepancy {max_abs_diff} exceeds tolerance 1e-4"
    print("✓ Numerical consistency verified (< 1e-4 difference).")

    # 4. Copy to web public directory
    if web_public_path:
        os.makedirs(os.path.dirname(web_public_path), exist_ok=True)
        shutil.copy2(output_onnx_path, web_public_path)
        print(f"✓ Copied ONNX model to web directory: {web_public_path}")

    return {
        "onnx_path": output_onnx_path,
        "web_path": web_public_path,
        "size_mb": size_mb,
        "max_diff": float(max_abs_diff)
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export EmoDent model to ONNX and verify")
    parser.add_argument("--checkpoint", type=str, default="./ml/checkpoints/best_model.pth")
    parser.add_argument("--output", type=str, default="./ml/emodent_cnn.onnx")
    parser.add_argument("--web-dest", type=str, default="./web/public/models/emodent_cnn.onnx")
    args = parser.parse_args()

    export_and_verify(args.checkpoint, args.output, args.web_dest)

