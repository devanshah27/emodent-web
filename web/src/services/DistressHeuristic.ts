import { BlendshapeCategory } from '../types';

export interface DistressResult {
  score: number; // 0.0 to 1.0
  percentage: number; // 0 to 100
  components: {
    browDown: number;
    eyeSquint: number;
    mouthFrown: number;
    jawOpen: number;
  };
}

/**
 * Calculates the experimental blendshape-derived distress score.
 *
 * UNVALIDATED HEURISTIC NOTICE:
 * This heuristic combines action units associated with distress:
 * - Brow lowering (AU4: browDownLeft, browDownRight)
 * - Eye squinting (AU7: eyeSquintLeft, eyeSquintRight)
 * - Mouth corner depression / frowning (AU15: mouthFrownLeft, mouthFrownRight)
 * - Jaw opening (AU26/27: jawOpen - vocalization / crying / gasp)
 *
 * THIS IS NOT A VALIDATED PAIN SCALE OR DIAGNOSTIC METRIC.
 */
export function calculateDistressHeuristic(
  categories: BlendshapeCategory[] | Record<string, number> | null | undefined
): DistressResult {
  if (!categories) {
    return {
      score: 0.0,
      percentage: 0,
      components: { browDown: 0, eyeSquint: 0, mouthFrown: 0, jawOpen: 0 },
    };
  }

  // Normalize input into key-value map
  const map: Record<string, number> = {};
  if (Array.isArray(categories)) {
    for (let i = 0; i < categories.length; i++) {
      map[categories[i].categoryName] = categories[i].score;
    }
  } else {
    Object.assign(map, categories);
  }

  const browDownLeft = map['browDownLeft'] || 0;
  const browDownRight = map['browDownRight'] || 0;
  const browDown = (browDownLeft + browDownRight) / 2;

  const eyeSquintLeft = map['eyeSquintLeft'] || 0;
  const eyeSquintRight = map['eyeSquintRight'] || 0;
  const eyeSquint = (eyeSquintLeft + eyeSquintRight) / 2;

  const mouthFrownLeft = map['mouthFrownLeft'] || 0;
  const mouthFrownRight = map['mouthFrownRight'] || 0;
  const mouthFrown = (mouthFrownLeft + mouthFrownRight) / 2;

  const jawOpen = map['jawOpen'] || 0;

  // Composite unweighted average of the 4 distress indicators
  // Clamp to [0.0, 1.0]
  const rawScore = 0.35 * browDown + 0.25 * eyeSquint + 0.25 * mouthFrown + 0.15 * jawOpen;
  const score = Math.max(0.0, Math.min(1.0, rawScore));

  return {
    score,
    percentage: Math.round(score * 100),
    components: {
      browDown: Math.round(browDown * 100) / 100,
      eyeSquint: Math.round(eyeSquint * 100) / 100,
      mouthFrown: Math.round(mouthFrown * 100) / 100,
      jawOpen: Math.round(jawOpen * 100) / 100,
    },
  };
}

