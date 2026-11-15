import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from '../store/sessionStore';
import { sessionLogger } from '../services/SessionLogger';

describe('SessionStore State Machine & Telemetry Tests', () => {
  beforeEach(() => {
    useSessionStore.getState().deleteSessionData();
  });

  it('initializes with default phase PRE_TREATMENT and default thresholds', () => {
    const state = useSessionStore.getState();
    expect(state.activePhase).toBe('PRE_TREATMENT');
    expect(state.confidenceThreshold).toBe(0.90);
    expect(state.smoothingWindow).toBe(15);
    expect(state.showFaceMesh).toBe(false);
  });

  it('updates procedural phases sequentially and on demand', () => {
    const store = useSessionStore.getState();
    store.setPhase('LOCAL_ANESTHESIA');
    expect(useSessionStore.getState().activePhase).toBe('LOCAL_ANESTHESIA');

    store.setPhase('EXTRACTION');
    expect(useSessionStore.getState().activePhase).toBe('EXTRACTION');

    store.setPhase('POST_TREATMENT');
    expect(useSessionStore.getState().activePhase).toBe('POST_TREATMENT');
  });

  it('stores consent metadata accurately', () => {
    const store = useSessionStore.getState();
    store.setConsent('CHILD-007', true, true, true);

    const meta = useSessionStore.getState().getMetadata();
    expect(meta.participantId).toBe('CHILD-007');
    expect(meta.parentConsent).toBe(true);
    expect(meta.childAssent).toBe(true);
    expect(meta.onDeviceConfirmed).toBe(true);
  });

  it('clears in-memory data on deleteSessionData', () => {
    sessionLogger.logFrame({
      timestamp_ms: 1000,
      participant_id: 'CHILD-007',
      phase: 'PRE_TREATMENT',
      rawEmotion: 'happy',
      smoothedEmotion: 'happy',
      confidence: 0.95,
      qualityFlag: 'VALID',
      probabilities: [0.01, 0.95, 0.02, 0.02],
      blendshapeDistressScore: 0.1,
      isNegativeAffect: false,
    });
    expect(sessionLogger.getRecordCount()).toBe(1);

    useSessionStore.getState().deleteSessionData();
    expect(sessionLogger.getRecordCount()).toBe(0);
    expect(useSessionStore.getState().activePhase).toBe('PRE_TREATMENT');
  });

  it('allows doctor to select up to 4 procedural phases from the 6 options (A through F)', () => {
    const store = useSessionStore.getState();
    // Dentist selects Pulpectomy, Crown Prep, and Caries Excavation (3 phases)
    store.setSelectedPhases(['PRE_TREATMENT', 'PULPECTOMY', 'CROWN_PREP', 'CARIES_EXCAVATION']);
    expect(useSessionStore.getState().selectedPhases).toEqual([
      'PRE_TREATMENT',
      'PULPECTOMY',
      'CROWN_PREP',
      'CARIES_EXCAVATION',
    ]);

    // Enforces maximum of 4 procedures if more are passed
    store.setSelectedPhases([
      'PRE_TREATMENT',
      'PULPECTOMY',
      'CROWN_PREP',
      'CARIES_EXCAVATION',
      'EXTRACTION',
      'LOCAL_ANESTHESIA',
    ]);
    expect(useSessionStore.getState().selectedPhases.length).toBe(4);
  });

  it('sets planned procedures upon confirming consent', () => {
    const store = useSessionStore.getState();
    store.setConsent('CHILD-888', true, true, true, [
      'PRE_TREATMENT',
      'LOCAL_ANESTHESIA',
      'EXTRACTION',
    ]);

    const state = useSessionStore.getState();
    expect(state.participantId).toBe('CHILD-888');
    expect(state.selectedPhases).toEqual(['PRE_TREATMENT', 'LOCAL_ANESTHESIA', 'EXTRACTION']);
    expect(state.activePhase).toBe('PRE_TREATMENT');
  });
});

