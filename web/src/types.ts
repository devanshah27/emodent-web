export type ProceduralPhase =
  | 'PRE_TREATMENT'
  | 'PULPECTOMY'
  | 'CROWN_PREP'
  | 'CARIES_EXCAVATION'
  | 'EXTRACTION'
  | 'LOCAL_ANESTHESIA'
  | 'POST_TREATMENT';

export interface ProcedureDefinition {
  id: ProceduralPhase;
  letter: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  title: string;
  description: string;
  activeColor: string;
}

export const ALL_PROCEDURES: ProcedureDefinition[] = [
  {
    id: 'PRE_TREATMENT',
    letter: 'A',
    title: 'Pre-Treatment',
    description: 'Baseline acclimation & seating',
    activeColor: 'bg-emerald-600 border-emerald-400 text-white shadow-emerald-500/25',
  },
  {
    id: 'PULPECTOMY',
    letter: 'B',
    title: 'Pulpectomy',
    description: 'Pulp extirpation & canal access',
    activeColor: 'bg-purple-600 border-purple-400 text-white shadow-purple-500/25',
  },
  {
    id: 'CROWN_PREP',
    letter: 'C',
    title: 'Crown Prep',
    description: 'Occlusal & circumferential reduction',
    activeColor: 'bg-sky-600 border-sky-400 text-white shadow-sky-500/25',
  },
  {
    id: 'CARIES_EXCAVATION',
    letter: 'D',
    title: 'Caries Excavation',
    description: 'Rotary or hand excavation of carious tissue',
    activeColor: 'bg-amber-600 border-amber-400 text-white shadow-amber-500/25',
  },
  {
    id: 'EXTRACTION',
    letter: 'E',
    title: 'Extraction',
    description: 'Luxation, elevation & tooth removal',
    activeColor: 'bg-rose-600 border-rose-400 text-white shadow-rose-500/25',
  },
  {
    id: 'LOCAL_ANESTHESIA',
    letter: 'F',
    title: 'Local Anesthesia',
    description: 'Topical application & local injection/block',
    activeColor: 'bg-teal-600 border-teal-400 text-white shadow-teal-500/25',
  },
];

export const DEFAULT_SELECTED_PHASES: ProceduralPhase[] = [
  'PRE_TREATMENT',
  'LOCAL_ANESTHESIA',
  'CARIES_EXCAVATION',
  'EXTRACTION',
];

export type EmotionClass = 'angry' | 'fear' | 'happy' | 'neutral' | 'sad';

export const EMOTION_CLASSES: EmotionClass[] = ['angry', 'fear', 'happy', 'neutral', 'sad'];

export const EMOTION_EMOJIS: Record<EmotionClass | 'UNCERTAIN' | 'NO_RESULT', string> = {
  happy: '😊',
  fear: '😨',
  neutral: '😐',
  sad: '😢',
  angry: '😠',
  UNCERTAIN: '❓',
  NO_RESULT: '⚠️',
};

export type QualityFlag =
  | 'VALID'
  | 'NO_FACE'
  | 'FACE_TOO_SMALL'
  | 'LOW_CONFIDENCE'
  | 'EXCESSIVE_MOTION';

export interface BoundingBox {
  xMin: number;
  yMin: number;
  width: number;
  height: number;
}

export interface QualityGateInput {
  landmarks: Array<{ x: number; y: number; z?: number; visibility?: number }> | null | undefined;
  detectionScore?: number;
  videoWidth: number;
  videoHeight: number;
  prevCenter?: { x: number; y: number } | null;
  minBoxSizePx?: number;
  minConfidence?: number;
  maxMotionDisplacement?: number;
}

export interface QualityGateResult {
  passed: boolean;
  qualityFlag: QualityFlag;
  boundingBox?: BoundingBox;
  center?: { x: number; y: number };
}

export interface BlendshapeCategory {
  categoryName: string;
  score: number;
}

export interface InferenceOutput {
  probabilities: number[]; // [angry, fear, happy, neutral, sad]
  topClass: EmotionClass;
  topConfidence: number;
}

export interface FrameResult {
  timestamp_ms: number;
  participant_id: string;
  phase: ProceduralPhase;
  rawEmotion: EmotionClass | 'UNCERTAIN' | 'NO_RESULT';
  smoothedEmotion: EmotionClass | 'UNCERTAIN' | 'NO_RESULT';
  confidence: number;
  qualityFlag: QualityFlag;
  probabilities: number[];
  blendshapeDistressScore: number;
  isNegativeAffect: boolean;
  blendshapes?: Record<string, number>;
  ai_estimated_behavior?: 'Likely Positive' | 'Likely Negative';
}

export interface SessionMetadata {
  participantId: string;
  parentConsent: boolean;
  childAssent: boolean;
  onDeviceConfirmed: boolean;
  startTime: number;
  endTime?: number;
  confidenceThreshold: number;
  smoothingWindow: number;
}

// -------------------------------------------------------------------------
// Section 11: Frankl Behavior Rating Scale (FBRS) & Clinician Scales
// -------------------------------------------------------------------------

export type FranklScore = 1 | 2 | 3 | 4;

export const FRANKL_NEGATIVE_THRESHOLD = 2; // FBRS <= 2 is negative behavior

export interface ScaleAnchor {
  score: number;
  label: string;
  description: string;
}

export const FRANKL_ANCHORS: ScaleAnchor[] = [
  {
    score: 1,
    label: '1 = Definitely negative (--)',
    description: 'Refusal of treatment, forceful crying, fearfulness, or any other overt evidence of extreme negativism.',
  },
  {
    score: 2,
    label: '2 = Negative (-)',
    description: 'Reluctance to accept treatment, uncooperative, some evidence of negative attitude but not pronounced (sullen, withdrawn).',
  },
  {
    score: 3,
    label: '3 = Positive (+)',
    description: 'Acceptance of treatment, at times cautious, willingness to comply with the dentist, sometimes with reservation, but follows directions cooperatively.',
  },
  {
    score: 4,
    label: '4 = Definitely positive (++)',
    description: 'Good rapport with the dentist, interested in the procedure, laughing and enjoying.',
  },
];

export const VCAS_ANCHORS: ScaleAnchor[] = [
  { score: 0, label: '0: Relaxed', description: 'Total cooperation, smiling, willing, conversing.' },
  { score: 1, label: '1: Uneasy', description: 'Whimpering, fearful posture, cautious.' },
  { score: 2, label: '2: Tense', description: 'Pronounced distress, crying quietly, protest with movement.' },
  { score: 3, label: '3: Reluctant', description: 'Loud crying, actively resisting treatment.' },
  { score: 4, label: '4: Out of Control', description: 'Screaming, thrashing, physical refusal of treatment.' },
];

export const VFAS_ANCHORS: ScaleAnchor[] = [
  { score: 0, label: 'Face 0: Calm / Happy', description: 'Broad smile or relaxed pleasant face, no anxiety.' },
  { score: 1, label: 'Face 1: Mild Unease', description: 'Slight furrowing or mouth tension, minor apprehension.' },
  { score: 2, label: 'Face 2: Moderate Distress', description: 'Pronounced mouth frown or grimace, tense eyes.' },
  { score: 3, label: 'Face 3: High Distress', description: 'Crying face, open mouth distress or weeping.' },
  { score: 4, label: 'Face 4: Extreme Panic', description: 'Wide open crying mouth, tightly closed or terror-stricken eyes.' },
];

export interface ClinicianRating {
  participant_id: string;
  phase: ProceduralPhase;
  rater_id: string;
  blinded: boolean;
  vcas: number | null; // 0-4
  vfas: number | null; // 0-4
  fbrs: FranklScore | null; // 1-4
  timestamp: number;
}

export function validateClinicianRating(rating: Partial<ClinicianRating>): { valid: boolean; error?: string } {
  if (rating.vcas !== null && rating.vcas !== undefined) {
    if (!Number.isInteger(rating.vcas) || rating.vcas < 0 || rating.vcas > 4) {
      return { valid: false, error: 'VCAS score must be an integer between 0 and 4' };
    }
  }
  if (rating.vfas !== null && rating.vfas !== undefined) {
    if (!Number.isInteger(rating.vfas) || rating.vfas < 0 || rating.vfas > 4) {
      return { valid: false, error: 'VFAS score must be an integer between 0 and 4' };
    }
  }
  if (rating.fbrs !== null && rating.fbrs !== undefined) {
    if (!Number.isInteger(rating.fbrs) || rating.fbrs < 1 || rating.fbrs > 4) {
      return { valid: false, error: 'FBRS score must be an integer between 1 and 4' };
    }
  }
  return { valid: true };
}

export function isFranklNegative(fbrs: number): boolean {
  return fbrs <= FRANKL_NEGATIVE_THRESHOLD;
}

export function reverseFrankl(fbrs: number): number {
  return 5 - fbrs;
}

export interface PhaseStats {
  phase: ProceduralPhase;
  totalFrames: number;
  validFrames: number;
  noResultFrames: number;
  uncertainFrames: number;
  emotionCounts: Record<EmotionClass, number>;
  emotionPercentages: Record<EmotionClass, number>;
  negativeAffectFrames: number;
  negativeAffectPercentage: number;
  dominantEmotion: EmotionClass | 'NONE';
  finalNegativeAffectFlag: boolean;
  vcas?: number | null;
  vfas?: number | null;
  fbrs?: FranklScore | null;
  rater_id?: string;
  blinded?: boolean;
}
