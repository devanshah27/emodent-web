import { QualityGateInput, QualityGateResult, BoundingBox } from '../types';

/**
 * Pure function: QualityGate
 *
 * Evaluates whether face landmarks from MediaPipe meet strict quality criteria
 * suitable for emotion inference during pediatric dental procedures.
 *
 * Emits NO_RESULT (passed = false) if:
 * 1. No face landmarks are detected.
 * 2. Face bounding box is smaller than minBoxSizePx (or too small relative to frame).
 * 3. Average landmark presence/visibility or detectionScore is below minConfidence.
 * 4. Inter-frame motion displacement between frame centers exceeds maxMotionDisplacement
 *    (signaling rapid head jerk, patient evasion, or clinical hands/instruments occluding).
 */
export function evaluateQualityGate(input: QualityGateInput): QualityGateResult {
  const {
    landmarks,
    detectionScore = 1.0,
    videoWidth,
    videoHeight,
    prevCenter,
    minBoxSizePx = 40,
    minConfidence = 0.35,
    maxMotionDisplacement = 0.25, // normalized distance relative to video dimension
  } = input;

  // 1. Check presence of landmarks
  if (!landmarks || landmarks.length === 0) {
    return {
      passed: false,
      qualityFlag: 'NO_FACE',
    };
  }

  // 2. Check detection score / confidence
  if (detectionScore < minConfidence) {
    return {
      passed: false,
      qualityFlag: 'LOW_CONFIDENCE',
    };
  }

  // Calculate face bounding box from normalized landmarks (x in [0,1], y in [0,1])
  let minX = 1.0;
  let maxX = 0.0;
  let minY = 1.0;
  let maxY = 0.0;

  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    if (lm.x < minX) minX = lm.x;
    if (lm.x > maxX) maxX = lm.x;
    if (lm.y < minY) minY = lm.y;
    if (lm.y > maxY) maxY = lm.y;
  }

  // Clamp to valid range
  minX = Math.max(0, Math.min(1, minX));
  maxX = Math.max(0, Math.min(1, maxX));
  minY = Math.max(0, Math.min(1, minY));
  maxY = Math.max(0, Math.min(1, maxY));

  const boxWidthNorm = maxX - minX;
  const boxHeightNorm = maxY - minY;

  const boxWidthPx = boxWidthNorm * videoWidth;
  const boxHeightPx = boxHeightNorm * videoHeight;

  const boundingBox: BoundingBox = {
    xMin: minX,
    yMin: minY,
    width: boxWidthNorm,
    height: boxHeightNorm,
  };

  const center = {
    x: minX + boxWidthNorm / 2,
    y: minY + boxHeightNorm / 2,
  };

  // 3. Check bounding box size
  if (boxWidthPx < minBoxSizePx || boxHeightPx < minBoxSizePx) {
    return {
      passed: false,
      qualityFlag: 'FACE_TOO_SMALL',
      boundingBox,
      center,
    };
  }

  // 4. Check inter-frame motion velocity
  if (prevCenter) {
    const dx = center.x - prevCenter.x;
    const dy = center.y - prevCenter.y;
    const displacement = Math.sqrt(dx * dx + dy * dy);

    if (displacement > maxMotionDisplacement) {
      return {
        passed: false,
        qualityFlag: 'EXCESSIVE_MOTION',
        boundingBox,
        center,
      };
    }
  }

  return {
    passed: true,
    qualityFlag: 'VALID',
    boundingBox,
    center,
  };
}

