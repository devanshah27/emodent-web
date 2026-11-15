"""
Synthetic Clinical Session and Clinician Score Generator for EmoDent.
Generates realistic multi-patient clinical sessions across 4 procedural phases:
  - PRE_TREATMENT: Low distress (mostly neutral/happy, low VCAS/VFAS 0-1, high FBRS 3-4)
  - LOCAL_ANESTHESIA: High acute distress (fear/pain, elevated VCAS/VFAS 2-4, low FBRS 1-2)
  - EXTRACTION: High procedural distress (fear/angry/pain, elevated VCAS/VFAS 2-4, low FBRS 1-2)
  - POST_TREATMENT: Acclimation/relief (neutral/happy/sad, lower VCAS/VFAS 0-2, high FBRS 3-4)

Includes Frankl Behavior Rating Scale (FBRS, 1-4) with reverse orientation (FBRS <= 2 = negative behavior).
Supports multi-rater scenarios (rater1, rater2) and blinded clinician mode.
"""

import os
import argparse
import random
import numpy as np
import pandas as pd

PHASES = ["PRE_TREATMENT", "LOCAL_ANESTHESIA", "EXTRACTION", "POST_TREATMENT"]
EMOTIONS = ["angry", "fear", "happy", "neutral", "sad"]
FRANKL_NEGATIVE_THRESHOLD = 2


def generate_synthetic_dataset(
    output_dir: str = "./analysis/sample_data",
    num_participants: int = 30,
    frames_per_phase: int = 150,
    include_second_rater: bool = True,
    seed: int = 42
):
    random.seed(seed)
    np.random.seed(seed)
    os.makedirs(output_dir, exist_ok=True)
    frames_dir = os.path.join(output_dir, "exported_csvs")
    os.makedirs(frames_dir, exist_ok=True)

    clinician_records = []

    # Phase-specific emotion probability profiles and clinical rating distributions
    # FBRS is reverse-oriented: 1 = Definitely negative, 4 = Definitely positive
    phase_profiles = {
        "PRE_TREATMENT": {
            "probs": [0.03, 0.07, 0.45, 0.40, 0.05],
            "vcas_mu": 0.4,
            "vfas_mu": 0.3,
            "fbrs_mu": 3.6,
            "distress_mu": 0.15,
        },
        "LOCAL_ANESTHESIA": {
            "probs": [0.15, 0.50, 0.05, 0.10, 0.20],
            "vcas_mu": 2.8,
            "vfas_mu": 3.0,
            "fbrs_mu": 1.8,
            "distress_mu": 0.72,
        },
        "EXTRACTION": {
            "probs": [0.25, 0.40, 0.05, 0.10, 0.20],
            "vcas_mu": 2.9,
            "vfas_mu": 3.1,
            "fbrs_mu": 1.7,
            "distress_mu": 0.75,
        },
        "POST_TREATMENT": {
            "probs": [0.05, 0.08, 0.35, 0.42, 0.10],
            "vcas_mu": 0.6,
            "vfas_mu": 0.5,
            "fbrs_mu": 3.3,
            "distress_mu": 0.22,
        },
    }

    raters = ["rater1"]
    if include_second_rater:
        raters.append("rater2")

    for p_idx in range(1, num_participants + 1):
        p_id = f"P-{1000 + p_idx}"
        frame_rows = []
        base_timestamp = 1700000000000 + p_idx * 1000000

        # Patient baseline anxiety / cooperation trait (shared across raters)
        patient_offset = float(np.random.normal(0, 0.35))

        for phase in PHASES:
            cfg = phase_profiles[phase]

            # Generate Clinician Ratings (VCAS 0-4, VFAS 0-4, FBRS 1-4)
            for rater in raters:
                rater_bias = float(np.random.normal(0, 0.2)) if rater == "rater2" else 0.0
                
                # VCAS (0-4)
                vcas_val = int(np.clip(round(np.random.normal(cfg["vcas_mu"] + patient_offset + rater_bias, 0.55)), 0, 4))
                # VFAS (0-4)
                vfas_val = int(np.clip(round(np.random.normal(cfg["vfas_mu"] + patient_offset + rater_bias, 0.55)), 0, 4))
                # FBRS (1-4): Inversely correlated with VCAS (5 - VCAS roughly)
                # Lower FBRS = more uncooperative/negative
                fbrs_raw = cfg["fbrs_mu"] - (patient_offset + rater_bias) + np.random.normal(0, 0.45)
                fbrs_val = int(np.clip(round(fbrs_raw), 1, 4))

                clinician_records.append({
                    "participant_id": p_id,
                    "phase": phase,
                    "rater_id": rater,
                    "blinded": True,
                    "vcas": vcas_val,
                    "vfas": vfas_val,
                    "fbrs": fbrs_val,
                    "timestamp": base_timestamp + 10000,
                })

            # Generate per-frame observations
            for f in range(frames_per_phase):
                timestamp = base_timestamp + f * 33  # ~30 fps
                # Introduce occasional NO_RESULT (5% chance) or UNCERTAIN (8% chance)
                r_rand = random.random()
                if r_rand < 0.05:
                    label = "NO_RESULT"
                    q_flag = random.choice(["NO_FACE", "FACE_TOO_SMALL", "EXCESSIVE_MOTION"])
                    conf = 0.0
                    probs = [0.2, 0.2, 0.2, 0.2, 0.2]
                    neg_affect = 0
                    distress = 0.0
                elif r_rand < 0.13:
                    label = "UNCERTAIN"
                    q_flag = "VALID"
                    conf = round(random.uniform(0.60, 0.89), 4)
                    probs = np.random.dirichlet([1, 1, 1, 1, 1]).tolist()
                    neg_affect = 0
                    distress = round(float(np.clip(np.random.normal(cfg["distress_mu"], 0.15), 0, 1)), 4)
                else:
                    label = np.random.choice(EMOTIONS, p=cfg["probs"])
                    q_flag = "VALID"
                    conf = round(random.uniform(0.90, 0.99), 4)
                    probs = [0.02, 0.02, 0.02, 0.02, 0.02]
                    chosen_idx = EMOTIONS.index(label)
                    probs[chosen_idx] = conf
                    # Distribute remaining probability
                    rem = (1.0 - conf) / 4.0
                    for i in range(5):
                        if i != chosen_idx:
                            probs[i] = round(rem, 4)
                    neg_affect = 1 if label in ["angry", "fear", "sad"] else 0
                    distress = round(float(np.clip(np.random.normal(cfg["distress_mu"], 0.12), 0, 1)), 4)

                frame_rows.append({
                    "timestamp_ms": timestamp,
                    "participant_id": p_id,
                    "phase": phase,
                    "emotion_label": label,
                    "confidence": conf,
                    "quality_flag": q_flag,
                    "prob_angry": probs[0],
                    "prob_fear": probs[1],
                    "prob_happy": probs[2],
                    "prob_neutral": probs[3],
                    "prob_sad": probs[4],
                    "blendshape_distress": distress,
                    "negative_affect": neg_affect,
                })
            base_timestamp += frames_per_phase * 33 + 5000

        # Save individual participant CSV
        p_df = pd.DataFrame(frame_rows)
        p_csv_path = os.path.join(frames_dir, f"emodent_{p_id}_frames.csv")
        p_df.to_csv(p_csv_path, index=False)

    # Save clinician scores CSV
    clinician_df = pd.DataFrame(clinician_records)
    clinician_path = os.path.join(output_dir, "clinician_scores.csv")
    clinician_df.to_csv(clinician_path, index=False)

    print(f"✓ Synthetic clinical dataset generated successfully:")
    print(f"  - Participants: {num_participants}")
    print(f"  - Raters: {raters}")
    print(f"  - Total Clinician Phase Records: {len(clinician_df)} (in {clinician_path})")
    print(f"  - Exported Participant CSVs: {num_participants} (in {frames_dir})")
    return clinician_path, frames_dir


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate synthetic EmoDent clinical session data")
    parser.add_argument("--output-dir", default="./analysis/sample_data", type=str)
    parser.add_argument("--participants", default=30, type=int)
    parser.add_argument("--frames-per-phase", default=150, type=int)
    parser.add_argument("--multi-rater", action="store_true", default=True)
    args = parser.parse_args()

    generate_synthetic_dataset(
        output_dir=args.output_dir,
        num_participants=args.participants,
        frames_per_phase=args.frames_per_phase,
        include_second_rater=args.multi_rater
    )

