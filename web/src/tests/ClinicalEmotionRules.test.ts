import { describe, it, expect } from 'vitest';
import { ClinicalEmotionRules } from '../services/ClinicalEmotionRules';

describe('ClinicalEmotionRules: 5 Target Emotions & Disambiguation', () => {
  const dummyCNN = [0.2, 0.2, 0.2, 0.2, 0.2]; // uninformative 5-class CNN [angry, fear, happy, neutral, sad]

  describe('FEAR: Regardless of the facial expression of the lips, wide/big eyes = FEAR', () => {
    it('detects Eyes Open Wide as FEAR on resting lips', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          eyeWideLeft: 0.26,
          eyeWideRight: 0.26,
          browDownLeft: 0.01,
          browDownRight: 0.01,
          mouthSmileLeft: 0.01,
          mouthSmileRight: 0.01,
        },
        cnnProbs: dummyCNN,
      });

      expect(result.rawEmotion).toBe('fear');
      expect(result.cues.fearEvidence).toBeGreaterThan(0.70);
      expect(result.cues.isEyesWideOrBig).toBe(true);
    });

    it('marks wide/big eyes as FEAR regardless of smiling lips', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          mouthSmileLeft: 0.35, // smiling lips
          mouthSmileRight: 0.35,
          cheekSquintLeft: 0.20,
          cheekSquintRight: 0.20,
          eyeWideLeft: 0.22, // wide/big eyes
          eyeWideRight: 0.22,
          browDownLeft: 0.01,
          browDownRight: 0.01,
        },
        cnnProbs: dummyCNN,
      });

      expect(result.rawEmotion).toBe('fear');
      expect(result.cues.isEyesWideOrBig).toBe(true);
    });

    it('marks wide/big eyes as FEAR regardless of downturned/frowning lips', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          mouthFrownLeft: 0.25, // downturned lips
          mouthFrownRight: 0.25,
          mouthShrugLower: 0.18,
          eyeWideLeft: 0.20, // wide/big eyes
          eyeWideRight: 0.20,
        },
        cnnProbs: dummyCNN,
      });

      expect(result.rawEmotion).toBe('fear');
      expect(result.cues.isEyesWideOrBig).toBe(true);
    });

    it('marks wide/big eyes as FEAR regardless of open mouth lips', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          jawOpen: 0.40, // wide open mouth
          eyeWideLeft: 0.24, // wide/big eyes
          eyeWideRight: 0.24,
        },
        cnnProbs: dummyCNN,
      });

      expect(result.rawEmotion).toBe('fear');
      expect(result.cues.isEyesWideOrBig).toBe(true);
    });

    it('marks wide/big eyes as FEAR regardless of clenched/pressed lips', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          mouthPressLeft: 0.30, // pressed lips
          mouthPressRight: 0.30,
          browDownLeft: 0.16,
          browDownRight: 0.16,
          eyeWideLeft: 0.22, // wide/big eyes
          eyeWideRight: 0.22,
        },
        cnnProbs: dummyCNN,
      });

      expect(result.rawEmotion).toBe('fear');
      expect(result.cues.isEyesWideOrBig).toBe(true);
    });

    it('does NOT confuse an Angry Scowl with Fear when eyes are squinted/normal', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          browDownLeft: 0.22,
          browDownRight: 0.22,
          eyeSquintLeft: 0.16,
          eyeSquintRight: 0.16,
          eyeWideLeft: 0.02, // normal/squinted eyes
          eyeWideRight: 0.02,
          mouthPressLeft: 0.20,
          mouthPressRight: 0.20,
        },
        cnnProbs: dummyCNN,
      });

      expect(result.rawEmotion).toBe('angry');
      expect(result.cues.isEyesWideOrBig).toBe(false);
    });

    it('does NOT confuse a Sad Pout/Crying with Fear when eyes are drooping/normal', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          mouthFrownLeft: 0.22,
          mouthFrownRight: 0.22,
          browInnerUp: 0.18,
          mouthShrugLower: 0.16,
          eyeWideLeft: 0.02, // drooping/normal eyes
          eyeWideRight: 0.02,
          eyeLookDownLeft: 0.15,
          eyeLookDownRight: 0.15,
        },
        cnnProbs: dummyCNN,
      });

      expect(result.rawEmotion).toBe('sad');
      expect(result.cues.isEyesWideOrBig).toBe(false);
    });

    it('does NOT confuse Procedural Mouth Open ("ahhh") with Fear when eyes are calm/normal', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          jawOpen: 0.35,
          eyeWideLeft: 0.03, // calm normal eyes
          eyeWideRight: 0.03,
          browInnerUp: 0.02,
          browDownLeft: 0.01,
          browDownRight: 0.01,
          mouthSmileLeft: 0.01,
          mouthSmileRight: 0.01,
        },
        cnnProbs: dummyCNN,
      });

      expect(result.rawEmotion).toBe('neutral');
      expect(result.cues.isEyesWideOrBig).toBe(false);
      expect(result.topConfidence).toBe(0.96);
    });
  });

  describe('FEAR: Eyes Completely Closed / Squeezed Shut in Dental Setting', () => {
    it('marks eyes completely closed (eyeBlink > 0.55) as FEAR on resting lips', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          eyeBlinkLeft: 0.85,
          eyeBlinkRight: 0.85,
          browDownLeft: 0.01,
          browDownRight: 0.01,
          mouthSmileLeft: 0.01,
          mouthSmileRight: 0.01,
        },
        cnnProbs: dummyCNN,
      });

      expect(result.rawEmotion).toBe('fear');
      expect(result.cues.isEyesCompletelyClosed).toBe(true);
      expect(result.topConfidence).toBeGreaterThanOrEqual(0.95);
    });

    it('marks eyes completely closed as FEAR with mouth wide open (dental drill fear)', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          jawOpen: 0.42,
          eyeBlinkLeft: 0.90,
          eyeBlinkRight: 0.90,
        },
        cnnProbs: dummyCNN,
      });

      expect(result.rawEmotion).toBe('fear');
      expect(result.cues.isEyesCompletelyClosed).toBe(true);
      expect(result.cues.isMouthOpenOrWide).toBe(true);
      expect(result.topConfidence).toBeGreaterThanOrEqual(0.95);
    });

    it('marks eyes completely closed as FEAR with teeth showing (dental retractor in place)', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          mouthUpperUpLeft: 0.25,
          mouthUpperUpRight: 0.25,
          mouthLowerDownLeft: 0.20,
          mouthLowerDownRight: 0.20,
          eyeBlinkLeft: 0.88,
          eyeBlinkRight: 0.88,
        },
        cnnProbs: dummyCNN,
      });

      expect(result.rawEmotion).toBe('fear');
      expect(result.cues.isEyesCompletelyClosed).toBe(true);
      expect(result.cues.isShowingTeeth).toBe(true);
      expect(result.topConfidence).toBeGreaterThanOrEqual(0.95);
    });

    it('marks eyes completely closed as FEAR with both mouth wide open AND teeth showing', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          jawOpen: 0.38,
          mouthUpperUpLeft: 0.22,
          mouthUpperUpRight: 0.22,
          eyeBlinkLeft: 0.92,
          eyeBlinkRight: 0.92,
        },
        cnnProbs: dummyCNN,
      });

      expect(result.rawEmotion).toBe('fear');
      expect(result.cues.isEyesCompletelyClosed).toBe(true);
      expect(result.topConfidence).toBeGreaterThanOrEqual(0.95);
    });

    it('marks eyes tightly squeezed shut (eyeSquint + eyeBlink) as FEAR regardless of lips', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          eyeBlinkLeft: 0.60,
          eyeBlinkRight: 0.60,
          eyeSquintLeft: 0.35,
          eyeSquintRight: 0.35,
          mouthSmileLeft: 0.25, // even if lips are stretched
        },
        cnnProbs: dummyCNN,
      });

      expect(result.rawEmotion).toBe('fear');
      expect(result.cues.isEyesCompletelyClosed).toBe(true);
    });
  });

  describe('DENTAL OPERATORY CONDITIONS: Identifying 5 Emotions with Mouth Wide Open & Teeth Showing', () => {
    // Condition 1: Mouth Wide Open
    describe('Condition 1: Mouth Wide Open (jawOpen > 0.07 / bite prop)', () => {
      it('identifies FEAR when eyes are wide open with mouth wide open', () => {
        const result = ClinicalEmotionRules.evaluate({
          blendshapesMap: {
            jawOpen: 0.35,
            eyeWideLeft: 0.25,
            eyeWideRight: 0.25,
          },
          cnnProbs: dummyCNN,
        });
        expect(result.rawEmotion).toBe('fear');
      });

      it('identifies FEAR when eyes are completely closed with mouth wide open', () => {
        const result = ClinicalEmotionRules.evaluate({
          blendshapesMap: {
            jawOpen: 0.35,
            eyeBlinkLeft: 0.85,
            eyeBlinkRight: 0.85,
          },
          cnnProbs: dummyCNN,
        });
        expect(result.rawEmotion).toBe('fear');
      });

      it('identifies HAPPY with mouth wide open (joyful laugh/giggle)', () => {
        const result = ClinicalEmotionRules.evaluate({
          blendshapesMap: {
            jawOpen: 0.30,
            mouthSmileLeft: 0.32,
            mouthSmileRight: 0.32,
            cheekSquintLeft: 0.24,
            cheekSquintRight: 0.24,
            eyeWideLeft: 0.02,
            eyeWideRight: 0.02,
            eyeBlinkLeft: 0.02,
            eyeBlinkRight: 0.02,
            browDownLeft: 0.01,
            browDownRight: 0.01,
          },
          cnnProbs: dummyCNN,
        });
        expect(result.rawEmotion).toBe('happy');
        expect(result.topConfidence).toBeGreaterThanOrEqual(0.92);
      });

      it('identifies SAD with mouth wide open (open-mouth crying wail)', () => {
        const result = ClinicalEmotionRules.evaluate({
          blendshapesMap: {
            jawOpen: 0.28,
            browInnerUp: 0.22,
            mouthFrownLeft: 0.20,
            mouthFrownRight: 0.20,
            mouthShrugLower: 0.16,
            eyeWideLeft: 0.02,
            eyeWideRight: 0.02,
            eyeBlinkLeft: 0.02,
            eyeBlinkRight: 0.02,
            browDownLeft: 0.02,
            browDownRight: 0.02,
          },
          cnnProbs: dummyCNN,
        });
        expect(result.rawEmotion).toBe('sad');
      });

      it('identifies ANGRY with mouth wide open (angry shout/protest)', () => {
        const result = ClinicalEmotionRules.evaluate({
          blendshapesMap: {
            jawOpen: 0.28,
            browDownLeft: 0.24,
            browDownRight: 0.24,
            eyeSquintLeft: 0.16,
            eyeSquintRight: 0.16,
            browInnerUp: 0.01,
            eyeWideLeft: 0.02,
            eyeWideRight: 0.02,
            eyeBlinkLeft: 0.02,
            eyeBlinkRight: 0.02,
          },
          cnnProbs: dummyCNN,
        });
        expect(result.rawEmotion).toBe('angry');
      });

      it('identifies NEUTRAL with mouth wide open ("say ahhh" / calm procedural opening)', () => {
        const result = ClinicalEmotionRules.evaluate({
          blendshapesMap: {
            jawOpen: 0.35,
            eyeWideLeft: 0.02,
            eyeWideRight: 0.02,
            eyeBlinkLeft: 0.02,
            eyeBlinkRight: 0.02,
            browDownLeft: 0.01,
            browDownRight: 0.01,
            browInnerUp: 0.01,
            mouthSmileLeft: 0.01,
            mouthSmileRight: 0.01,
            mouthFrownLeft: 0.01,
            mouthFrownRight: 0.01,
          },
          cnnProbs: dummyCNN,
        });
        expect(result.rawEmotion).toBe('neutral');
        expect(result.topConfidence).toBe(0.96);
      });
    });

    // Condition 2: Teeth Showing
    describe('Condition 2: Teeth Showing (retractor / bared teeth)', () => {
      it('identifies FEAR when eyes are wide open with teeth showing', () => {
        const result = ClinicalEmotionRules.evaluate({
          blendshapesMap: {
            mouthUpperUpLeft: 0.22,
            mouthUpperUpRight: 0.22,
            mouthLowerDownLeft: 0.18,
            mouthLowerDownRight: 0.18,
            eyeWideLeft: 0.24,
            eyeWideRight: 0.24,
          },
          cnnProbs: dummyCNN,
        });
        expect(result.rawEmotion).toBe('fear');
      });

      it('identifies FEAR when eyes are completely closed with teeth showing', () => {
        const result = ClinicalEmotionRules.evaluate({
          blendshapesMap: {
            mouthUpperUpLeft: 0.20,
            mouthUpperUpRight: 0.20,
            eyeBlinkLeft: 0.88,
            eyeBlinkRight: 0.88,
          },
          cnnProbs: dummyCNN,
        });
        expect(result.rawEmotion).toBe('fear');
      });

      it('identifies HAPPY with teeth showing (wide dental grin)', () => {
        const result = ClinicalEmotionRules.evaluate({
          blendshapesMap: {
            mouthUpperUpLeft: 0.22,
            mouthUpperUpRight: 0.22,
            mouthSmileLeft: 0.30,
            mouthSmileRight: 0.30,
            cheekSquintLeft: 0.22,
            cheekSquintRight: 0.22,
            eyeWideLeft: 0.02,
            eyeWideRight: 0.02,
            eyeBlinkLeft: 0.02,
            eyeBlinkRight: 0.02,
            browDownLeft: 0.01,
            browDownRight: 0.01,
          },
          cnnProbs: dummyCNN,
        });
        expect(result.rawEmotion).toBe('happy');
        expect(result.topConfidence).toBeGreaterThanOrEqual(0.92);
      });

      it('identifies SAD with teeth showing (grimacing sad whimper with inner brow lift)', () => {
        const result = ClinicalEmotionRules.evaluate({
          blendshapesMap: {
            mouthUpperUpLeft: 0.15,
            mouthUpperUpRight: 0.15,
            mouthLowerDownLeft: 0.12,
            mouthLowerDownRight: 0.12,
            browInnerUp: 0.20,
            mouthFrownLeft: 0.18,
            mouthFrownRight: 0.18,
            mouthShrugLower: 0.15,
            eyeWideLeft: 0.02,
            eyeWideRight: 0.02,
            eyeBlinkLeft: 0.02,
            eyeBlinkRight: 0.02,
            browDownLeft: 0.02,
            browDownRight: 0.02,
          },
          cnnProbs: dummyCNN,
        });
        expect(result.rawEmotion).toBe('sad');
      });

      it('identifies ANGRY with teeth showing (bared teeth snarl / aggressive clench)', () => {
        const result = ClinicalEmotionRules.evaluate({
          blendshapesMap: {
            mouthUpperUpLeft: 0.22,
            mouthUpperUpRight: 0.22,
            browDownLeft: 0.25,
            browDownRight: 0.25,
            eyeSquintLeft: 0.18,
            eyeSquintRight: 0.18,
            browInnerUp: 0.01,
            eyeWideLeft: 0.02,
            eyeWideRight: 0.02,
            eyeBlinkLeft: 0.02,
            eyeBlinkRight: 0.02,
          },
          cnnProbs: dummyCNN,
        });
        expect(result.rawEmotion).toBe('angry');
      });

      it('identifies NEUTRAL with teeth showing (passive retractor exposure with calm eyes)', () => {
        const result = ClinicalEmotionRules.evaluate({
          blendshapesMap: {
            mouthUpperUpLeft: 0.18,
            mouthUpperUpRight: 0.18,
            mouthLowerDownLeft: 0.15,
            mouthLowerDownRight: 0.15,
            eyeWideLeft: 0.02,
            eyeWideRight: 0.02,
            eyeBlinkLeft: 0.02,
            eyeBlinkRight: 0.02,
            browDownLeft: 0.01,
            browDownRight: 0.01,
            browInnerUp: 0.01,
            mouthSmileLeft: 0.01,
            mouthSmileRight: 0.01,
            mouthFrownLeft: 0.01,
            mouthFrownRight: 0.01,
          },
          cnnProbs: dummyCNN,
        });
        expect(result.rawEmotion).toBe('neutral');
        expect(result.topConfidence).toBe(0.96);
      });
    });

    // Condition 3: Both Mouth Wide Open AND Teeth Showing
    describe('Condition 3: Mouth Wide Open AND Teeth Showing (full dental access)', () => {
      it('identifies FEAR when eyes are wide open with mouth open and teeth showing', () => {
        const result = ClinicalEmotionRules.evaluate({
          blendshapesMap: {
            jawOpen: 0.35,
            mouthUpperUpLeft: 0.20,
            mouthUpperUpRight: 0.20,
            eyeWideLeft: 0.26,
            eyeWideRight: 0.26,
          },
          cnnProbs: dummyCNN,
        });
        expect(result.rawEmotion).toBe('fear');
      });

      it('identifies FEAR when eyes are completely closed with mouth open and teeth showing', () => {
        const result = ClinicalEmotionRules.evaluate({
          blendshapesMap: {
            jawOpen: 0.35,
            mouthUpperUpLeft: 0.20,
            mouthUpperUpRight: 0.20,
            eyeBlinkLeft: 0.90,
            eyeBlinkRight: 0.90,
          },
          cnnProbs: dummyCNN,
        });
        expect(result.rawEmotion).toBe('fear');
      });

      it('identifies HAPPY with mouth open and teeth showing (laughing out loud)', () => {
        const result = ClinicalEmotionRules.evaluate({
          blendshapesMap: {
            jawOpen: 0.30,
            mouthUpperUpLeft: 0.20,
            mouthUpperUpRight: 0.20,
            mouthSmileLeft: 0.32,
            mouthSmileRight: 0.32,
            cheekSquintLeft: 0.25,
            cheekSquintRight: 0.25,
            eyeWideLeft: 0.02,
            eyeWideRight: 0.02,
            eyeBlinkLeft: 0.02,
            eyeBlinkRight: 0.02,
            browDownLeft: 0.01,
            browDownRight: 0.01,
          },
          cnnProbs: dummyCNN,
        });
        expect(result.rawEmotion).toBe('happy');
      });

      it('identifies SAD with mouth open and teeth showing (crying open mouth distress)', () => {
        const result = ClinicalEmotionRules.evaluate({
          blendshapesMap: {
            jawOpen: 0.25,
            mouthUpperUpLeft: 0.14,
            mouthUpperUpRight: 0.14,
            browInnerUp: 0.22,
            mouthFrownLeft: 0.20,
            mouthFrownRight: 0.20,
            mouthShrugLower: 0.16,
            eyeWideLeft: 0.02,
            eyeWideRight: 0.02,
            eyeBlinkLeft: 0.02,
            eyeBlinkRight: 0.02,
          },
          cnnProbs: dummyCNN,
        });
        expect(result.rawEmotion).toBe('sad');
      });

      it('identifies ANGRY with mouth open and teeth showing (furious shouting defiance)', () => {
        const result = ClinicalEmotionRules.evaluate({
          blendshapesMap: {
            jawOpen: 0.25,
            mouthUpperUpLeft: 0.20,
            mouthUpperUpRight: 0.20,
            browDownLeft: 0.26,
            browDownRight: 0.26,
            eyeSquintLeft: 0.18,
            eyeSquintRight: 0.18,
            browInnerUp: 0.01,
            eyeWideLeft: 0.02,
            eyeWideRight: 0.02,
            eyeBlinkLeft: 0.02,
            eyeBlinkRight: 0.02,
          },
          cnnProbs: dummyCNN,
        });
        expect(result.rawEmotion).toBe('angry');
      });

      it('identifies NEUTRAL with mouth open and teeth showing (full operative posture, calm eyes)', () => {
        const result = ClinicalEmotionRules.evaluate({
          blendshapesMap: {
            jawOpen: 0.32,
            mouthUpperUpLeft: 0.16,
            mouthUpperUpRight: 0.16,
            mouthLowerDownLeft: 0.14,
            mouthLowerDownRight: 0.14,
            eyeWideLeft: 0.02,
            eyeWideRight: 0.02,
            eyeBlinkLeft: 0.02,
            eyeBlinkRight: 0.02,
            browDownLeft: 0.01,
            browDownRight: 0.01,
            browInnerUp: 0.01,
            mouthSmileLeft: 0.01,
            mouthSmileRight: 0.01,
            mouthFrownLeft: 0.01,
            mouthFrownRight: 0.01,
          },
          cnnProbs: dummyCNN,
        });
        expect(result.rawEmotion).toBe('neutral');
        expect(result.topConfidence).toBe(0.96);
      });
    });
  });

  describe('HAPPY Expressions (when eyes are not wide)', () => {
    it('detects a Closed Smile (lips together, corners up, cheeks raised, brows relaxed, normal eyes)', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          mouthSmileLeft: 0.28,
          mouthSmileRight: 0.28,
          cheekSquintLeft: 0.22,
          cheekSquintRight: 0.22,
          eyeWideLeft: 0.02,
          eyeWideRight: 0.02,
          browDownLeft: 0.01,
          browDownRight: 0.01,
          jawOpen: 0.02,
        },
        cnnProbs: dummyCNN,
      });

      expect(result.rawEmotion).toBe('happy');
      expect(result.cues.happyEvidence).toBeGreaterThan(0.70);
    });

    it('detects a Grin With Teeth', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          mouthSmileLeft: 0.32,
          mouthSmileRight: 0.32,
          cheekSquintLeft: 0.25,
          cheekSquintRight: 0.25,
          eyeSquintLeft: 0.15,
          eyeSquintRight: 0.15,
          eyeWideLeft: 0.02,
          eyeWideRight: 0.02,
          mouthUpperUpLeft: 0.18,
          mouthUpperUpRight: 0.18,
          jawOpen: 0.08,
          browDownLeft: 0.01,
          browDownRight: 0.01,
        },
        cnnProbs: dummyCNN,
      });

      expect(result.rawEmotion).toBe('happy');
      expect(result.cues.happyEvidence).toBeGreaterThan(0.75);
    });

    it('disambiguates Grimace: lowered brows with smile is NOT happy', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          mouthSmileLeft: 0.25,
          mouthSmileRight: 0.25,
          browDownLeft: 0.15,
          browDownRight: 0.15,
          eyeWideLeft: 0.02,
          eyeWideRight: 0.02,
        },
        cnnProbs: dummyCNN,
      });

      expect(result.cues.happyEvidence).toBe(0.0);
      expect(result.rawEmotion).not.toBe('happy');
    });
  });

  describe('SAD vs NEUTRAL Disambiguation', () => {
    it('detects Quiet Sad (closed mouth, downturned corners, chin wrinkling)', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          browInnerUp: 0.22,
          mouthFrownLeft: 0.20,
          mouthFrownRight: 0.20,
          mouthShrugLower: 0.18,
          eyeWideLeft: 0.02,
          eyeWideRight: 0.02,
          jawOpen: 0.02,
        },
        cnnProbs: dummyCNN,
      });

      expect(result.rawEmotion).toBe('sad');
      expect(result.cues.sadEvidence).toBeGreaterThan(0.70);
    });

    it('detects Pout or Trembling Lip as SAD', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          browInnerUp: 0.15,
          mouthPucker: 0.22,
          mouthShrugLower: 0.18,
          eyeWideLeft: 0.02,
          eyeWideRight: 0.02,
          jawOpen: 0.03,
        },
        cnnProbs: dummyCNN,
      });

      expect(result.rawEmotion).toBe('sad');
      expect(result.cues.sadEvidence).toBeGreaterThan(0.70);
    });

    it('detects strong sad frown even without browInnerUp as SAD (not NEUTRAL)', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          mouthFrownLeft: 0.22,
          mouthFrownRight: 0.22,
          browInnerUp: 0.02,
          mouthShrugLower: 0.05,
          eyeWideLeft: 0.02,
          eyeWideRight: 0.02,
        },
        cnnProbs: dummyCNN,
      });

      expect(result.rawEmotion).toBe('sad');
    });

    it('disambiguates Resting Downturned Lips: mild downturn without inner brow or chin cues stays NEUTRAL', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          mouthFrownLeft: 0.12,
          mouthFrownRight: 0.12,
          browInnerUp: 0.02,
          mouthShrugLower: 0.02,
          browDownLeft: 0.01,
          browDownRight: 0.01,
          eyeWideLeft: 0.02,
          eyeWideRight: 0.02,
        },
        cnnProbs: [0.05, 0.05, 0.05, 0.80, 0.05],
      });

      expect(result.cues.sadEvidence).toBe(0.0);
      expect(result.rawEmotion).toBe('neutral');
    });

    it('prevents baseline mouthShrugLower noise on a resting face from triggering SAD', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          mouthShrugLower: 0.16,
          mouthFrownLeft: 0.02,
          mouthFrownRight: 0.02,
          browInnerUp: 0.02,
          browDownLeft: 0.01,
          browDownRight: 0.01,
          eyeWideLeft: 0.02,
          eyeWideRight: 0.02,
        },
        cnnProbs: [0.05, 0.05, 0.05, 0.30, 0.55],
      });

      expect(result.cues.sadEvidence).toBe(0.0);
      expect(result.rawEmotion).toBe('neutral');
    });
  });

  describe('SAD vs ANGRY Disambiguation', () => {
    it('detects Pressed Lips & Brow Lowering as ANGRY', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          browDownLeft: 0.16,
          browDownRight: 0.16,
          mouthPressLeft: 0.22,
          mouthPressRight: 0.22,
          eyeWideLeft: 0.02,
          eyeWideRight: 0.02,
        },
        cnnProbs: dummyCNN,
      });

      expect(result.rawEmotion).toBe('angry');
      expect(result.cues.angryEvidence).toBeGreaterThan(0.70);
    });

    it('does NOT confuse an Angry Scowl + Clenched Chin with SAD', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          browDownLeft: 0.22,
          browDownRight: 0.22,
          browInnerUp: 0.01,
          eyeSquintLeft: 0.15,
          eyeSquintRight: 0.15,
          eyeWideLeft: 0.02,
          eyeWideRight: 0.02,
          mouthShrugLower: 0.18,
          mouthPucker: 0.14,
          mouthFrownLeft: 0.12,
          mouthFrownRight: 0.12,
        },
        cnnProbs: dummyCNN,
      });

      expect(result.rawEmotion).toBe('angry');
      expect(result.cues.sadEvidence).toBe(0.0);
    });

    it('does NOT confuse a Sad Frown + Inner Brow Lift + Mild Corrugation with ANGRY', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          browInnerUp: 0.18,
          mouthFrownLeft: 0.20,
          mouthFrownRight: 0.20,
          mouthShrugLower: 0.14,
          browDownLeft: 0.13,
          browDownRight: 0.13,
          eyeWideLeft: 0.02,
          eyeWideRight: 0.02,
        },
        cnnProbs: dummyCNN,
      });

      expect(result.rawEmotion).toBe('sad');
      expect(result.cues.angryEvidence).toBe(0.0);
    });
  });

  describe('NEUTRAL Expressions & Dental Procedural Variants', () => {
    it('detects a completely relaxed resting face as NEUTRAL', () => {
      const result = ClinicalEmotionRules.evaluate({
        blendshapesMap: {
          browDownLeft: 0.01,
          browDownRight: 0.01,
          browInnerUp: 0.02,
          cheekSquintLeft: 0.02,
          cheekSquintRight: 0.02,
          mouthSmileLeft: 0.02,
          mouthSmileRight: 0.02,
          mouthFrownLeft: 0.02,
          mouthFrownRight: 0.02,
          eyeWideLeft: 0.02,
          eyeWideRight: 0.02,
          jawOpen: 0.02,
        },
        cnnProbs: [0.05, 0.05, 0.05, 0.80, 0.05],
      });

      expect(result.rawEmotion).toBe('neutral');
      expect(result.topConfidence).toBeGreaterThanOrEqual(0.90);
    });
  });
});
