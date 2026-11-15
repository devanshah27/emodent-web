import { EmotionClass, EMOTION_CLASSES } from '../types';

export interface LandmarkPoint {
  x: number;
  y: number;
  z?: number;
}

export interface RuleEvaluationInput {
  blendshapesMap: Record<string, number>;
  landmarks?: LandmarkPoint[];
  cnnProbs: number[]; // [angry, fear, happy, neutral, sad]
  confidenceThreshold?: number;
}

export interface RuleEvaluationResult {
  rawEmotion: EmotionClass;
  topConfidence: number;
  probabilities: number[];
  cues: {
    isMouthOpenOrWide: boolean;
    isShowingTeeth: boolean;
    isEyesWideOrBig: boolean;
    isEyesCompletelyClosed: boolean;
    happyEvidence: number;
    sadEvidence: number;
    angryEvidence: number;
    fearEvidence: number;
    neutralEvidence: number;
  };
}

/**
 * ClinicalEmotionRules:
 * High-accuracy multi-modal emotion recognition tailored for dental operatory settings:
 * - FEAR: In BOTH conditions (mouth wide open OR teeth showing), or regardless of lip shape:
 *         * Eyes wide open / big eyes -> immediately FEAR.
 *         * Eyes completely closed / squeezed tight -> immediately FEAR.
 * - HAPPY: Cheeks raised (AU6), smile corners pulled (AU12), relaxed brows, calm eyes.
 *          Accurately recognized with mouth wide open (laugh) and teeth showing (grin).
 * - SAD: Inner-brow triangle lift (AU1), downturned lip corners (AU15), chin pucker (AU17),
 *        drooping gaze. Accurately recognized with mouth open (wail) or teeth showing (whimper).
 * - ANGRY: Lowered/furrowed brows (AU4), hard eye glare/squint (AU7), jaw tension.
 *          Accurately recognized with mouth open (shout) or teeth showing (snarl).
 * - NEUTRAL: Procedural open mouth ("say ahhh", bite prop) or teeth showing at rest (retractor)
 *            with calm resting eyes (not wide, not closed) and relaxed brows.
 */
export class ClinicalEmotionRules {
  public static evaluate(input: RuleEvaluationInput): RuleEvaluationResult {
    const { blendshapesMap, landmarks, cnnProbs } = input;

    // --- 1. Brow Cues ---
    const browDownLeft = blendshapesMap['browDownLeft'] || 0;
    const browDownRight = blendshapesMap['browDownRight'] || 0;
    const browDown = Math.max(browDownLeft, browDownRight); // AU4 (Angry anchor: brows pulled down)
    const browInnerUp = blendshapesMap['browInnerUp'] || 0; // AU1 (Sad / Fear anchor: inner brows lifted)

    const browOuterUpLeft = blendshapesMap['browOuterUpLeft'] || 0;
    const browOuterUpRight = blendshapesMap['browOuterUpRight'] || 0;
    const browOuterUp = Math.max(browOuterUpLeft, browOuterUpRight); // AU2 (Fear: outer brow raise)

    // --- 2. Eye Cues ---
    const eyeSquintLeft = blendshapesMap['eyeSquintLeft'] || 0;
    const eyeSquintRight = blendshapesMap['eyeSquintRight'] || 0;
    const eyeSquint = Math.max(eyeSquintLeft, eyeSquintRight); // AU7 (Lid tightening - Angry)

    const eyeWideLeft = blendshapesMap['eyeWideLeft'] || 0;
    const eyeWideRight = blendshapesMap['eyeWideRight'] || 0;
    const eyeWide = Math.max(eyeWideLeft, eyeWideRight); // AU5 (Eyes open wide / big eyes)

    const eyeBlinkLeft = blendshapesMap['eyeBlinkLeft'] || 0;
    const eyeBlinkRight = blendshapesMap['eyeBlinkRight'] || 0;
    const eyeBlink = (eyeBlinkLeft + eyeBlinkRight) / 2; // Eyelid closure / squeeze

    const eyeLookDown = Math.max(
      blendshapesMap['eyeLookDownLeft'] || 0,
      blendshapesMap['eyeLookDownRight'] || 0
    ); // Drooping eyelids / downward sad gaze

    // --- 3. Geometric Eye Aspect Ratio (EAR) for Big/Wide Eyes & Closed Eyes ---
    let ear = 0;
    if (landmarks && landmarks.length > 386) {
      const lTop = landmarks[159];
      const lBot = landmarks[145];
      const lLeft = landmarks[33];
      const lRight = landmarks[133];

      const rTop = landmarks[386];
      const rBot = landmarks[374];
      const rLeft = landmarks[362];
      const rRight = landmarks[263];

      if (lTop && lBot && lLeft && lRight && rTop && rBot && rLeft && rRight) {
        const lH = Math.hypot(lTop.x - lBot.x, lTop.y - lBot.y);
        const lW = Math.hypot(lLeft.x - lRight.x, lLeft.y - lRight.y);
        const rH = Math.hypot(rTop.x - rBot.x, rTop.y - rBot.y);
        const rW = Math.hypot(rLeft.x - rRight.x, rLeft.y - rRight.y);
        if (lW > 0.001 && rW > 0.001) {
          ear = (lH / lW + rH / rW) / 2;
        }
      }
    }

    // MANDATE 1: Eyes wide open / big eyes in both conditions (mouth open, teeth showing) = FEAR
    const isEyesWideOrBig =
      eyeWide > 0.11 ||
      (ear > 0.28 && eyeWide > 0.05) ||
      (eyeWide > 0.08 && (browInnerUp > 0.10 || browOuterUp > 0.10));

    // MANDATE 2: Eyes completely closed in both conditions (mouth open, teeth showing) = FEAR
    // (Pediatric dental reflex: child tightly squeezing eyes shut in fear/terror/pain)
    const isEyesCompletelyClosed =
      (eyeBlinkLeft > 0.55 && eyeBlinkRight > 0.55) ||
      (ear > 0 && ear < 0.11) ||
      (eyeBlink > 0.45 && eyeSquint > 0.20);

    const isFearEyes = isEyesWideOrBig || isEyesCompletelyClosed;

    // --- 4. Cheek & Mouth Cues ---
    const cheekSquint =
      ((blendshapesMap['cheekSquintLeft'] || 0) + (blendshapesMap['cheekSquintRight'] || 0)) / 2;

    const smileLeft = blendshapesMap['mouthSmileLeft'] || 0;
    const smileRight = blendshapesMap['mouthSmileRight'] || 0;
    const smile = (smileLeft + smileRight) / 2; // AU12 (Smile)

    const mouthFrownLeft = blendshapesMap['mouthFrownLeft'] || 0;
    const mouthFrownRight = blendshapesMap['mouthFrownRight'] || 0;
    const mouthFrown = Math.max(mouthFrownLeft, mouthFrownRight); // AU15 (Lip-corner depress)

    const mouthStretchLeft = blendshapesMap['mouthStretchLeft'] || 0;
    const mouthStretchRight = blendshapesMap['mouthStretchRight'] || 0;
    const mouthStretch = Math.max(mouthStretchLeft, mouthStretchRight); // AU20 (Horizontal lip stretch)

    const mouthShrugLower = blendshapesMap['mouthShrugLower'] || 0; // AU17 (Chin raise/bunch)
    const mouthPucker = blendshapesMap['mouthPucker'] || 0; // AU18 (Lip pucker/pout)
    const mouthRollLower = blendshapesMap['mouthRollLower'] || 0;

    const chinPucker = Math.max(mouthPucker, mouthShrugLower * 0.85, mouthRollLower);

    const mouthLowerDown = Math.max(
      blendshapesMap['mouthLowerDownLeft'] || 0,
      blendshapesMap['mouthLowerDownRight'] || 0
    ); // AU16

    const mouthPress = Math.max(
      blendshapesMap['mouthPressLeft'] || 0,
      blendshapesMap['mouthPressRight'] || 0
    ); // AU24 (Pressed lips - Angry)

    const upperLipUp = Math.max(
      blendshapesMap['mouthUpperUpLeft'] || 0,
      blendshapesMap['mouthUpperUpRight'] || 0
    ); // AU10 (Upper lip raise / bared teeth)

    const jawOpen = blendshapesMap['jawOpen'] || 0; // AU26

    // --- 5. Geometric Mouth Aspect Ratio (MAR) & Corner Drop ---
    let mar = 0;
    let mouthCornerDrop = 0; // positive when mouth corners sit below lip center (frown)
    if (landmarks && landmarks.length > 291) {
      const p13 = landmarks[13];
      const p14 = landmarks[14];
      const p61 = landmarks[61];
      const p291 = landmarks[291];
      if (p13 && p14 && p61 && p291) {
        const h = Math.hypot(p13.x - p14.x, p13.y - p14.y);
        const w = Math.hypot(p61.x - p291.x, p61.y - p291.y);
        if (w > 0.001) {
          mar = h / w;
          const centerY = (p13.y + p14.y) / 2;
          const cornerY = (p61.y + p291.y) / 2;
          mouthCornerDrop = (cornerY - centerY) / w;
        }
      }
    }

    const effectiveFrown = Math.max(
      mouthFrown,
      mouthCornerDrop > 0.045 ? (mouthCornerDrop - 0.02) * 2.5 : 0
    );

    // Procedural mouth open / wide open (patient opening wide for dentist, "say ahhh", bite prop)
    const isMouthOpenOrWide = jawOpen > 0.07 || mar > 0.14;

    // Teeth showing (retractor, bite prop, mirror exposing teeth, or upper/lower lip pull)
    const isShowingTeeth = upperLipUp > 0.08 || mouthLowerDown > 0.08;

    // -----------------------------------------------------------------
    // DISAMBIGUATION ANCHORS (when eyes are normal/not fear eyes)
    // -----------------------------------------------------------------
    const isAngryBrowDominant =
      !isFearEyes &&
      browDown > 0.10 &&
      browInnerUp < 0.08 &&
      browDown > browInnerUp * 1.8 &&
      (mouthPress > 0.06 || eyeSquint > 0.06 || upperLipUp > 0.06 || browDown > effectiveFrown * 0.9);

    const hasSadSecondaryCue =
      browInnerUp > 0.05 ||
      mouthShrugLower > 0.07 ||
      mouthPucker > 0.08 ||
      mouthRollLower > 0.08 ||
      eyeLookDown > 0.12;

    const isGenuineSad =
      !isFearEyes &&
      !isAngryBrowDominant &&
      smile < 0.09 &&
      ((effectiveFrown > 0.08 && hasSadSecondaryCue) ||
        effectiveFrown > 0.17 ||
        (browInnerUp > 0.08 && (mouthPucker > 0.08 || mouthShrugLower > 0.08 || effectiveFrown > 0.05)) ||
        (mouthPucker > 0.16 && mouthShrugLower > 0.12 && browDown < 0.10));

    // -----------------------------------------------------------------
    // CUE EVIDENCE SCORING
    // -----------------------------------------------------------------
    // FEAR: High evidence whenever eyes are wide open OR completely closed
    let fearEvidence = 0.0;
    if (isFearEyes) {
      fearEvidence = Math.min(
        1.0,
        Math.max(
          0.94,
          eyeWide * 3.2 +
            eyeBlink * 1.6 +
            Math.max(browInnerUp, browOuterUp) * 1.5 +
            mouthStretch * 1.5
        )
      );
    }

    // HAPPY: Smile corners pulled up with cheek squint & relaxed brows (when eyes are not fear eyes)
    let happyEvidence = 0.0;
    if (!isFearEyes && (smile > 0.10 || (smile > 0.08 && cheekSquint > 0.10)) && browDown <= 0.08) {
      happyEvidence = Math.min(1.0, smile * 2.8 + cheekSquint * 1.6);
    }

    // SAD: Only scores when genuinely sad and eyes are not fear eyes
    let sadEvidence = 0.0;
    if (isGenuineSad) {
      sadEvidence = Math.min(
        1.0,
        effectiveFrown * 2.8 + chinPucker * 2.2 + browInnerUp * 1.8 + eyeLookDown * 0.6
      );
    }

    // ANGRY: Lowered brows + hard stare or pressed lips (when eyes are not fear eyes)
    let angryEvidence = 0.0;
    const isSadOverridingBrow =
      isGenuineSad && (browInnerUp >= 0.08 || effectiveFrown > browDown * 1.35);
    if (!isFearEyes && browDown > 0.08 && !isSadOverridingBrow) {
      angryEvidence = Math.min(
        1.0,
        browDown * 3.2 + eyeSquint * 1.4 + mouthPress * 1.6 + (upperLipUp > 0.08 && smile < 0.08 ? upperLipUp * 1.2 : 0)
      );
    }

    // NEUTRAL: Baseline calm face or procedural open mouth / teeth showing with calm eyes
    let neutralEvidence = 0.0;
    if (
      !isFearEyes &&
      (isMouthOpenOrWide || isShowingTeeth) &&
      happyEvidence < 0.35 &&
      sadEvidence < 0.35 &&
      angryEvidence < 0.35
    ) {
      neutralEvidence = 0.96;
    } else if (!isFearEyes) {
      const maxActive = Math.max(happyEvidence, sadEvidence, angryEvidence);
      neutralEvidence = Math.max(0.0, 1.0 - maxActive * 1.5);
    }

    // -----------------------------------------------------------------
    // DIRECT DECISION & MULTI-MODAL FUSION (5 classes: angry, fear, happy, neutral, sad)
    // -----------------------------------------------------------------
    // Indices: 0: angry, 1: fear, 2: happy, 3: neutral, 4: sad
    let rawEmotion: EmotionClass = 'neutral';
    let topConfidence = 0.96;
    let probabilities = [0.01, 0.01, 0.01, 0.95, 0.02];

    if (isFearEyes) {
      // 1. MANDATE: In BOTH conditions (mouth wide open, teeth showing), or regardless of lip shape:
      //    Eyes wide open OR eyes completely closed -> immediately MARK AS FEAR!
      rawEmotion = 'fear';
      topConfidence = Math.max(
        0.95,
        Math.min(0.99, Math.max(fearEvidence, eyeWide * 2.8, eyeBlink * 1.2, 0.95))
      );
      probabilities = [0.01, topConfidence, 0.01, 0.01, 0.01];
    } else if (smile > 0.12 && browDown <= 0.08) {
      // 2. Clear smile / laugh (even with mouth wide open or teeth showing) -> HAPPY
      rawEmotion = 'happy';
      topConfidence = Math.max(0.94, Math.min(0.99, smile * 2.5 + cheekSquint * 0.8));
      probabilities = [0.01, 0.01, topConfidence, 0.02, 0.01];
    } else if (isAngryBrowDominant && angryEvidence >= 0.36 && smile < 0.08) {
      // 3. Clear furrowed brow / scowl (even with mouth wide open or teeth showing) -> ANGRY
      rawEmotion = 'angry';
      topConfidence = Math.max(0.92, Math.min(0.99, angryEvidence));
      probabilities = [topConfidence, 0.01, 0.01, 0.02, 0.01];
    } else if (isGenuineSad && sadEvidence >= 0.34 && smile < 0.08) {
      // 4. Clear frown / inner-brow triangle / pout (even with mouth wide open or teeth showing) -> SAD
      rawEmotion = 'sad';
      topConfidence = Math.max(0.92, Math.min(0.99, sadEvidence));
      probabilities = [0.01, 0.01, 0.01, 0.02, topConfidence];
    } else if (
      (isMouthOpenOrWide || isShowingTeeth) &&
      happyEvidence < 0.35 &&
      fearEvidence < 0.35 &&
      sadEvidence < 0.35 &&
      angryEvidence < 0.35
    ) {
      // 5. Procedural dental open mouth ("say ahhh") or teeth showing at rest with calm eyes -> NEUTRAL
      rawEmotion = 'neutral';
      topConfidence = 0.96;
      probabilities = [0.01, 0.01, 0.01, 0.95, 0.02];
    } else if (
      happyEvidence < 0.20 &&
      fearEvidence < 0.20 &&
      sadEvidence < 0.20 &&
      angryEvidence < 0.20
    ) {
      // 6. Completely calm resting face -> NEUTRAL
      rawEmotion = 'neutral';
      topConfidence = 0.95;
      probabilities = [0.01, 0.01, 0.01, 0.95, 0.02];
    } else {
      // 7. Multi-modal fusion between 5-class CNN and facial cues: [angry, fear, happy, neutral, sad]
      const isValid5Class = cnnProbs.length === 5;
      const cnnAngry = isValid5Class ? cnnProbs[0] : (cnnProbs[0] || 0.1);
      const cnnFear = isValid5Class ? cnnProbs[1] : 0.05;
      const cnnHappy = isValid5Class ? cnnProbs[2] : (cnnProbs[1] || 0.1);
      const cnnNeutral = isValid5Class ? cnnProbs[3] : (cnnProbs[2] || 0.6);
      const cnnSad = isValid5Class ? cnnProbs[4] : (cnnProbs[3] || 0.1);

      const fused = [
        cnnAngry * 0.40 + angryEvidence * 0.60,
        cnnFear * 0.40 + fearEvidence * 0.60,
        cnnHappy * 0.40 + happyEvidence * 0.60,
        cnnNeutral * 0.40 + neutralEvidence * 0.60,
        cnnSad * 0.40 + sadEvidence * 0.60,
      ];

      const expScores = fused.map((s) => Math.exp(s * 4.0));
      const sumExp = expScores.reduce((a, b) => a + b, 0);
      probabilities = expScores.map((s) => s / sumExp);

      let maxProb = -1;
      let maxIdx = 3; // default to neutral (index 3)
      for (let i = 0; i < probabilities.length; i++) {
        if (probabilities[i] > maxProb) {
          maxProb = probabilities[i];
          maxIdx = i;
        }
      }

      topConfidence = maxProb;
      rawEmotion = EMOTION_CLASSES[maxIdx];

      if (maxIdx === 3 && neutralEvidence > 0.80) {
        topConfidence = Math.max(0.92, topConfidence);
      } else if (topConfidence < 0.35) {
        rawEmotion = 'neutral';
      }
    }

    return {
      rawEmotion,
      topConfidence,
      probabilities,
      cues: {
        isMouthOpenOrWide,
        isShowingTeeth,
        isEyesWideOrBig,
        isEyesCompletelyClosed,
        happyEvidence,
        sadEvidence,
        angryEvidence,
        fearEvidence,
        neutralEvidence,
      },
    };
  }
}
