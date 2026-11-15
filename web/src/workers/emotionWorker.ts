import * as ort from 'onnxruntime-web';

const CLASS_NAMES = ['angry', 'fear', 'happy', 'neutral', 'sad'] as const;

let session: ort.InferenceSession | null = null;
let isBusy = false;

// Configure ONNX Runtime Web environments
ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'INIT') {
    const { modelUrl } = payload;
    try {
      // Try WebGL execution provider first, fall back to WASM
      try {
        session = await ort.InferenceSession.create(modelUrl, {
          executionProviders: ['webgl'],
          graphOptimizationLevel: 'all',
        });
        self.postMessage({ type: 'INIT_SUCCESS', backend: 'webgl' });
      } catch (webglErr) {
        console.warn('WebGL provider unavailable, falling back to WASM:', webglErr);
        session = await ort.InferenceSession.create(modelUrl, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        });
        self.postMessage({ type: 'INIT_SUCCESS', backend: 'wasm' });
      }
    } catch (err: any) {
      console.error('Failed to load ONNX model in worker:', err);
      self.postMessage({ type: 'INIT_ERROR', error: err?.message || String(err) });
    }
    return;
  }

  if (type === 'INFER') {
    if (!session) {
      self.postMessage({
        type: 'INFER_ERROR',
        error: 'Model not initialized',
        frameId: payload.frameId,
      });
      return;
    }

    if (isBusy) {
      // Frame drop signal: dropped because worker is currently busy
      self.postMessage({
        type: 'FRAME_DROPPED',
        frameId: payload.frameId,
      });
      return;
    }

    isBusy = true;
    const t0 = performance.now();

    try {
      const { frameId, floatArray } = payload;
      // Reusable tensor: shape [1, 1, 48, 48]
      const inputTensor = new ort.Tensor('float32', floatArray, [1, 1, 48, 48]);
      const feeds: Record<string, ort.Tensor> = { input: inputTensor };

      const results = await session.run(feeds);
      const outputTensor = results.output;
      const data = outputTensor.data as Float32Array;

      // Class probabilities: [angry, fear, happy, neutral, sad]
      let probabilities: number[];
      if (data.length >= 5) {
        probabilities = Array.from(data.slice(0, 5));
      } else {
        probabilities = [data[0] || 0, 0.01, data[1] || 0, data[2] || 0, data[3] || 0];
      }

      let maxProb = -1;
      let maxIdx = 0;
      for (let i = 0; i < probabilities.length; i++) {
        if (probabilities[i] > maxProb) {
          maxProb = probabilities[i];
          maxIdx = i;
        }
      }

      const latencyMs = performance.now() - t0;

      self.postMessage({
        type: 'INFER_SUCCESS',
        frameId,
        probabilities,
        topClass: CLASS_NAMES[maxIdx],
        topConfidence: maxProb,
        latencyMs,
      });
    } catch (err: any) {
      self.postMessage({
        type: 'INFER_ERROR',
        error: err?.message || String(err),
        frameId: payload.frameId,
      });
    } finally {
      isBusy = false;
    }
  }
};

