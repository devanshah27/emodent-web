export class CameraService {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private currentFacingMode: 'user' | 'environment' = 'user';

  public getFacingMode(): 'user' | 'environment' {
    return this.currentFacingMode;
  }

  public async startCamera(
    videoElement: HTMLVideoElement,
    constraints?: MediaStreamConstraints,
    facingMode: 'user' | 'environment' = 'user'
  ): Promise<MediaStream> {
    this.stopCamera();
    this.videoElement = videoElement;
    this.currentFacingMode = facingMode;

    // Ensure video element properties for smooth autoplay without browser policy restrictions
    videoElement.muted = true;
    videoElement.playsInline = true;
    videoElement.autoplay = true;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera access is not supported in this browser or environment (requires HTTPS or localhost).');
    }

    const defaultConstraints: MediaStreamConstraints = {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 },
        facingMode: { ideal: facingMode },
      },
      audio: false,
    };

    const finalConstraints = constraints || defaultConstraints;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(finalConstraints);
      videoElement.srcObject = this.stream;

      // Wait for metadata with a timeout so it never hangs
      if (videoElement.readyState < 1) {
        await new Promise<void>((resolve) => {
          let resolved = false;
          const onLoaded = () => {
            if (!resolved) {
              resolved = true;
              videoElement.removeEventListener('loadedmetadata', onLoaded);
              resolve();
            }
          };
          videoElement.addEventListener('loadedmetadata', onLoaded);
          // 1200ms fallback timeout
          setTimeout(onLoaded, 1200);
        });
      }

      // Attempt playback
      try {
        const playPromise = videoElement.play();
        if (playPromise !== undefined) {
          await playPromise;
        }
      } catch (playErr: any) {
        // If play() was aborted by a new load request (common during React StrictMode / HMR / fast navigation),
        // safely suppress AbortError and ensure it resumes when ready
        const msg = (playErr.message || '').toLowerCase();
        if (playErr.name === 'AbortError' || msg.includes('interrupted') || msg.includes('abort')) {
          console.warn('Camera play() request was safely interrupted by a new load request. Attaching canplay listener.');
          const resumePlay = () => {
            videoElement.removeEventListener('canplay', resumePlay);
            if (videoElement.paused) {
              videoElement.play().catch(() => {});
            }
          };
          videoElement.addEventListener('canplay', resumePlay);
        } else {
          throw playErr;
        }
      }

      return this.stream;
    } catch (err: any) {
      // If ideal facingMode failed (e.g. desktop with single webcam), try without facingMode constraint
      if (finalConstraints.video && typeof finalConstraints.video === 'object' && 'facingMode' in finalConstraints.video) {
        try {
          console.warn(`Initial camera start with facingMode=${facingMode} failed, falling back to default camera:`, err);
          const fallbackConstraints: MediaStreamConstraints = {
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 30 },
            },
            audio: false,
          };
          this.stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
          videoElement.srcObject = this.stream;
          await videoElement.play().catch(() => {});
          return this.stream;
        } catch (fallbackErr) {
          // continue to standard error formatting
        }
      }

      const msg = (err.message || '').toLowerCase();
      if (err.name === 'AbortError' || msg.includes('interrupted') || msg.includes('abort')) {
        return this.stream!;
      }
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Camera access permission was denied by the user. Please allow camera access in the browser address bar.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error('No webcam video device found. Please connect a webcam.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        throw new Error('Webcam is currently in use by another application. Please close other camera apps and retry.');
      } else {
        throw new Error(`Failed to access camera: ${err.message || err.name}`);
      }
    }
  }

  public async switchCamera(
    facingMode?: 'user' | 'environment'
  ): Promise<MediaStream | null> {
    if (!this.videoElement) return null;
    const targetFacingMode = facingMode || (this.currentFacingMode === 'user' ? 'environment' : 'user');
    return this.startCamera(this.videoElement, undefined, targetFacingMode);
  }

  public stopCamera(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      try {
        this.videoElement.pause();
      } catch {
        // ignore pause failure
      }
      this.videoElement.srcObject = null;
    }
  }

  public getStream(): MediaStream | null {
    return this.stream;
  }

  public isRunning(): boolean {
    return !!this.stream && this.stream.active;
  }
}

