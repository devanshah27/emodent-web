# Clinical & Technical Limitations of EmoDent Web

> **CRITICAL REGULATORY NOTICE**  
> **EmoDent Web is a research engineering prototype designed solely as a passive monitoring adjunct. It is NOT a medical device, diagnostic system, clinical decision support software, or pain measurement instrument.**  
> It is not certified, cleared, or approved by the US FDA, CE-MDR, or any health regulatory body. It must **NEVER** be used to direct patient care, calibrate local or general anesthesia, assess pain thresholds, or determine clinical interventions.

---

## 1. Demographic & Morphological Bias (Adult-Face Bias)

### 1.1 The Adult-Centric FER-2013 Dataset
- The emotion classifier was trained on FER-2013, an open-access computer vision dataset consisting of ~35,000 unconstrained web-scraped faces. The vast majority of images in FER-2013 are **adult subjects**.
- Children, particularly between ages 3 and 10 (the primary pediatric dental demographic), have substantially different craniofacial morphology:
  - Higher cephalic index (rounder head shape, relatively larger cranial vault).
  - Immature facial musculature with less pronounced facial sulci (nasolabial folds, forehead creases).
  - Thicker subcutaneous facial adipose tissue dampening fine expression micro-movements.
- As a consequence, models trained purely on adult expression dynamics exhibit lower sensitivity and higher classification uncertainty when applied to pediatric facial movements.

### 1.2 Lack of Pediatric Clinical Validation
- **No pediatric clinical trial or diagnostic validation has been performed.**
- Before this software could ever be considered for clinical observational studies, prospective Institutional Review Board (IRB) / Ethics Committee approval must be obtained, alongside formal parental informed consent and pediatric assent.
- The model must be fine-tuned using the provided `ml/fine_tune.py` protocol on consented clinical pediatric datasets with validated pediatric behavioral annotations.

---

## 2. Operative Occlusions & Dental Artifacts

Pediatric dentistry presents an environment that violates standard computer vision assumptions:
1. **Instrument Occlusion**:
   - High-speed handpieces, mouth mirrors, suction tubes (saliva ejectors), and cotton rolls frequently obstruct the mouth, jaw, and lower cheeks.
   - Clinical staff wear powder-free nitrile gloves that intermittently enter the camera frame directly over the patient's face.
2. **Open-Mouth Ambiguity**:
   - An open mouth in standard datasets indicates either **surprise** (Action Units 26/27) or intense crying. In pediatric dentistry, the patient is required to hold their mouth wide open voluntarily for examination or tooth extraction, often aided by bite blocks (mouth props) or rubber dams.
   - This mandatory procedural posture frequently induces false-positive distress classifications if jaw-opening is interpreted in isolation.
3. **Lighting & Angle Artifacts**:
   - Direct high-intensity dental operatory lights (typically 15,000–30,000 lux) directed at the oral cavity create stark cast shadows across the chin and nose, altering normalized grayscale values.
   - Supine or semi-supine patient seating angles introduce foreshortened perspective distortion compared to frontal passport-style camera feeds.

---

## 3. The Prevalence Paradox & Inter-Rater Kappa Caveat

When validating automated distress detection against clinical scales (such as VCAS - Venham Clinical Anxiety Scale or VFAS - Visual Facial Anxiety Scale) across procedural phases:
- **Phase-Dependent Skew**:
  - In low-distress phases (`PRE_TREATMENT`), negative-affect expressions are scarce ($< 10\%$).
  - In high-stress phases (`LOCAL_ANESTHESIA` and `EXTRACTION`), clinical distress prevalence frequently exceeds $90\%$ or reaches $100\%$.
- **The Kappa Paradox (Feinstein & Cicchetti, 1990)**:
  - When the true marginal prevalence of a condition is extreme (e.g., $> 90\%$), chance agreement ($P_e$) approaches 1.0. Under this condition, Cohen's kappa ($\kappa$) drops precipitously toward $0.00$, despite near-perfect observed agreement ($P_o \approx 95\%$).
  - Therefore, Cohen's kappa cannot be relied upon in isolation during high-stress dental phases.
- **Methodological Remedy**:
  - The EmoDent analysis pipeline reports **Prevalence-Adjusted Bias-Adjusted Kappa (PABAK)** and **Gwet's $AC_1$**, which remain stable under skewed marginals.
  - However, $AC_1$ or PABAK must **never** be presented as sole evidence of validity. Researchers must inspect:
    1. Complete $2 \times 2$ contingency tables (TP, FP, FN, TN).
    2. Empirical Sensitivity (True Positive Rate) and Specificity (True Negative Rate).
    3. Non-parametric concordance across all four phases via the Friedman test and Kendall's $W$.

---

## 4. Unvalidated Blendshape Distress Gauge

The blendshape distress score in EmoDent Web:
$$D_{\text{blendshape}} = 0.35 \times \text{browDown} + 0.25 \times \text{eyeSquint} + 0.25 \times \text{mouthFrown} + 0.15 \times \text{jawOpen}$$
- **This score is strictly an exploratory heuristic.**
- It is **not** equivalent to a validated clinical pain assessment tool (e.g., Wong-Baker FACES Pain Rating Scale, FLACC scale, or CHEOPS).
- Vocalizations, singing, swallowing, gagging, or coughing will activate these muscle groups and produce transient score spikes unrelated to psychological distress.

---

## 5. Security & Privacy Boundaries

- **On-Device Sandbox**: EmoDent Web operates 100% client-side in the browser via WebAssembly (WASM) and WebGL. No network requests are initiated after the web assets load.
- **Volatile Storage**: Video streams and individual frame tensors reside purely in volatile RAM. No images or videos are written to persistent cookies, LocalStorage, IndexedDB, or external servers.
- **Session Purge**: Clicking "Delete session data" immediately purges all frame logs and phase telemetry from browser memory.

---

## 6. Frankl Behavior Rating Scale (FBRS) vs. Facial Affect Recognition

- **Construct Divergence**:
  - The Frankl Behavior Rating Scale (FBRS) measures **overt cooperative behavior** (1 = Definitely negative [--], 2 = Negative [-], 3 = Positive [+], 4 = Definitely positive [++]).
  - Automated Facial Emotion Recognition (FER) measures **transient facial affect** (micro-expressions and Action Units).
  - Overt behavior and facial affect are fundamentally distinct constructs:
    - A child may exhibit fearful or anxious facial affect while remaining compliant and holding still (FBRS 3 or 4).
    - A child may be sullen, withdrawn, or refusing treatment (FBRS 2 or 1) while maintaining a flat or unexpressive facial posture.
  - Consequently, only **moderate/partial agreement** is clinically expected between AI facial affect and clinician behavioral ratings. AI classification is an observational research adjunct and **never** a substitute for clinician behavioral rating.
- **Reverse Scale Orientation**:
  - FBRS is reverse-oriented relative to distress scales (lower score = worse behavior).
  - For statistical comparability with VCAS and VFAS, the analysis pipeline evaluates reversed FBRS:
    $$\text{Reversed FBRS} = 5 - \text{FBRS}$$
  - The clinical threshold for negative behavior is strictly defined as $\text{FBRS} \le 2$ (`FRANKL_NEGATIVE_THRESHOLD = 2`).

---

## 7. Dental Posture Overrides (Clinical Rules)

- **Mandatory Procedural Postures**:
  - During dental procedures, children are routinely asked to open wide ("say ahhh"), or have mouth props (bite blocks), rubber dams, or mirrors inserted.
  - Normal computer vision models erroneously classify wide mouth opening as `FEAR` or `CRYING`, and mouth opening with visible teeth as `ANGRY`.
  - In EmoDent Web, calibrated clinical rules actively override these artifacts:
    1. **Mouth Wide Open**: Explicitly detected and classified as `NEUTRAL` unless true smiling (AU12) is present.
    2. **Showing Teeth or Mouth Slightly Open**: Classified as `NEUTRAL` instead of `ANGRY` to eliminate oral mirror and probe examination false positives.

