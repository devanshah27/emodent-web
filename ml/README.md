# EmoDent ML Pipeline: 5-Class Facial Emotion Recognition

## 1. Dataset & 5-Class Remapping

EmoDent trains on the FER-2013 dataset remapped from 7 classes to **5 target classes**:
1. `angry` (index 0)
2. `fear` (index 1)
3. `happy` (index 2)
4. `neutral` (index 3)
5. `sad` (index 4)

### Dropped Classes & Rationale:
- **`disgust` dropped**: FER-2013 contains only ~436 disgust training samples (severe class imbalance < 2% of data). Furthermore, facial action units for disgust (`AU9` nose wrinkle, `AU10` upper lip raiser) heavily overlap with anger in distressed patients.
- **`surprise` dropped**: FER-2013 contains surprise (wide eyes `AU5`, open jaw `AU26/27`). In pediatric dentistry, wide eyes and an open mouth frequently signify jaw fatigue, vocalization/gasping, rubber dam insertion, or startle from dental drill noise, rather than psychological surprise. Dropping it eliminates a primary confounding false positive.

### Distribution (FER-2013 5-Class Remap):
- **Train (25,102 images)**: `happy`: 7,215 | `neutral`: 4,965 | `sad`: 4,830 | `fear`: 4,097 | `angry`: 3,995
- **Test (6,236 images)**: `happy`: 1,774 | `neutral`: 1,233 | `sad`: 1,247 | `fear`: 1,024 | `angry`: 958

---

## 2. Model Architecture

- **Input**: 1-channel Grayscale, 48x48 pixels, normalized to `[0.0, 1.0]`.
- **Backbone**: 4 Convolutional stages with double 3x3 Conv2d, BatchNorm2d, ReLU, MaxPool2d (2x2), and spatial Dropout2d:
  - Stage 1: $1 \to 32$ filters, MaxPool ($48 \times 48 \to 24 \times 24$), Dropout(0.15)
  - Stage 2: $32 \to 64$ filters, MaxPool ($24 \times 24 \to 12 \times 12$), Dropout(0.20)
  - Stage 3: $64 \to 128$ filters, MaxPool ($12 \times 12 \to 6 \times 6$), Dropout(0.25)
  - Stage 4: $128 \to 256$ filters, MaxPool ($6 \times 6 \to 3 \times 3$), Dropout(0.30)
- **Head**: Global Average Pooling (GAP) $\to$ Linear(256, 128) $\to$ BatchNorm1d $\to$ ReLU $\to$ Dropout(0.40) $\to$ Linear(128, 5) $\to$ Softmax.
- **Parameters**: 1,206,309 parameters.
- **ONNX Footprint**: **4.60 MB** (fulfills $< 5$ MB constraint for instantaneous web delivery).

---

## 3. Training & Augmentations

- **Class-Weighted Cross Entropy**: Inverse class frequency weighting handles imbalance between `happy` (7,215) and `angry`/`fear` (~4,000).
- **Domain Augmentations**:
  - `RandomHorizontalFlip(p=0.5)`
  - `RandomRotation(degrees=10)`
  - `ColorJitter(brightness=0.2, contrast=0.2)`
  - `RandomErasing(p=0.3)`: Crucial domain simulation where cutout patches mimic dental instruments, fingers, cotton rolls, and mirrors occluding facial areas.

---

## 4. CRITICAL LIMITATIONS & ETHICAL NOTICE

> ### WARNING: ADULT DEMOGRAPHIC BIAS & NO PEDIATRIC VALIDATION
>
> 1. **Adult-Face Bias**: FER-2013 is composed predominantly of adult faces scraped from search engines in unconstrained environments. Craniofacial proportions, muscle tone, and emotional expression dynamics in young pediatric populations differ substantially from adults.
> 2. **Low Resolution & Compression Artifacts**: Images in FER-2013 are 48x48 web-scraped thumbnails with frequent jpeg artifacts and watermarks.
> 3. **Clinical Occlusions**: During dental care, clinical staff wear nitrile gloves, patients wear sunglasses/bibs, and hands/dental handpieces frequently occlude the lower half of the face.
> 4. **No Pediatric Clinical Validation**: This model has **NOT** undergone clinical or diagnostic validation on pediatric dental patients. It is intended solely as an engineering prototype for technical feasibility of client-side tracking and must never be used for clinical decision-making.
> 5. Any prospective deployment requires formal IRB ethics approval, parental consent, pediatric assent, and retraining or fine-tuning via `ml/fine_tune.py` on a consented clinical video dataset.

