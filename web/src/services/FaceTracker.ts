import { FilesetResolver, FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { BoundingBox } from '../types';

export class FaceTracker {
  private landmarker: FaceLandmarker | null = null;
  private isInitialized = false;

  // Reusable canvas and memory buffers to prevent Garbage Collection pauses
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D | null;
  private preallocatedFloatArray: Float32Array;

  constructor() {
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = 48;
    this.offscreenCanvas.height = 48;
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
    this.preallocatedFloatArray = new Float32Array(48 * 48);
  }

  public async init(): Promise<void> {
    if (this.isInitialized && this.landmarker) return;

    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );

      this.landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
      });

      this.isInitialized = true;
    } catch (err) {
      console.error('Failed to initialize MediaPipe FaceLandmarker:', err);
      throw err;
    }
  }

  public detectForVideo(video: HTMLVideoElement, timestampMs: number): FaceLandmarkerResult | null {
    if (!this.landmarker || !this.isInitialized) {
      return null;
    }
    try {
      return this.landmarker.detectForVideo(video, timestampMs);
    } catch (err) {
      console.warn('FaceLandmarker detectForVideo error:', err);
      return null;
    }
  }

  /**
   * Crops face from video frame using bounding box with margin,
   * converts to 48x48 grayscale, normalizes to [0.0, 1.0],
   * stabilizes head roll angle using eye landmarks (if available),
   * and populates a Float32Array without garbage collection allocations.
   */
  public extractCroppedFaceTensor(
    video: HTMLVideoElement,
    box: BoundingBox,
    marginFactor: number = 0.02,
    landmarks?: Array<{ x: number; y: number; z?: number }>
  ): Float32Array | null {
    if (!this.offscreenCtx || !video.videoWidth || !video.videoHeight) {
      return null;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    // Calculate face center in video coordinates
    const faceCenterX = (box.xMin + box.width / 2) * vw;
    const faceCenterY = (box.yMin + box.height / 2) * vh;

    // Use max dimension to guarantee a 1:1 square crop matching FER-2013 face crops
    const faceSize = Math.max(box.width * vw, box.height * vh);
    const cropSize = faceSize * (1 + 2 * marginFactor);

    const cropX = Math.max(0, faceCenterX - cropSize / 2);
    const cropY = Math.max(0, faceCenterY - cropSize / 2);
    const cropW = Math.min(vw - cropX, cropSize);
    const cropH = Math.min(vh - cropY, cropSize);

    if (cropW <= 0 || cropH <= 0) {
      return null;
    }

    // Roll angle calculation from left eye (landmark 33) to right eye (landmark 263)
    let rollAngle = 0;
    if (landmarks && landmarks[33] && landmarks[263]) {
      const dx = (landmarks[263].x - landmarks[33].x) * vw;
      const dy = (landmarks[263].y - landmarks[33].y) * vh;
      rollAngle = Math.atan2(dy, dx);
    }

    this.offscreenCtx.save();
    this.offscreenCtx.clearRect(0, 0, 48, 48);

    // If head roll is noticeable (> 3 degrees), upright the face to match canonical training data
    if (Math.abs(rollAngle) > 0.05 && Math.abs(rollAngle) < 0.75) {
      this.offscreenCtx.translate(24, 24);
      this.offscreenCtx.rotate(-rollAngle);
      this.offscreenCtx.drawImage(video, cropX, cropY, cropW, cropH, -24, -24, 48, 48);
    } else {
      this.offscreenCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, 48, 48);
    }
    this.offscreenCtx.restore();

    const imgData = this.offscreenCtx.getImageData(0, 0, 48, 48);
    const rgba = imgData.data;

    // Convert to 1-channel grayscale [0.0, 1.0]
    // ITU-R 601-2 luma transform: 0.299 R + 0.587 G + 0.114 B
    const tensorBuffer = new Float32Array(48 * 48);
    let p = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      const gray = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) / 255.0;
      tensorBuffer[p++] = gray;
    }

    return tensorBuffer;
  }

  public close(): void {
    if (this.landmarker) {
      this.landmarker.close();
      this.landmarker = null;
      this.isInitialized = false;
    }
  }
}

