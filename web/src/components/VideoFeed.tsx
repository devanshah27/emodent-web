import React, { useRef, useEffect, useState } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { CameraService } from '../services/CameraService';
import { FaceTracker } from '../services/FaceTracker';
import { IEmotionClassifier, OnnxWorkerEmotionClassifier, MockEmotionClassifier } from '../services/EmotionClassifier';
import { evaluateQualityGate } from '../services/QualityGate';
import { EmotionSmoother } from '../services/EmotionSmoother';
import { sessionLogger } from '../services/SessionLogger';
import { calculateDistressHeuristic } from '../services/DistressHeuristic';
import { ClinicalEmotionRules } from '../services/ClinicalEmotionRules';
import {
  EmotionClass,
  EMOTION_CLASSES,
  EMOTION_EMOJIS,
  FrameResult,
  QualityFlag,
  BlendshapeCategory,
} from '../types';
import { Camera, CameraOff, Video, AlertCircle, SwitchCamera, FlipHorizontal, RefreshCw } from 'lucide-react';

export const VideoFeed: React.FC = () => {
  const {
    activePhase,
    participantId,
    confidenceThreshold,
    smoothingWindow,
    showFaceMesh,
    devVideoMode,
    devVideoUrl,
    setActiveStream,
    setCurrentFrame,
    updateTelemetry,
    isBlindedMode,
  } = useSessionStore();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [classifierBackend, setClassifierBackend] = useState<string>('initializing');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isMirrored, setIsMirrored] = useState<boolean>(true); // default true for front/selfie camera
  const [isFlippingCamera, setIsFlippingCamera] = useState<boolean>(false);
  const [showDetectionRetryPrompt, setShowDetectionRetryPrompt] = useState<boolean>(false);
  const lastFaceDetectedTimeRef = useRef<number>(Date.now());

  // Services instances (persistent across renders)
  const cameraServiceRef = useRef<CameraService>(new CameraService());
  const faceTrackerRef = useRef<FaceTracker>(new FaceTracker());
  const classifierRef = useRef<IEmotionClassifier | null>(null);
  const smootherRef = useRef<EmotionSmoother>(new EmotionSmoother(smoothingWindow));
  const activePhaseRef = useRef(activePhase);

  // Always keep activePhaseRef in sync
  useEffect(() => {
    activePhaseRef.current = activePhase;
  }, [activePhase]);

  // Frame processing state
  const isLoopRunningRef = useRef(false);
  const animationFrameIdRef = useRef<number | null>(null);
  const prevCenterRef = useRef<{ x: number; y: number } | null>(null);

  // Performance telemetry counters
  const lastFpsCheckTimeRef = useRef(performance.now());
  const frameCountSinceCheckRef = useRef(0);
  const currentFpsRef = useRef(30);

  // Sync smoothing window if updated
  useEffect(() => {
    smootherRef.current.setWindowSize(smoothingWindow);
  }, [smoothingWindow]);

  // Initialize Classifier and Face Landmarker on mount
  useEffect(() => {
    let isCancelled = false;

    async function initServices() {
      try {
        setInitError(null);
        // Initialize MediaPipe Face Landmarker
        await faceTrackerRef.current.init();

        // Initialize ONNX Web Worker classifier (DentBot CNN)
        let classifier: IEmotionClassifier;
        try {
          classifier = new OnnxWorkerEmotionClassifier('/models/dentbot_cnn.onnx');
          await classifier.init();
          setClassifierBackend(classifier.getBackend());
        } catch (workerErr) {
          console.warn('Worker init failed with dentbot_cnn.onnx, trying fallback or mock:', workerErr);
          try {
            classifier = new OnnxWorkerEmotionClassifier('/models/dentbot_cnn.onnx');
            await classifier.init();
            setClassifierBackend(classifier.getBackend());
          } catch {
            classifier = new MockEmotionClassifier();
            await classifier.init();
            setClassifierBackend('mock');
          }
        }

        if (!isCancelled) {
          classifierRef.current = classifier;
        } else {
          classifier.dispose();
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.error('Core pipeline init error:', err);
          setInitError(err.message || 'Failed to initialize computer vision models.');
        }
      }
    }

    initServices();

    return () => {
      isCancelled = true;
      if (classifierRef.current) {
        classifierRef.current.dispose();
      }
      faceTrackerRef.current.close();
    };
  }, []);

  // Handler to retry face detection and reset computer vision tracking
  const handleRetryDetection = async () => {
    prevCenterRef.current = null;
    smootherRef.current.clear();
    faceTrackerRef.current.resetTracking();
    try {
      await faceTrackerRef.current.reinit();
    } catch (err) {
      console.warn('Reinit face tracker warning:', err);
    }
    lastFaceDetectedTimeRef.current = Date.now();
    setShowDetectionRetryPrompt(false);
  };

  // Handler to flip camera (front <-> rear / environment) on phones and tablets
  const handleFlipCamera = async () => {
    if (isFlippingCamera || devVideoMode) return;
    setIsFlippingCamera(true);
    const nextFacingMode = facingMode === 'user' ? 'environment' : 'user';

    const video = videoRef.current;
    if (!video) {
      setIsFlippingCamera(false);
      return;
    }

    try {
      // 1. Explicitly stop existing pipeline loop before switching streams
      stopPipelineLoop();

      // 2. Clear state, reset tracking counters and quality gates
      prevCenterRef.current = null;
      smootherRef.current.clear();
      faceTrackerRef.current.resetTracking();
      lastFaceDetectedTimeRef.current = Date.now();
      setShowDetectionRetryPrompt(false);
      setInitError(null);

      // 3. Switch camera stream
      const newStream = await cameraServiceRef.current.startCamera(video, undefined, nextFacingMode);
      setFacingMode(nextFacingMode);

      // 4. Update mirroring (front camera defaults to mirrored; back camera defaults to natural view)
      setIsMirrored(nextFacingMode === 'user');
      setActiveStream(newStream);
      setCameraActive(true);

      // 5. Ensure video playback is active
      try {
        await video.play();
      } catch {
        // play() might already be active
      }

      // 6. Restart pipeline loop with the new video stream
      startPipelineLoop();
    } catch (err: any) {
      console.error('Camera flip failed:', err);
      setInitError(`Unable to switch camera: ${err.message || err.name}`);
      // Restart loop so previous video stream doesn't freeze
      startPipelineLoop();
    } finally {
      setIsFlippingCamera(false);
    }
  };

  // Handler to toggle horizontal mirror view without changing camera stream
  const handleToggleMirror = () => {
    setIsMirrored((prev) => !prev);
  };

  // Handle Video Source Start / Stop
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let isCancelled = false;

    const handlePlaying = () => {
      setInitError(null);
      setCameraActive(true);
    };
    video.addEventListener('playing', handlePlaying);

    if (devVideoMode && devVideoUrl) {
      cameraServiceRef.current.stopCamera();
      setActiveStream(null);
      video.srcObject = null;
      video.src = devVideoUrl;
      video.loop = true;
      video.muted = true;
      video
        .play()
        .then(() => {
          if (!isCancelled) {
            setInitError(null);
            setCameraActive(true);
            startPipelineLoop();
          }
        })
        .catch((playErr) => {
          if (!isCancelled && playErr.name !== 'AbortError') {
            setInitError(playErr.message);
          }
        });
    } else if (!devVideoMode) {
      if (video.src) {
        video.removeAttribute('src');
      }
      cameraServiceRef.current
        .startCamera(video)
        .then((stream) => {
          if (!isCancelled) {
            setInitError(null);
            setActiveStream(stream);
            setCameraActive(true);
            startPipelineLoop();
          }
        })
        .catch((err: any) => {
          if (!isCancelled) {
            const msg = (err.message || '').toLowerCase();
            if (err.name === 'AbortError' || msg.includes('interrupted') || msg.includes('abort')) {
              return;
            }
            setActiveStream(null);
            setCameraActive(false);
            setInitError(err.message);
          }
        });
    }

    return () => {
      isCancelled = true;
      video.removeEventListener('playing', handlePlaying);
      stopPipelineLoop();
      cameraServiceRef.current.stopCamera();
      setActiveStream(null);
    };
  }, [devVideoMode, devVideoUrl]);

  // Main processing loop using standard requestAnimationFrame with auto-recovery
  const startPipelineLoop = () => {
    if (isLoopRunningRef.current) return;
    isLoopRunningRef.current = true;

    let isProcessing = false;

    const processFrame = (now: DOMHighResTimeStamp) => {
      if (!isLoopRunningRef.current) return;

      // Always schedule the next animation frame immediately
      // This guarantees the pipeline loop NEVER dies under any circumstances
      animationFrameIdRef.current = requestAnimationFrame(processFrame);

      const video = videoRef.current;
      const canvas = overlayCanvasRef.current;

      if (
        !isProcessing &&
        video &&
        video.readyState >= 2 &&
        !video.paused &&
        !video.ended &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        canvas
      ) {
        isProcessing = true;
        runSingleFramePipeline(video, canvas, now)
          .catch((pipelineErr) => {
            console.warn('Frame pipeline execution warning:', pipelineErr);
          })
          .finally(() => {
            isProcessing = false;
          });
      }

      // FPS Calculation (every 500 ms)
      frameCountSinceCheckRef.current++;
      const timeSinceLastFps = now - lastFpsCheckTimeRef.current;
      if (timeSinceLastFps >= 500) {
        currentFpsRef.current = Math.round((frameCountSinceCheckRef.current * 1000) / timeSinceLastFps);
        frameCountSinceCheckRef.current = 0;
        lastFpsCheckTimeRef.current = now;

        const latency = classifierRef.current?.getInferenceLatency() || 0;
        const dropped = classifierRef.current?.getDroppedFramesCount() || 0;
        updateTelemetry(currentFpsRef.current, Math.round(latency * 10) / 10, dropped);
      }
    };

    animationFrameIdRef.current = requestAnimationFrame(processFrame);
  };

  const stopPipelineLoop = () => {
    isLoopRunningRef.current = false;
    if (animationFrameIdRef.current !== null) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
  };

  /**
   * Core frame processing pipeline:
   * 1. MediaPipe face detection & landmark extraction
   * 2. Quality gate verification
   * 3. CNN inference on 48x48 cropped face
   * 4. Multi-modal fusion with facial Action Units (works with and without visible teeth)
   * 5. Temporal smoothing & Session logging
   * 6. Real-time visual overlay rendering
   */
  const runSingleFramePipeline = async (
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    timestamp: DOMHighResTimeStamp
  ) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas display resolution to underlying video stream
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw;
      canvas.height = vh;
    }

    ctx.clearRect(0, 0, vw, vh);

    // 1. Run MediaPipe Face Landmarker
    const trackingResult = faceTrackerRef.current.detectForVideo(video, timestamp);
    const landmarks = trackingResult?.faceLandmarks?.[0];
    const blendshapesCategories = trackingResult?.faceBlendshapes?.[0]?.categories as
      | BlendshapeCategory[]
      | undefined;

    // 2. Evaluate Face Quality Gate
    const qualityResult = evaluateQualityGate({
      landmarks,
      detectionScore: 1.0,
      videoWidth: vw,
      videoHeight: vh,
      prevCenter: prevCenterRef.current,
      minBoxSizePx: 40,
      minConfidence: 0.30,
      maxMotionDisplacement: 0.25,
    });

    if (qualityResult.passed && qualityResult.center) {
      prevCenterRef.current = qualityResult.center;
      lastFaceDetectedTimeRef.current = Date.now();
      if (showDetectionRetryPrompt) {
        setShowDetectionRetryPrompt(false);
      }
    } else {
      // Clear prevCenter so subsequent frames can re-acquire face without motion lock
      prevCenterRef.current = null;
      if (Date.now() - lastFaceDetectedTimeRef.current > 3000 && !showDetectionRetryPrompt) {
        setShowDetectionRetryPrompt(true);
      }
    }

    // Build key-value map for blendshapes
    const blendshapesMap: Record<string, number> = {};
    if (blendshapesCategories && Array.isArray(blendshapesCategories)) {
      for (let i = 0; i < blendshapesCategories.length; i++) {
        blendshapesMap[blendshapesCategories[i].categoryName] = blendshapesCategories[i].score;
      }
    }

    // Default distress score calculation from blendshapes
    const distress = calculateDistressHeuristic(blendshapesMap);

    let rawEmotion: EmotionClass | 'UNCERTAIN' | 'NO_RESULT' = 'NO_RESULT';
    let probabilities = [0, 0, 0, 0, 0];
    let topConfidence = 0;
    let qualityFlag: QualityFlag = qualityResult.qualityFlag;

    if (qualityResult.passed && qualityResult.boundingBox) {
      // 3. Extract 48x48 cropped face tensor (tight crop 0.02 + eye-level roll stabilization)
      const faceTensor = faceTrackerRef.current.extractCroppedFaceTensor(
        video,
        qualityResult.boundingBox,
        0.02,
        landmarks
      );

      if (faceTensor && classifierRef.current) {
        // 4. CNN classification (drops late frames automatically)
        const inferOutput = await classifierRef.current.classify(faceTensor);

        if (inferOutput) {
          const cnnProbs = inferOutput.probabilities; // [angry, fear, happy, neutral, sad]

          // -------------------------------------------------------------------
          // Detailed Clinical Behavioral Rules & Disambiguation Evaluation
          // (Happy, Fear, Sad, Angry, Neutral)
          // -------------------------------------------------------------------
          const ruleResult = ClinicalEmotionRules.evaluate({
            blendshapesMap,
            landmarks,
            cnnProbs,
            confidenceThreshold,
          });

          rawEmotion = ruleResult.rawEmotion;
          topConfidence = ruleResult.topConfidence;
          probabilities = ruleResult.probabilities;
        }
      }
    } else {
      rawEmotion = 'NO_RESULT';
    }

    // 5. Temporal smoothing over rolling N frames
    const smoothedEmotion = smootherRef.current.add(rawEmotion);

    // Negative affect flag: angry | fear | sad = 1; happy | neutral = 0
    const isNegativeAffect = ['angry', 'fear', 'sad'].includes(smoothedEmotion);

    // Always retrieve current active phase directly to guarantee zero closure staleness
    const currentPhase = useSessionStore.getState().activePhase;

    const frameResult: FrameResult = {
      timestamp_ms: Date.now(),
      participant_id: participantId,
      phase: currentPhase,
      rawEmotion,
      smoothedEmotion,
      confidence: topConfidence,
      qualityFlag,
      probabilities,
      blendshapeDistressScore: distress.score,
      isNegativeAffect,
      blendshapes: blendshapesMap,
      ai_estimated_behavior: isNegativeAffect ? 'Likely Negative' : 'Likely Positive',
    };

    // Update Zustand state for dashboard
    setCurrentFrame(frameResult);

    // 6. Log to SessionLogger with current phase
    sessionLogger.logFrame(frameResult);

    // 7. Render Canvas Visual Overlays
    renderVisualOverlays(
      ctx,
      vw,
      vh,
      landmarks,
      qualityResult.boundingBox,
      smoothedEmotion,
      topConfidence,
      qualityFlag,
      showFaceMesh,
      isBlindedMode,
      isNegativeAffect,
      isMirrored
    );
  };

  /**
   * Draws bounding box, emotion badge, and face mesh onto the overlay canvas.
   * If isMirrored is true, horizontally inverts coordinate mapping to match mirrored video display.
   */
  const renderVisualOverlays = (
    ctx: CanvasRenderingContext2D,
    vw: number,
    vh: number,
    landmarks: any[] | undefined,
    box: any | undefined,
    emotion: EmotionClass | 'UNCERTAIN' | 'NO_RESULT',
    confidence: number,
    qualityFlag: QualityFlag,
    renderMesh: boolean,
    blinded: boolean,
    isNegativeAffect?: boolean,
    mirrored?: boolean
  ) => {
    // Render face mesh points if enabled and not blinded
    if (!blinded && renderMesh && landmarks && landmarks.length > 0) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.5)'; // sky-400
      for (let i = 0; i < landmarks.length; i += 3) {
        // sample every 3rd point for performance
        const lm = landmarks[i];
        const lx = mirrored ? (1 - lm.x) * vw : lm.x * vw;
        const ly = lm.y * vh;
        ctx.beginPath();
        ctx.arc(lx, ly, 1.2, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    if (!box) {
      if (!blinded) {
        // Draw subtle scanning indicator in corner
        ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
        ctx.font = 'bold 13px ui-sans-serif, system-ui';
        ctx.fillText(`🔍 Scanning for face... (${qualityFlag})`, 16, 28);
      }
      return;
    }

    const rawBx = box.xMin * vw;
    const bx = mirrored ? (1 - box.xMin - box.width) * vw : rawBx;
    const by = box.yMin * vh;
    const bw = box.width * vw;
    const bh = box.height * vh;

    if (blinded) {
      // In Blinded Mode: Show ONLY a subtle neutral slate tracking border.
      // NO emotion classification, NO confidence, NO emotion color coding, NO HUD tags.
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.setLineDash([]);
      return;
    }

    // Determine bounding box border color based on emotion / negative affect
    let boxColor = 'rgba(56, 189, 248, 0.8)'; // default sky
    if (isNegativeAffect || ['angry', 'sad'].includes(emotion as any)) {
      boxColor = 'rgba(244, 63, 94, 0.9)'; // rose / negative affect
    } else if (emotion === 'happy') {
      boxColor = 'rgba(16, 185, 129, 0.9)'; // emerald
    } else if (emotion === 'UNCERTAIN') {
      boxColor = 'rgba(245, 158, 11, 0.8)'; // amber
    } else if (emotion === 'NO_RESULT') {
      boxColor = 'rgba(100, 116, 139, 0.6)'; // slate
    }

    ctx.strokeStyle = boxColor;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(bx, by, bw, bh);

    // Format Label
    const emoji = EMOTION_EMOJIS[emotion] || '😐';
    const mainLabel =
      emotion === 'NO_RESULT'
        ? `NO_RESULT (${qualityFlag})`
        : emotion === 'UNCERTAIN'
        ? `UNCERTAIN (${Math.round(confidence * 100)}%)`
        : `${emotion.toUpperCase()} (${Math.round(confidence * 100)}%)`;

    // Measure text dimensions for pill HUD badge
    ctx.font = 'bold 14px ui-sans-serif, system-ui';
    const mainWidth = ctx.measureText(`${emoji} ${mainLabel}`).width;

    const badgeW = mainWidth + 24;
    const badgeH = 32;
    const badgeX = Math.max(8, Math.min(vw - badgeW - 8, bx));
    const badgeY = Math.max(8, by - badgeH - 6);

    // Pill background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
    ctx.fill();
    ctx.strokeStyle = boxColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Emoji & Main Label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px ui-sans-serif, system-ui';
    ctx.fillText(`${emoji} ${mainLabel}`, badgeX + 12, badgeY + 21);
  };

  return (
    <div className="relative w-full aspect-[4/3] max-h-[520px] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center">
      {/* Underlying Video with responsive mirror flip */}
      <video
        ref={videoRef}
        playsInline
        muted
        className={`w-full h-full object-contain transition-transform duration-200 ${
          isMirrored ? 'scale-x-[-1]' : 'scale-x-100'
        }`}
      />

      {/* Transparent Overlay Canvas */}
      <canvas
        ref={overlayCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none object-contain"
      />

      {/* Initializing / Error Banner */}
      {initError && !cameraActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 p-6 text-center z-20">
          <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
          <h3 className="text-base font-bold text-slate-100">Video Pipeline Error</h3>
          <p className="text-xs text-slate-300 max-w-md mt-1">{initError}</p>
          <p className="text-[11px] text-slate-500 mt-2 mb-4">
            Ensure camera permission is allowed and access is on localhost or HTTPS.
          </p>
          <button
            onClick={() => {
              setInitError(null);
              const video = videoRef.current;
              if (video) {
                cameraServiceRef.current
                  .startCamera(video, undefined, facingMode)
                  .then((stream) => {
                    setInitError(null);
                    setActiveStream(stream);
                    setCameraActive(true);
                    startPipelineLoop();
                  })
                  .catch((err) => {
                    const msg = (err.message || '').toLowerCase();
                    if (err.name === 'AbortError' || msg.includes('interrupted') || msg.includes('abort')) {
                      return;
                    }
                    setInitError(err.message);
                  });
              }
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow transition-all cursor-pointer"
          >
            Retry Camera Access
          </button>
        </div>
      )}

      {/* Camera Live Indicator (Top Left) */}
      <div className="absolute top-3 left-3 flex items-center space-x-2 bg-slate-900/85 backdrop-blur-sm px-2.5 py-1 rounded-full border border-slate-700/60 text-[11px] font-medium z-10">
        <span
          className={`w-2 h-2 rounded-full ${
            cameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
          }`}
        />
        <span className="text-slate-300">
          {devVideoMode ? 'Dev Video' : cameraActive ? 'Live Camera' : 'Camera Off'}
        </span>
        {classifierBackend !== 'initializing' && (
          <span className="text-[9px] font-mono text-slate-400 uppercase border-l border-slate-700 pl-1.5 ml-1">
            {classifierBackend}
          </span>
        )}
      </div>

      {/* Face Detection Active Auto-Recovery & Re-scan Helper (Bottom Center) */}
      {cameraActive && !devVideoMode && showDetectionRetryPrompt && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center space-x-2.5 bg-slate-900/95 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-sky-500/50 text-[11px] font-medium text-slate-200 shadow-2xl z-10">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span>Searching for face...</span>
          <button
            type="button"
            onClick={handleRetryDetection}
            className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-sky-600 hover:bg-sky-500 text-white font-semibold transition-all cursor-pointer text-[10px] shadow"
            title="Force reset and re-scan face detection"
          >
            <RefreshCw className="w-2.5 h-2.5" />
            <span>Re-scan</span>
          </button>
        </div>
      )}

      {/* Mobile-Friendly Camera Flip & Mirror Controls (Top Right) */}
      {!devVideoMode && (
        <div className="absolute top-3 right-3 flex items-center space-x-1.5 z-10">
          {/* Flip Camera (Front / Back on Mobile) */}
          <button
            type="button"
            onClick={handleFlipCamera}
            disabled={isFlippingCamera}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-900/85 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 backdrop-blur-sm text-[11px] font-semibold transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
            title="Switch between front selfie camera and back environment camera"
          >
            <SwitchCamera className={`w-3.5 h-3.5 text-sky-400 ${isFlippingCamera ? 'animate-spin' : ''}`} />
            <span>{facingMode === 'user' ? 'Flip to Rear' : 'Flip to Front'}</span>
          </button>

          {/* Mirror View Toggle */}
          <button
            type="button"
            onClick={handleToggleMirror}
            className={`flex items-center space-x-1 px-2 py-1 rounded-full border backdrop-blur-sm text-[11px] font-semibold transition-all shadow-md active:scale-95 cursor-pointer ${
              isMirrored
                ? 'bg-sky-950/80 border-sky-500/60 text-sky-300'
                : 'bg-slate-900/85 border-slate-700/80 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle horizontal mirror reflection (does not alter machine learning accuracy)"
          >
            <FlipHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isMirrored ? 'Mirrored' : 'Natural'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
