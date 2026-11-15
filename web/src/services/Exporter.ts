import {
  FrameResult,
  PhaseStats,
  SessionMetadata,
  ProceduralPhase,
  ClinicianRating,
  validateClinicianRating,
} from '../types';

export class Exporter {
  /**
   * Converts recorded frame logs into standard frame-level CSV string.
   * Frame-level data contains ONLY AI and computer vision telemetry.
   * Clinician scores are kept in a separate file to guarantee blinding and prevent data contamination.
   */
  public static generateFrameCSV(records: FrameResult[], participantId: string): string {
    const headers = [
      'timestamp_ms',
      'participant_id',
      'phase',
      'emotion_label',
      'confidence',
      'quality_flag',
      'prob_angry',
      'prob_fear',
      'prob_happy',
      'prob_neutral',
      'prob_sad',
      'blendshape_distress',
      'negative_affect',
      'ai_estimated_behavior',
    ];

    const rows = records.map((r) => {
      const p = r.probabilities && r.probabilities.length === 5
        ? r.probabilities
        : [0, 0, 0, 0, 0];

      return [
        r.timestamp_ms,
        `"${participantId.replace(/"/g, '""')}"`,
        r.phase,
        r.smoothedEmotion,
        r.confidence.toFixed(4),
        r.qualityFlag,
        p[0].toFixed(4), // angry
        p[1].toFixed(4), // fear
        p[2].toFixed(4), // happy
        p[3].toFixed(4), // neutral
        p[4].toFixed(4), // sad
        r.blendshapeDistressScore.toFixed(4),
        r.isNegativeAffect ? 1 : 0,
        r.ai_estimated_behavior || (r.isNegativeAffect ? 'Likely Negative' : 'Likely Positive'),
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Exports clinician_scores.csv with required columns:
   * participant_id, phase, rater_id, blinded, vcas, vfas, fbrs, timestamp
   * Validates inputs (VCAS/VFAS 0-4, FBRS 1-4) and rejects invalid inputs.
   */
  public static generateClinicianCSV(ratings: ClinicianRating[]): string {
    const headers = [
      'participant_id',
      'phase',
      'rater_id',
      'blinded',
      'vcas',
      'vfas',
      'fbrs',
      'timestamp',
    ];

    const rows = ratings.map((r) => {
      const val = validateClinicianRating(r);
      if (!val.valid) {
        throw new Error(`Invalid clinician score for participant ${r.participant_id}, phase ${r.phase}: ${val.error}`);
      }

      return [
        `"${r.participant_id.replace(/"/g, '""')}"`,
        r.phase,
        `"${r.rater_id.replace(/"/g, '""')}"`,
        r.blinded ? 'true' : 'false',
        r.vcas !== null && r.vcas !== undefined ? r.vcas : '',
        r.vfas !== null && r.vfas !== undefined ? r.vfas : '',
        r.fbrs !== null && r.fbrs !== undefined ? r.fbrs : '',
        r.timestamp || Date.now(),
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Formats full clinical session metadata and phase summaries as JSON.
   * Includes vcas, vfas, and fbrs fields in each phase summary.
   */
  public static generateSessionJSON(
    metadata: SessionMetadata,
    phaseStats: Record<string, PhaseStats> | Record<ProceduralPhase, PhaseStats>,
    frameCount: number,
    clinicianRatings?: Record<string, ClinicianRating> | Record<ProceduralPhase, ClinicianRating>
  ): string {
    // Merge clinician ratings into phase stats if provided
    const enrichedPhases: Record<string, PhaseStats> = { ...phaseStats };
    if (clinicianRatings) {
      for (const p of Object.keys(clinicianRatings)) {
        if (enrichedPhases[p]) {
          const rating = clinicianRatings[p as ProceduralPhase];
          enrichedPhases[p] = {
            ...enrichedPhases[p],
            vcas: rating.vcas,
            vfas: rating.vfas,
            fbrs: rating.fbrs,
            rater_id: rating.rater_id,
            blinded: rating.blinded,
          };
        }
      }
    }

    const payload = {
      app: 'EmoDent Web Research Prototype',
      version: '0.2.0',
      notice: 'Passive research monitoring adjunct - NOT a medical or diagnostic device',
      metadata: {
        participantId: metadata.participantId,
        parentConsent: metadata.parentConsent,
        childAssent: metadata.childAssent,
        onDeviceProcessing: metadata.onDeviceConfirmed,
        startTimeISO: new Date(metadata.startTime).toISOString(),
        endTimeISO: metadata.endTime ? new Date(metadata.endTime).toISOString() : null,
        confidenceThreshold: metadata.confidenceThreshold,
        smoothingWindowFrames: metadata.smoothingWindow,
        totalRecordedFrames: frameCount,
      },
      phases: enrichedPhases,
    };

    return JSON.stringify(payload, null, 2);
  }

  /**
   * Triggers browser download for generated file payload.
   */
  public static triggerDownload(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
