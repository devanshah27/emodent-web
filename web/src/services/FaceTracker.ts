import { FilesetResolver, FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { BoundingBox } from '../types';

export class FaceTracker {
  private landmarker: FaceLandmarker | null = null;
  private isInitialized = false;
  private consecutiveErrors = 0;
  private isRecovering = false;
  private lastTimestampMs = -1;
  private preferredDelegate: 'GPU' | 'CPU' = 'GPU';
  private initPromise: Promise<void> | null = null;

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

  public isReady(): boolean {
    return this.isInitialized && !!this.landmarker;
  }

  public resetTracking(): void {
    this.lastTimestampMs = -1;
    this.consecutiveErrors = 0;
  }

  public async reinit(): Promise<void> {
    this.close();
    await this.init();
  }

  public async init(): Promise<void> {
    if (this.isInitialized && this.landmarker) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );

        // Attempt initialization with preferred delegate (GPU by default, or CPU fallback)
        try {
          this.landmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
              delegate: this.preferredDelegate,
            },
            runningMode: 'VIDEO',
            numFaces: 1,
            minFaceDetectionConfidence: 0.3,
            minFacePresenceConfidence: 0.3,
            minTrackingConfidence: 0.3,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: false,
          });
          this.isInitialized = true;
          this.consecutiveErrors = 0;
        } catch (delegateErr) {
          if (this.preferredDelegate === 'GPU') {
            console.warn('GPU delegate failed for MediaPipe FaceLandmarker, falling back to CPU:', delegateErr);
            this.preferredDelegate = 'CPU';
            this.landmarker = await FaceLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath:
                  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                delegate: 'CPU',
              },
              runningMode: 'VIDEO',
              numFaces: 1,
              minFaceDetectionConfidence: 0.3,
              minFacePresenceConfidence: 0.3,
              minTrackingConfidence: 0.3,
              outputFaceBlendshapes: true,
              outputFacialTransformationMatrixes: false,
            });
            this.isInitialized = true;
            this.consecutiveErrors = 0;
          } else {
            throw delegateErr;
          }
        }
      } catch (err) {
        console.error('Failed to initialize MediaPipe FaceLandmarker:', err);
        this.isInitialized = false;
        this.landmarker = null;
        throw err;
      }
    })().finally(() => {
      this.initPromise = null;
    });

    return this.initPromise;
  }

  /**
   * Detects facial landmarks and blendshapes from the video element.
   * Guarantees strictly monotonically increasing timestamps and auto-heals on failure.
   */
  public detectForVideo(video: HTMLVideoElement, timestampMs: number): FaceLandmarkerResult | null {
    // Check if video is valid and has active pixel dimensions
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight || video.paused) {
      return null;
    }

    // Auto-recover if uninitialized or previously failed
    if (!this.landmarker || !this.isInitialized) {
      if (!this.isRecovering) {
        this.isRecovering = true;
        this.init()
          .catch((err) => console.warn('Background FaceLandmarker auto-recovery failed:', err))
          .finally(() => {
            this.isRecovering = false;
          });
      }
      return null;
    }

    // Enforce strictly monotonically increasing timestamps required by MediaPipe VIDEO mode
    let validTimestamp = Math.round(timestampMs);
    if (validTimestamp <= this.lastTimestampMs) {
      validTimestamp = this.lastTimestampMs + 1;
    }
    this.lastTimestampMs = validTimestamp;

    try {
      const result = this.landmarker.detectForVideo(video, validTimestamp);
      this.consecutiveErrors = 0;
      return result;
    } catch (err) {
      console.warn('FaceLandmarker detectForVideo error:', err);
      this.consecutiveErrors++;

      // If detection fails repeatedly (e.g. WebGL context loss on mobile), auto-heal
      if (this.consecutiveErrors >= 3 && !this.isRecovering) {
        console.warn('FaceLandmarker encountered repeated errors, auto-recovering...');
        this.isRecovering = true;
        if (this.preferredDelegate === 'GPU') {
          this.preferredDelegate = 'CPU'; // Fallback to rock-solid CPU delegate
        }
        this.close();
        this.init()
          .catch((reInitErr) => console.error('FaceLandmarker re-init failed:', reInitErr))
          .finally(() => {
            this.isRecovering = false;
          });
      }
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
      try {
        this.landmarker.close();
      } catch {
        // ignore close error
      }
      this.landmarker = null;
      this.isInitialized = false;
      this.lastTimestampMs = -1;
    }
  }
}

