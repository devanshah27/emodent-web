import { describe, it, expect } from 'vitest';
import { SessionLogger } from '../services/SessionLogger';
import { Exporter } from '../services/Exporter';
import { ProceduralPhase, EMOTION_CLASSES, SessionMetadata } from '../types';

describe('Full 4-Phase Mock Session End-to-End Test', () => {
  it('simulates a complete 4-phase clinical run and exports valid CSV and JSON', () => {
    const logger = new SessionLogger();
    const participantId = 'P-MOCK-E2E';
    const phases: ProceduralPhase[] = [
      'PRE_TREATMENT',
      'LOCAL_ANESTHESIA',
      'EXTRACTION',
      'POST_TREATMENT',
    ];

    let baseTimestamp = 1700000000000;

    // Simulate 20 frames per phase (80 frames total)
    for (const phase of phases) {
      for (let f = 0; f < 20; f++) {
        baseTimestamp += 33; // 30 fps

        // Phase-specific realistic behavior
        let emotion: any = 'happy';
        let isNeg = false;
        let distress = 0.1;
        let qFlag: any = 'VALID';

        if (phase === 'PRE_TREATMENT') {
          emotion = f < 10 ? 'neutral' : 'happy';
          isNeg = false;
          distress = 0.12;
        } else if (phase === 'LOCAL_ANESTHESIA') {
          emotion = f < 15 ? 'angry' : 'sad';
          isNeg = true;
          distress = 0.75;
        } else if (phase === 'EXTRACTION') {
          emotion = f < 12 ? 'angry' : 'sad';
          isNeg = true;
          distress = 0.82;
        } else if (phase === 'POST_TREATMENT') {
          emotion = f < 10 ? 'sad' : 'neutral';
          isNeg = f < 10;
          distress = 0.25;
        }

        // Occasional NO_RESULT to verify quality gate tracking
        if (f === 5) {
          emotion = 'NO_RESULT';
          qFlag = 'EXCESSIVE_MOTION';
        }

        logger.logFrame({
          timestamp_ms: baseTimestamp,
          participant_id: participantId,
          phase,
          rawEmotion: emotion,
          smoothedEmotion: emotion,
          confidence: 0.94,
          qualityFlag: qFlag,
          probabilities: [0.05, 0.05, 0.80, 0.05, 0.05],
          blendshapeDistressScore: distress,
          isNegativeAffect: isNeg,
        });
      }
    }

    expect(logger.getRecordCount()).toBe(80);

    // Compute all phase summaries
    const phaseStats = logger.computeAllPhases();

    expect(phaseStats.PRE_TREATMENT.totalFrames).toBe(20);
    expect(phaseStats.LOCAL_ANESTHESIA.totalFrames).toBe(20);
    expect(phaseStats.EXTRACTION.totalFrames).toBe(20);
    expect(phaseStats.POST_TREATMENT.totalFrames).toBe(20);

    // Verify negative affect flags per phase
    expect(phaseStats.PRE_TREATMENT.finalNegativeAffectFlag).toBe(false);
    expect(phaseStats.LOCAL_ANESTHESIA.finalNegativeAffectFlag).toBe(true);
    expect(phaseStats.EXTRACTION.finalNegativeAffectFlag).toBe(true);

    // Verify NO_RESULT tracking
    expect(phaseStats.PRE_TREATMENT.noResultFrames).toBe(1);
    expect(phaseStats.LOCAL_ANESTHESIA.noResultFrames).toBe(1);

    // Test CSV Export
    const csvContent = Exporter.generateFrameCSV(logger.getRecords(), participantId);
    const csvLines = csvContent.trim().split('\n');
    expect(csvLines.length).toBe(81); // 1 header + 80 data rows
    expect(csvLines[0]).toBe(
      'timestamp_ms,participant_id,phase,emotion_label,confidence,quality_flag,prob_angry,prob_fear,prob_happy,prob_neutral,prob_sad,blendshape_distress,negative_affect,ai_estimated_behavior'
    );

    // Test JSON Export
    const metadata: SessionMetadata = {
      participantId,
      parentConsent: true,
      childAssent: true,
      onDeviceConfirmed: true,
      startTime: 1700000000000,
      endTime: baseTimestamp,
      confidenceThreshold: 0.90,
      smoothingWindow: 15,
    };

    const jsonContent = Exporter.generateSessionJSON(metadata, phaseStats, logger.getRecordCount());
    const parsed = JSON.parse(jsonContent);

    expect(parsed.app).toContain('EmoDent Web');
    expect(parsed.metadata.totalRecordedFrames).toBe(80);
    expect(parsed.phases.LOCAL_ANESTHESIA.finalNegativeAffectFlag).toBe(true);
    expect(parsed.phases.PRE_TREATMENT.finalNegativeAffectFlag).toBe(false);
  });
});

