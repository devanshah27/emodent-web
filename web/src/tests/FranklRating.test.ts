import { describe, it, expect } from 'vitest';
import {
  validateClinicianRating,
  isFranklNegative,
  reverseFrankl,
  FRANKL_NEGATIVE_THRESHOLD,
  ClinicianRating,
  FRANKL_ANCHORS,
  VCAS_ANCHORS,
  VFAS_ANCHORS,
} from '../types';
import { Exporter } from '../services/Exporter';
import { useSessionStore } from '../store/sessionStore';

describe('Frankl Behavior Rating Scale (FBRS) & Clinician Rating Tests', () => {
  describe('FBRS Scale Definitions and Constants', () => {
    it('defines FRANKL_NEGATIVE_THRESHOLD as 2', () => {
      expect(FRANKL_NEGATIVE_THRESHOLD).toBe(2);
    });

    it('defines exactly 4 Frankl anchors with required descriptions', () => {
      expect(FRANKL_ANCHORS.length).toBe(4);
      expect(FRANKL_ANCHORS[0].score).toBe(1);
      expect(FRANKL_ANCHORS[0].label).toContain('Definitely negative');
      expect(FRANKL_ANCHORS[1].score).toBe(2);
      expect(FRANKL_ANCHORS[1].label).toContain('Negative');
      expect(FRANKL_ANCHORS[2].score).toBe(3);
      expect(FRANKL_ANCHORS[2].label).toContain('Positive');
      expect(FRANKL_ANCHORS[3].score).toBe(4);
      expect(FRANKL_ANCHORS[3].label).toContain('Definitely positive');
    });

    it('defines 5 VCAS and 5 VFAS anchors', () => {
      expect(VCAS_ANCHORS.length).toBe(5);
      expect(VFAS_ANCHORS.length).toBe(5);
    });
  });

  describe('FBRS Binarization Logic', () => {
    it('correctly classifies FBRS <= 2 as negative behavior', () => {
      expect(isFranklNegative(1)).toBe(true);
      expect(isFranklNegative(2)).toBe(true);
    });

    it('correctly classifies FBRS >= 3 as non-negative (positive) behavior', () => {
      expect(isFranklNegative(3)).toBe(false);
      expect(isFranklNegative(4)).toBe(false);
    });
  });

  describe('FBRS Reversal Logic', () => {
    it('reverses FBRS scores so lower raw scores become higher distress values', () => {
      // 1 (Definitely negative) -> 4 (highest distress comparator)
      expect(reverseFrankl(1)).toBe(4);
      // 2 (Negative) -> 3
      expect(reverseFrankl(2)).toBe(3);
      // 3 (Positive) -> 2
      expect(reverseFrankl(3)).toBe(2);
      // 4 (Definitely positive) -> 1 (lowest distress comparator)
      expect(reverseFrankl(4)).toBe(1);
    });
  });

  describe('Clinician Rating Validation', () => {
    it('validates valid VCAS, VFAS, and FBRS ratings', () => {
      const validRating: Partial<ClinicianRating> = {
        vcas: 2,
        vfas: 3,
        fbrs: 1,
      };
      const result = validateClinicianRating(validRating);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('allows null or empty scores for pending evaluations', () => {
      const pendingRating: Partial<ClinicianRating> = {
        vcas: null,
        vfas: null,
        fbrs: null,
      };
      const result = validateClinicianRating(pendingRating);
      expect(result.valid).toBe(true);
    });

    it('rejects VCAS outside [0, 4]', () => {
      expect(validateClinicianRating({ vcas: -1 }).valid).toBe(false);
      expect(validateClinicianRating({ vcas: 5 }).valid).toBe(false);
      expect(validateClinicianRating({ vcas: 2.5 }).valid).toBe(false);
    });

    it('rejects VFAS outside [0, 4]', () => {
      expect(validateClinicianRating({ vfas: -1 }).valid).toBe(false);
      expect(validateClinicianRating({ vfas: 5 }).valid).toBe(false);
      expect(validateClinicianRating({ vfas: 1.5 }).valid).toBe(false);
    });

    it('rejects FBRS outside [1, 4]', () => {
      expect(validateClinicianRating({ fbrs: 0 as any }).valid).toBe(false);
      expect(validateClinicianRating({ fbrs: 5 as any }).valid).toBe(false);
      expect(validateClinicianRating({ fbrs: 2.2 as any }).valid).toBe(false);
    });
  });

  describe('Clinician CSV Exporter & Separation', () => {
    it('exports clinician_scores.csv with all 8 required columns', () => {
      const ratings: ClinicianRating[] = [
        {
          participant_id: 'P-1001',
          phase: 'PRE_TREATMENT',
          rater_id: 'rater1',
          blinded: true,
          vcas: 0,
          vfas: 1,
          fbrs: 4,
          timestamp: 1600000000000,
        },
        {
          participant_id: 'P-1001',
          phase: 'LOCAL_ANESTHESIA',
          rater_id: 'rater1',
          blinded: true,
          vcas: 3,
          vfas: 3,
          fbrs: 1,
          timestamp: 1600000010000,
        },
      ];

      const csv = Exporter.generateClinicianCSV(ratings);
      const lines = csv.trim().split('\n');

      expect(lines.length).toBe(3); // header + 2 rows
      expect(lines[0]).toBe('participant_id,phase,rater_id,blinded,vcas,vfas,fbrs,timestamp');

      const row1 = lines[1];
      expect(row1).toContain('"P-1001"');
      expect(row1).toContain('PRE_TREATMENT');
      expect(row1).toContain('"rater1"');
      expect(row1).toContain('true'); // blinded
      expect(row1).toContain(',0,1,4,');

      const row2 = lines[2];
      expect(row2).toContain('LOCAL_ANESTHESIA');
      expect(row2).toContain(',3,3,1,');
    });

    it('throws error when exporting invalid clinician score', () => {
      const invalidRatings: ClinicianRating[] = [
        {
          participant_id: 'P-1001',
          phase: 'PRE_TREATMENT',
          rater_id: 'rater1',
          blinded: false,
          vcas: 8, // invalid!
          vfas: 2,
          fbrs: 3,
          timestamp: 1600000000000,
        },
      ];

      expect(() => Exporter.generateClinicianCSV(invalidRatings)).toThrow();
    });
  });

  describe('Zustand Clinician Rating & Blinded State', () => {
    it('manages raterId, blinded mode, and ratings per phase', () => {
      const store = useSessionStore.getState();

      store.setRaterId('dr_smith');
      expect(useSessionStore.getState().raterId).toBe('dr_smith');

      store.setIsBlindedMode(true);
      expect(useSessionStore.getState().isBlindedMode).toBe(true);

      store.setClinicianRating('EXTRACTION', {
        vcas: 4,
        vfas: 4,
        fbrs: 1,
        blinded: true,
      });

      const updated = useSessionStore.getState().clinicianRatings.EXTRACTION;
      expect(updated.vcas).toBe(4);
      expect(updated.vfas).toBe(4);
      expect(updated.fbrs).toBe(1);
      expect(updated.blinded).toBe(true);
      expect(updated.timestamp).toBeGreaterThan(0);
    });
  });
});

