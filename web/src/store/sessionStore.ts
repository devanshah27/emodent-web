import { create } from 'zustand';
import {
  ProceduralPhase,
  FrameResult,
  SessionMetadata,
  ClinicianRating,
  validateClinicianRating,
  DEFAULT_SELECTED_PHASES,
} from '../types';
import { sessionLogger } from '../services/SessionLogger';

interface SessionState {
  // Phase state machine & planned procedures
  selectedPhases: ProceduralPhase[];
  setSelectedPhases: (phases: ProceduralPhase[]) => void;
  activePhase: ProceduralPhase;
  setPhase: (phase: ProceduralPhase) => void;

  // Consent & Participant
  consentGiven: boolean;
  participantId: string;
  parentConsent: boolean;
  childAssent: boolean;
  onDeviceConfirmed: boolean;
  startTime: number;
  setConsent: (
    participantId: string,
    parentConsent: boolean,
    childAssent: boolean,
    onDeviceConfirmed: boolean,
    plannedPhases?: ProceduralPhase[]
  ) => void;

  // Configuration thresholds
  confidenceThreshold: number;
  setConfidenceThreshold: (val: number) => void;
  smoothingWindow: number;
  setSmoothingWindow: (val: number) => void;

  // UI display options
  showFaceMesh: boolean;
  toggleFaceMesh: () => void;

  // Dev video mode
  devVideoMode: boolean;
  setDevVideoMode: (enabled: boolean) => void;
  devVideoUrl: string | null;
  setDevVideoUrl: (url: string | null) => void;

  // Camera Stream
  activeStream: MediaStream | null;
  setActiveStream: (stream: MediaStream | null) => void;

  // Real-time telemetry
  currentFrame: FrameResult | null;
  setCurrentFrame: (frame: FrameResult | null) => void;
  fps: number;
  workerLatency: number;
  droppedFrames: number;
  updateTelemetry: (fps: number, latency: number, dropped: number) => void;

  // Recording
  isRecording: boolean;
  setIsRecording: (rec: boolean) => void;

  // Session summary modal
  isSummaryOpen: boolean;
  setIsSummaryOpen: (open: boolean) => void;

  // Clinician rating & Blinded mode (Section 11)
  raterId: string;
  setRaterId: (id: string) => void;
  isBlindedMode: boolean;
  setIsBlindedMode: (blinded: boolean) => void;
  isClinicianModalOpen: boolean;
  setIsClinicianModalOpen: (open: boolean) => void;
  clinicianRatings: Record<ProceduralPhase, ClinicianRating>;
  setClinicianRating: (phase: ProceduralPhase, rating: Partial<ClinicianRating>) => void;
  getClinicianRatingsArray: () => ClinicianRating[];

  // Memory management
  deleteSessionData: () => void;

  // Metadata getter
  getMetadata: () => SessionMetadata;
}

const ALL_POSSIBLE_PHASES: ProceduralPhase[] = [
  'PRE_TREATMENT',
  'PULPECTOMY',
  'CROWN_PREP',
  'CARIES_EXCAVATION',
  'EXTRACTION',
  'LOCAL_ANESTHESIA',
  'POST_TREATMENT',
];

const createInitialRatings = (pId: string, raterId: string): Record<ProceduralPhase, ClinicianRating> => {
  const result: any = {};
  for (const p of ALL_POSSIBLE_PHASES) {
    result[p] = {
      participant_id: pId,
      phase: p,
      rater_id: raterId,
      blinded: false,
      vcas: null,
      vfas: null,
      fbrs: null,
      timestamp: 0,
    };
  }
  return result as Record<ProceduralPhase, ClinicianRating>;
};

export const useSessionStore = create<SessionState>((set, get) => {
  const initialId = 'P-' + Math.floor(1000 + Math.random() * 9000);
  const initialRater = 'rater1';

  return {
    selectedPhases: DEFAULT_SELECTED_PHASES,
    setSelectedPhases: (phases) => {
      const valid = phases.slice(0, 4);
      if (valid.length === 0) return;
      const current = get().activePhase;
      set({
        selectedPhases: valid,
        activePhase: valid.includes(current) ? current : valid[0],
      });
    },

    activePhase: 'PRE_TREATMENT',
    setPhase: (phase) => {
      set({ activePhase: phase });
    },

    consentGiven: false,
    participantId: initialId,
    parentConsent: false,
    childAssent: false,
    onDeviceConfirmed: false,
    startTime: Date.now(),

    setConsent: (participantId, parentConsent, childAssent, onDeviceConfirmed, plannedPhases) => {
      const pId = participantId.trim() || initialId;
      const phases = plannedPhases && plannedPhases.length > 0 ? plannedPhases.slice(0, 4) : get().selectedPhases;
      set((state) => ({
        consentGiven: true,
        participantId: pId,
        parentConsent,
        childAssent,
        onDeviceConfirmed,
        startTime: Date.now(),
        selectedPhases: phases,
        activePhase: phases[0],
        clinicianRatings: createInitialRatings(pId, state.raterId),
      }));
    },

    confidenceThreshold: 0.90,
    setConfidenceThreshold: (val) => set({ confidenceThreshold: Math.max(0.1, Math.min(1.0, val)) }),

    smoothingWindow: 15,
    setSmoothingWindow: (val) => set({ smoothingWindow: Math.max(1, Math.min(60, val)) }),

    showFaceMesh: false,
    toggleFaceMesh: () => set((state) => ({ showFaceMesh: !state.showFaceMesh })),

    devVideoMode: false,
    setDevVideoMode: (enabled) => set({ devVideoMode: enabled }),
    devVideoUrl: null,
    setDevVideoUrl: (url) => set({ devVideoUrl: url }),

    activeStream: null,
    setActiveStream: (stream) => set({ activeStream: stream }),

    currentFrame: null,
    setCurrentFrame: (frame) => set({ currentFrame: frame }),
    fps: 0,
    workerLatency: 0,
    droppedFrames: 0,
    updateTelemetry: (fps, latency, dropped) =>
      set({ fps, workerLatency: latency, droppedFrames: dropped }),

    isRecording: false,
    setIsRecording: (rec) => set({ isRecording: rec }),

    isSummaryOpen: false,
    setIsSummaryOpen: (open) => set({ isSummaryOpen: open }),

    // Clinician Ratings
    raterId: initialRater,
    setRaterId: (id) => set({ raterId: id.trim() || 'rater1' }),
    isBlindedMode: false,
    setIsBlindedMode: (blinded) => set({ isBlindedMode: blinded }),
    isClinicianModalOpen: false,
    setIsClinicianModalOpen: (open) => set({ isClinicianModalOpen: open }),
    clinicianRatings: createInitialRatings(initialId, initialRater),

    setClinicianRating: (phase, updates) => {
      const s = get();
      const current = s.clinicianRatings[phase];
      const merged = { ...current, ...updates, timestamp: Date.now() };

      const validation = validateClinicianRating(merged);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      set({
        clinicianRatings: {
          ...s.clinicianRatings,
          [phase]: merged,
        },
      });
    },

    getClinicianRatingsArray: () => {
      const s = get();
      return s.selectedPhases.map((p) => s.clinicianRatings[p] || {
        participant_id: s.participantId,
        phase: p,
        rater_id: s.raterId,
        blinded: s.isBlindedMode,
        vcas: null,
        vfas: null,
        fbrs: null,
        timestamp: 0,
      });
    },

    deleteSessionData: () => {
      sessionLogger.clear();
      const pId = get().participantId;
      const rId = get().raterId;
      const initialPhases = get().selectedPhases;
      set({
        currentFrame: null,
        activePhase: initialPhases[0] || 'PRE_TREATMENT',
        startTime: Date.now(),
        droppedFrames: 0,
        clinicianRatings: createInitialRatings(pId, rId),
      });
    },

    getMetadata: () => {
      const s = get();
      return {
        participantId: s.participantId,
        parentConsent: s.parentConsent,
        childAssent: s.childAssent,
        onDeviceConfirmed: s.onDeviceConfirmed,
        startTime: s.startTime,
        endTime: Date.now(),
        confidenceThreshold: s.confidenceThreshold,
        smoothingWindow: s.smoothingWindow,
      };
    },
  };
});
