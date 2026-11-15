import { describe, it, expect } from 'vitest';
import { Exporter } from '../services/Exporter';
import { FrameResult, SessionMetadata, PhaseStats } from '../types';

describe('Exporter Unit Tests', () => {
  const dummyFrames: FrameResult[] = [
    {
      timestamp_ms: 1600000000000,
      participant_id: 'P-TEST',
      phase: 'PRE_TREATMENT',
      rawEmotion: 'happy',
      smoothedEmotion: 'happy',
      confidence: 0.9421,
      qualityFlag: 'VALID',
      probabilities: [0.01, 0.005, 0.9421, 0.03, 0.0129],
      blendshapeDistressScore: 0.125,
      isNegativeAffect: false,
    },
    {
      timestamp_ms: 1600000000033,
      participant_id: 'P-TEST',
      phase: 'LOCAL_ANESTHESIA',
      rawEmotion: 'angry',
      smoothedEmotion: 'angry',
      confidence: 0.915,
      qualityFlag: 'VALID',
      probabilities: [0.915, 0.01, 0.02, 0.03, 0.025],
      blendshapeDistressScore: 0.65,
      isNegativeAffect: true,
    },
  ];

  it('generates well-formatted frame CSV with all required headers', () => {
    const csv = Exporter.generateFrameCSV(dummyFrames, 'P-TEST');
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(3); // header + 2 rows

    const header = lines[0];
    expect(header).toContain('timestamp_ms');
    expect(header).toContain('participant_id');
    expect(header).toContain('phase');
    expect(header).toContain('emotion_label');
    expect(header).toContain('confidence');
    expect(header).toContain('quality_flag');
    expect(header).toContain('prob_angry');
    expect(header).toContain('blendshape_distress');
    expect(header).toContain('negative_affect');
    expect(header).toContain('ai_estimated_behavior');

    const row1 = lines[1];
    expect(row1).toContain('PRE_TREATMENT');
    expect(row1).toContain('happy');
    expect(row1).toContain('0.9421');
    expect(row1).toContain('0.1250');
    expect(row1).toContain(',0,Likely Positive');

    const row2 = lines[2];
    expect(row2).toContain('LOCAL_ANESTHESIA');
    expect(row2).toContain('angry');
    expect(row2).toContain('0.6500');
    expect(row2).toContain(',1,Likely Negative');
  });

  it('generates valid JSON session summary', () => {
    const metadata: SessionMetadata = {
      participantId: 'P-TEST',
      parentConsent: true,
      childAssent: true,
      onDeviceConfirmed: true,
      startTime: 1600000000000,
      endTime: 1600000005000,
      confidenceThreshold: 0.9,
      smoothingWindow: 15,
    };

    const emptyPhaseStats: PhaseStats = {
      phase: 'PRE_TREATMENT',
      totalFrames: 1,
      validFrames: 1,
      noResultFrames: 0,
      uncertainFrames: 0,
      emotionCounts: { angry: 0, fear: 0, happy: 1, neutral: 0, sad: 0 },
      emotionPercentages: { angry: 0, fear: 0, happy: 100, neutral: 0, sad: 0 },
      negativeAffectFrames: 0,
      negativeAffectPercentage: 0,
      dominantEmotion: 'happy',
      finalNegativeAffectFlag: false,
    };

    const phaseStats = {
      PRE_TREATMENT: emptyPhaseStats,
      LOCAL_ANESTHESIA: { ...emptyPhaseStats, phase: 'LOCAL_ANESTHESIA' as const },
      EXTRACTION: { ...emptyPhaseStats, phase: 'EXTRACTION' as const },
      POST_TREATMENT: { ...emptyPhaseStats, phase: 'POST_TREATMENT' as const },
    };

    const jsonStr = Exporter.generateSessionJSON(metadata, phaseStats, 2);
    const parsed = JSON.parse(jsonStr);

    expect(parsed.metadata.participantId).toBe('P-TEST');
    expect(parsed.metadata.parentConsent).toBe(true);
    expect(parsed.phases.PRE_TREATMENT.dominantEmotion).toBe('happy');
  });
});

