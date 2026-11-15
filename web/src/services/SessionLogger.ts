import {
  FrameResult,
  ProceduralPhase,
  PhaseStats,
  EmotionClass,
  EMOTION_CLASSES,
} from '../types';

export class SessionLogger {
  private records: FrameResult[] = [];

  public logFrame(record: FrameResult): void {
    this.records.push(record);
  }

  public getRecords(): FrameResult[] {
    return this.records;
  }

  public getRecordCount(): number {
    return this.records.length;
  }

  public clear(): void {
    this.records = [];
  }

  /**
   * Returns records logged within the last rolling window (e.g. 10 seconds).
   */
  public getRecentRecords(windowMs: number = 10000): FrameResult[] {
    if (this.records.length === 0) return [];
    const now = this.records[this.records.length - 1].timestamp_ms;
    const cutoff = now - windowMs;
    return this.records.filter((r) => r.timestamp_ms >= cutoff);
  }

  /**
   * Computes summary metrics for a given phase over all logged frames:
   * - Total frames, valid frames, NO_RESULT %, UNCERTAIN %
   * - Frequency distribution of each emotion class
   * - Dominant emotion
   * - Negative affect percentage and final negative affect flag (1 if >= 50%)
   */
  public computePhaseStats(phase: ProceduralPhase): PhaseStats {
    const phaseRecords = this.records.filter((r) => r.phase === phase);
    const totalFrames = phaseRecords.length;

    const counts: Record<EmotionClass, number> = {
      angry: 0,
      fear: 0,
      happy: 0,
      neutral: 0,
      sad: 0,
    };

    let validFrames = 0;
    let noResultFrames = 0;
    let uncertainFrames = 0;
    let negativeAffectFrames = 0;

    for (const r of phaseRecords) {
      if (r.qualityFlag !== 'VALID' || r.smoothedEmotion === 'NO_RESULT') {
        noResultFrames++;
      } else if (r.smoothedEmotion === 'UNCERTAIN') {
        uncertainFrames++;
        validFrames++;
      } else {
        validFrames++;
        const emotion = r.smoothedEmotion as EmotionClass;
        if (counts[emotion] !== undefined) {
          counts[emotion]++;
        }
        if (r.isNegativeAffect) {
          negativeAffectFrames++;
        }
      }
    }

    const percentages: Record<EmotionClass, number> = {
      angry: 0,
      fear: 0,
      happy: 0,
      neutral: 0,
      sad: 0,
    };

    let dominantEmotion: EmotionClass | 'NONE' = 'NONE';
    let maxCount = -1;

    for (const cls of EMOTION_CLASSES) {
      percentages[cls] = validFrames > 0 ? (counts[cls] / validFrames) * 100 : 0;
      if (counts[cls] > maxCount) {
        maxCount = counts[cls];
        dominantEmotion = cls;
      }
    }

    if (maxCount === 0 && validFrames === 0) {
      dominantEmotion = 'NONE';
    }

    const negativeAffectPercentage =
      validFrames > 0 ? (negativeAffectFrames / validFrames) * 100 : 0;

    // Final negative affect flag: true if negative affect frames >= 50% of valid classified frames
    const finalNegativeAffectFlag = negativeAffectPercentage >= 50;

    return {
      phase,
      totalFrames,
      validFrames,
      noResultFrames,
      uncertainFrames,
      emotionCounts: counts,
      emotionPercentages: percentages,
      negativeAffectFrames,
      negativeAffectPercentage: Math.round(negativeAffectPercentage * 10) / 10,
      dominantEmotion,
      finalNegativeAffectFlag,
    };
  }

  /**
   * Computes statistics across all phases.
   */
  public computeAllPhases(phasesList?: ProceduralPhase[]): Record<ProceduralPhase, PhaseStats> {
    const phases: ProceduralPhase[] = phasesList || [
      'PRE_TREATMENT',
      'PULPECTOMY',
      'CROWN_PREP',
      'CARIES_EXCAVATION',
      'EXTRACTION',
      'LOCAL_ANESTHESIA',
      'POST_TREATMENT',
    ];

    const result: any = {};
    for (const phase of phases) {
      result[phase] = this.computePhaseStats(phase);
    }
    return result;
  }
}

export const sessionLogger = new SessionLogger();
