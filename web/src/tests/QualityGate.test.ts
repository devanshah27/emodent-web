import { describe, it, expect } from 'vitest';
import { evaluateQualityGate } from '../services/QualityGate';
import { QualityGateInput } from '../types';

describe('QualityGate Pure Function Tests', () => {
  const dummyLandmarks = [
    { x: 0.3, y: 0.3 },
    { x: 0.7, y: 0.7 },
    { x: 0.5, y: 0.5 },
  ];

  it('fails with NO_FACE when landmarks are null or empty', () => {
    const input: QualityGateInput = {
      landmarks: null,
      detectionScore: 0.95,
      videoWidth: 640,
      videoHeight: 480,
    };
    const res = evaluateQualityGate(input);
    expect(res.passed).toBe(false);
    expect(res.qualityFlag).toBe('NO_FACE');

    const emptyInput: QualityGateInput = {
      landmarks: [],
      detectionScore: 0.95,
      videoWidth: 640,
      videoHeight: 480,
    };
    expect(evaluateQualityGate(emptyInput).qualityFlag).toBe('NO_FACE');
  });

  it('fails with LOW_CONFIDENCE when detectionScore is below threshold', () => {
    const input: QualityGateInput = {
      landmarks: dummyLandmarks,
      detectionScore: 0.35,
      minConfidence: 0.50,
      videoWidth: 640,
      videoHeight: 480,
    };
    const res = evaluateQualityGate(input);
    expect(res.passed).toBe(false);
    expect(res.qualityFlag).toBe('LOW_CONFIDENCE');
  });

  it('fails with FACE_TOO_SMALL when bounding box is smaller than minBoxSizePx', () => {
    // Very tiny box: 0.05 * 640 = 32px < 64px
    const tinyLandmarks = [
      { x: 0.50, y: 0.50 },
      { x: 0.52, y: 0.52 },
    ];
    const input: QualityGateInput = {
      landmarks: tinyLandmarks,
      detectionScore: 0.95,
      minBoxSizePx: 64,
      videoWidth: 640,
      videoHeight: 480,
    };
    const res = evaluateQualityGate(input);
    expect(res.passed).toBe(false);
    expect(res.qualityFlag).toBe('FACE_TOO_SMALL');
  });

  it('fails with EXCESSIVE_MOTION when head center displacement is too fast', () => {
    const input: QualityGateInput = {
      landmarks: dummyLandmarks, // center is around (0.5, 0.5)
      detectionScore: 0.95,
      videoWidth: 640,
      videoHeight: 480,
      prevCenter: { x: 0.1, y: 0.1 }, // displacement > 0.4 > 0.15
      maxMotionDisplacement: 0.15,
    };
    const res = evaluateQualityGate(input);
    expect(res.passed).toBe(false);
    expect(res.qualityFlag).toBe('EXCESSIVE_MOTION');
  });

  it('passes with VALID when face is centered, clear, stationary, and sized properly', () => {
    const input: QualityGateInput = {
      landmarks: dummyLandmarks,
      detectionScore: 0.95,
      videoWidth: 640,
      videoHeight: 480,
      prevCenter: { x: 0.50, y: 0.50 },
      minBoxSizePx: 64,
      minConfidence: 0.50,
      maxMotionDisplacement: 0.15,
    };
    const res = evaluateQualityGate(input);
    expect(res.passed).toBe(true);
    expect(res.qualityFlag).toBe('VALID');
    expect(res.boundingBox).toBeDefined();
    expect(res.boundingBox!.width).toBeCloseTo(0.4, 2);
    expect(res.boundingBox!.height).toBeCloseTo(0.4, 2);
  });
});

