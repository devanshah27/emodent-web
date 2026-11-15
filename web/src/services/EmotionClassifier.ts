import { EmotionClass, InferenceOutput, EMOTION_CLASSES } from '../types';

export interface IEmotionClassifier {
  init(): Promise<void>;
  classify(floatArray: Float32Array): Promise<InferenceOutput | null>;
  isBusy(): boolean;
  getBackend(): string;
  getInferenceLatency(): number;
  getDroppedFramesCount(): number;
  dispose(): void;
}

/**
 * Mock Emotion Classifier for headless tests and simulated testing.
 */
export class MockEmotionClassifier implements IEmotionClassifier {
  private busy = false;
  private latency = 8.5;
  private dropped = 0;

  async init(): Promise<void> {
    return Promise.resolve();
  }

  async classify(_floatArray: Float32Array): Promise<InferenceOutput | null> {
    if (this.busy) {
      this.dropped++;
      return null;
    }

    this.busy = true;
    const t0 = performance.now();

    // Generate balanced/mock probabilities [angry, happy, neutral, sad]
    const probs = [0.05, 0.85, 0.05, 0.05];
    const topIdx = 1; // happy
    this.latency = performance.now() - t0;
    this.busy = false;

    return {
      probabilities: probs,
      topClass: EMOTION_CLASSES[topIdx],
      topConfidence: probs[topIdx],
    };
  }

  isBusy(): boolean {
    return this.busy;
  }

  getBackend(): string {
    return 'mock';
  }

  getInferenceLatency(): number {
    return this.latency;
  }

  getDroppedFramesCount(): number {
    return this.dropped;
  }

  dispose(): void {
    // no-op
  }
}

/**
 * ONNX Runtime Web Worker Classifier.
 * Offloads model execution off the main UI thread.
 * Discards in-flight frames if the worker is busy to prevent UI latency accumulation.
 */
export class OnnxWorkerEmotionClassifier implements IEmotionClassifier {
  private worker: Worker | null = null;
  private busy = false;
  private backend = 'initializing';
  private lastLatencyMs = 0;
  private droppedFrames = 0;
  private frameCounter = 0;
  private pendingResolver: ((res: InferenceOutput | null) => void) | null = null;
  private currentPendingFrameId = -1;
  private modelUrl: string;

  constructor(modelUrl: string = '/models/emodent_cnn.onnx') {
    this.modelUrl = modelUrl;
  }

  public async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.worker = new Worker(
          new URL('../workers/emotionWorker.ts', import.meta.url),
          { type: 'module' }
        );

        const timeout = setTimeout(() => {
          reject(new Error('Worker initialization timed out'));
        }, 15000);

        this.worker.onmessage = (e: MessageEvent) => {
          const { type, backend, error, frameId, probabilities, topClass, topConfidence, latencyMs } = e.data;

          if (type === 'INIT_SUCCESS') {
            clearTimeout(timeout);
            this.backend = backend || 'webgl';
            resolve();
            return;
          }

          if (type === 'INIT_ERROR') {
            clearTimeout(timeout);
            this.backend = 'failed';
            reject(new Error(error || 'Worker failed to initialize'));
            return;
          }

          if (type === 'INFER_SUCCESS') {
            if (this.pendingResolver && frameId === this.currentPendingFrameId) {
              this.lastLatencyMs = latencyMs || 0;
              this.pendingResolver({
                probabilities,
                topClass,
                topConfidence,
              });
              this.pendingResolver = null;
              this.busy = false;
            }
            return;
          }

          if (type === 'FRAME_DROPPED') {
            this.droppedFrames++;
            if (this.pendingResolver && frameId === this.currentPendingFrameId) {
              this.pendingResolver(null);
              this.pendingResolver = null;
              this.busy = false;
            }
            return;
          }

          if (type === 'INFER_ERROR') {
            if (this.pendingResolver && frameId === this.currentPendingFrameId) {
              this.pendingResolver(null);
              this.pendingResolver = null;
              this.busy = false;
            }
          }
        };

        this.worker.postMessage({
          type: 'INIT',
          payload: { modelUrl: this.modelUrl },
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  public async classify(floatArray: Float32Array): Promise<InferenceOutput | null> {
    if (!this.worker) return null;

    // Zero-queue drop: if worker or classifier is currently busy, drop frame immediately
    if (this.busy) {
      this.droppedFrames++;
      return null;
    }

    this.busy = true;
    const frameId = ++this.frameCounter;
    this.currentPendingFrameId = frameId;

    return new Promise<InferenceOutput | null>((resolve) => {
      this.pendingResolver = resolve;

      // Transfer Float32Array buffer to avoid copy overhead
      this.worker!.postMessage(
        {
          type: 'INFER',
          payload: {
            frameId,
            floatArray,
          },
        },
        [floatArray.buffer]
      );
    });
  }

  public isBusy(): boolean {
    return this.busy;
  }

  public getBackend(): string {
    return this.backend;
  }

  public getInferenceLatency(): number {
    return this.lastLatencyMs;
  }

  public getDroppedFramesCount(): number {
    return this.droppedFrames;
  }

  public dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

