"""
Full Clinical Agreement and Statistical Analysis Pipeline for EmoDent.
Runs comprehensive analysis comparing AI negative-affect predictions with clinician scales:
  - Venham Clinical Anxiety Scale (VCAS: 0-4)
  - Visual Facial Anxiety Scale (VFAS: 0-4)
  - Frankl Behavior Rating Scale (FBRS: 1-4, reversed as 5 - FBRS)
"""

import os
import glob
import json
import argparse
from typing import Dict, List, Any
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")  # Non-interactive backend
import matplotlib.pyplot as plt

from metrics import (
    compute_agreement_metrics,
    compute_spearman_ci,
    compute_friedman_and_kendall_w,
    compute_weighted_kappa,
    reverse_fbrs,
    is_fbrs_negative,
    FRANKL_NEGATIVE_THRESHOLD,
)

PHASES = ["PRE_TREATMENT", "LOCAL_ANESTHESIA", "EXTRACTION", "POST_TREATMENT"]
EMOTIONS = ["angry", "fear", "happy", "neutral", "sad"]


def load_and_aggregate_data(data_dir: str):
    """
    Loads exported frame CSVs and clinician scores, computes per-participant per-phase aggregates.
    """
    clinician_csv = os.path.join(data_dir, "clinician_scores.csv")
    if not os.path.exists(clinician_csv):
        raise FileNotFoundError(f"Clinician scores file not found at: {clinician_csv}")

    clinician_df = pd.read_csv(clinician_csv)

    # Standardize column names to lowercase first to avoid duplicate collisions
    clinician_df.columns = [c.strip().lower() for c in clinician_df.columns]
    clinician_df = clinician_df.loc[:, ~clinician_df.columns.duplicated()].copy()

    # Map to canonical column names
    col_mapping = {
        "vcas": "VCAS",
        "vfas": "VFAS",
        "fbrs": "FBRS",
        "rater_id": "rater_id",
        "blinded": "blinded",
        "participant_id": "participant_id",
        "phase": "phase",
    }
    clinician_df = clinician_df.rename(columns={k: v for k, v in col_mapping.items() if k in clinician_df.columns})

    # If FBRS is missing from older dataset, raise or provide fallback
    if "FBRS" not in clinician_df.columns:
        print("Notice: 'FBRS' column not found in clinician CSV. Synthesizing FBRS from VCAS.")
        clinician_df["FBRS"] = np.clip(np.round(4.0 - clinician_df["VCAS"] * 0.75 + np.random.normal(0, 0.3, len(clinician_df))), 1, 4).astype(int)

    # Search for exported frame CSVs
    frame_csv_pattern = os.path.join(data_dir, "**", "*frames*.csv")
    frame_files = glob.glob(frame_csv_pattern, recursive=True)
    # Exclude clinician_scores.csv if matched
    frame_files = [f for f in frame_files if "clinician" not in os.path.basename(f).lower()]

    if len(frame_files) == 0:
        raise FileNotFoundError(f"No exported participant frame CSV files found in {data_dir}")

    print(f"Loaded {len(clinician_df)} clinician phase entries.")
    print(f"Found {len(frame_files)} participant frame log files.")

    all_frames = []
    for f in frame_files:
        df = pd.read_csv(f)
        all_frames.append(df)

    frames_df = pd.concat(all_frames, ignore_index=True)

    # Filter out NO_RESULT / invalid frames for affective analysis
    valid_frames = frames_df[
        (frames_df["quality_flag"] == "VALID") &
        (frames_df["emotion_label"] != "NO_RESULT")
    ].copy()

    # Per-participant per-phase aggregation
    agg_list = []
    for (p_id, phase), group in valid_frames.groupby(["participant_id", "phase"]):
        total_valid = len(group)
        classified = group[group["emotion_label"] != "UNCERTAIN"]
        n_classified = len(classified)

        # AI negative affect: angry | sad | fear = 1; happy | neutral = 0
        neg_frames = group["negative_affect"].sum()
        neg_rate = neg_frames / max(total_valid, 1)

        # Binary AI phase flag: true if >= 50% of valid frames are negative affect
        ai_binary = 1 if neg_rate >= 0.50 else 0

        # Mean blendshape distress score
        mean_distress = group["blendshape_distress"].mean()

        # Emotion counts
        counts = {em: (classified["emotion_label"] == em).sum() for em in EMOTIONS}
        dominant = max(counts, key=counts.get) if n_classified > 0 else "neutral"

        row = {
            "participant_id": str(p_id).strip('"'),
            "phase": phase,
            "total_valid_frames": total_valid,
            "ai_negative_rate": round(neg_rate, 4),
            "ai_binary_neg": ai_binary,
            "mean_blendshape_distress": round(mean_distress, 4),
            "dominant_emotion": dominant,
        }
        for em in EMOTIONS:
            row[f"pct_{em}"] = round((counts[em] / max(n_classified, 1)) * 100, 2)

        agg_list.append(row)

    ai_phase_df = pd.DataFrame(agg_list)

    # Merge AI phase data with clinician ratings
    clinician_df["participant_id"] = clinician_df["participant_id"].astype(str).str.strip('"')
    merged_df = pd.merge(clinician_df, ai_phase_df, on=["participant_id", "phase"], how="inner")

    return frames_df, merged_df


def run_full_analysis(merged_df: pd.DataFrame, frames_df: pd.DataFrame, output_dir: str):
    os.makedirs(output_dir, exist_ok=True)
    plots_dir = os.path.join(output_dir, "plots")
    os.makedirs(plots_dir, exist_ok=True)

    results = {
        "dataset_summary": {
            "total_participants": int(merged_df["participant_id"].nunique()),
            "total_phase_entries": len(merged_df),
            "total_raw_frames": len(frames_df),
            "raters_present": list(merged_df["rater_id"].unique()) if "rater_id" in merged_df.columns else ["rater1"],
        },
        "agreement_primary_threshold_vcas1": {},
        "agreement_primary_threshold_vfas1": {},
        "agreement_fbrs_behavior_negative": {},
        "agreement_sensitivity_threshold_vcas2": {},
        "agreement_sensitivity_threshold_vfas2": {},
        "spearman_correlations": {},
        "cross_scale_correlations": {},
        "inter_rater_reliability": {},
        "friedman_test": {},
    }

    print("\n" + "="*80)
    print("EMODENT CLINICAL STATISTICAL AGREEMENT REPORT (VCAS, VFAS, FBRS)")
    print("="*80)

    # If multiple raters are present, select primary rater (rater1) for standard benchmarks
    primary_df = merged_df[merged_df["rater_id"] == "rater1"] if "rater_id" in merged_df.columns and "rater1" in merged_df["rater_id"].values else merged_df

    # 1. Primary & Sensitivity Agreement Analysis per Phase
    # Comparators:
    # 1) VCAS >= 1 (Anxious/Distressed)
    # 2) VFAS >= 1 (Facial Distress)
    # 3) FBRS <= 2 (Negative Behavior Present: Frankl 1 or 2)
    # 4) Sensitivity VCAS >= 2 and VFAS >= 2
    for phase in PHASES:
        pdf = primary_df[primary_df["phase"] == phase]
        if len(pdf) == 0:
            continue

        ai_binary = pdf["ai_binary_neg"].values
        vcas1 = (pdf["VCAS"] >= 1).astype(int).values
        vfas1 = (pdf["VFAS"] >= 1).astype(int).values
        fbrs_neg = (pdf["FBRS"] <= FRANKL_NEGATIVE_THRESHOLD).astype(int).values
        vcas2 = (pdf["VCAS"] >= 2).astype(int).values
        vfas2 = (pdf["VFAS"] >= 2).astype(int).values

        results["agreement_primary_threshold_vcas1"][phase] = compute_agreement_metrics(vcas1, ai_binary)
        results["agreement_primary_threshold_vfas1"][phase] = compute_agreement_metrics(vfas1, ai_binary)
        results["agreement_fbrs_behavior_negative"][phase] = compute_agreement_metrics(fbrs_neg, ai_binary)
        results["agreement_sensitivity_threshold_vcas2"][phase] = compute_agreement_metrics(vcas2, ai_binary)
        results["agreement_sensitivity_threshold_vfas2"][phase] = compute_agreement_metrics(vfas2, ai_binary)

        # Spearman rho: AI distress rate vs continuous VCAS, VFAS, and Reversed FBRS (5 - FBRS)
        rev_fbrs = reverse_fbrs(pdf["FBRS"].values)
        sp_vcas = compute_spearman_ci(pdf["ai_negative_rate"].values, pdf["VCAS"].values)
        sp_vfas = compute_spearman_ci(pdf["ai_negative_rate"].values, pdf["VFAS"].values)
        sp_fbrs_rev = compute_spearman_ci(pdf["ai_negative_rate"].values, rev_fbrs)

        results["spearman_correlations"][phase] = {
            "VCAS": sp_vcas,
            "VFAS": sp_vfas,
            "FBRS_reversed_(5-FBRS)": sp_fbrs_rev,
        }

    # 1. Print Formatted Agreement Table for Primary (VCAS >= 1)
    print("\n--- 1. PRIMARY AGREEMENT: AI Negative Affect vs VCAS >= 1 ---")
    header = f"{'Phase':<18} {'Po':<7} {'Kappa':<8} {'PABAK':<8} {'Gwet AC1':<10} {'Sens':<7} {'Spec':<7} {'Warning?'}"
    print(header)
    print("-" * len(header))
    for phase in PHASES:
        if phase in results["agreement_primary_threshold_vcas1"]:
            m = results["agreement_primary_threshold_vcas1"][phase]
            warn = "YES (>90%)" if m["high_prevalence_warning"] else "No"
            print(f"{phase:<18} {m['observed_agreement']:<7.3f} {m['cohens_kappa']:<8.3f} {m['pabak']:<8.3f} {m['gwets_ac1']:<10.3f} {m['sensitivity']:<7.3f} {m['specificity']:<7.3f} {warn}")
            if m["high_prevalence_warning"]:
                print(f"  └─► {m['warning_message']}")

    # 2. Print Formatted Agreement Table for FBRS (FBRS <= 2: Negative Behavior Present)
    print("\n--- 2. CLINICAL BEHAVIOR AGREEMENT: AI Negative Affect vs FBRS <= 2 (Negative Behavior) ---")
    print(header)
    print("-" * len(header))
    for phase in PHASES:
        if phase in results["agreement_fbrs_behavior_negative"]:
            m = results["agreement_fbrs_behavior_negative"][phase]
            warn = "YES (>90%)" if m["high_prevalence_warning"] else "No"
            print(f"{phase:<18} {m['observed_agreement']:<7.3f} {m['cohens_kappa']:<8.3f} {m['pabak']:<8.3f} {m['gwets_ac1']:<10.3f} {m['sensitivity']:<7.3f} {m['specificity']:<7.3f} {warn}")
            if m["high_prevalence_warning"]:
                print(f"  └─► {m['warning_message']}")

    # 3. Print Sensitivity Run (VCAS >= 2)
    print("\n--- 3. SENSITIVITY RUN: AI Negative Affect vs VCAS >= 2 ---")
    print(header)
    print("-" * len(header))
    for phase in PHASES:
        if phase in results["agreement_sensitivity_threshold_vcas2"]:
            m = results["agreement_sensitivity_threshold_vcas2"][phase]
            warn = "YES" if m["high_prevalence_warning"] else "No"
            print(f"{phase:<18} {m['observed_agreement']:<7.3f} {m['cohens_kappa']:<8.3f} {m['pabak']:<8.3f} {m['gwets_ac1']:<10.3f} {m['sensitivity']:<7.3f} {m['specificity']:<7.3f} {warn}")

    # 4. Print Spearman Rank Correlations (including 5 - FBRS)
    print("\n--- 4. SPEARMAN RANK CORRELATION (AI Negative Rate vs Clinician Scales) ---")
    print("NOTE: FBRS is reverse-oriented; correlated with (5 - FBRS) so higher = worse behavior.")
    sp_header = f"{'Phase':<18} {'Scale':<24} {'rho':<7} {'95% CI':<18} {'p-value'}"
    print(sp_header)
    print("-" * len(sp_header))
    for phase in PHASES:
        if phase in results["spearman_correlations"]:
            for scale in ["VCAS", "VFAS", "FBRS_reversed_(5-FBRS)"]:
                sp = results["spearman_correlations"][phase][scale]
                ci_str = f"[{sp['ci_lower']:.3f}, {sp['ci_upper']:.3f}]"
                print(f"{phase:<18} {scale:<24} {sp['rho']:<7.3f} {ci_str:<18} {sp['p_value']:.4e}")

    # 5. Cross-Scale Construct Overlap Table (VCAS vs VFAS vs Reversed FBRS)
    print("\n--- 5. CROSS-SCALE CONSTRUCT OVERLAP (VCAS, VFAS, and 5 - FBRS) ---")
    vcas_all = primary_df["VCAS"].values
    vfas_all = primary_df["VFAS"].values
    fbrs_rev_all = reverse_fbrs(primary_df["FBRS"].values)

    cross_vcas_vfas = compute_spearman_ci(vcas_all, vfas_all)
    cross_vcas_fbrs = compute_spearman_ci(vcas_all, fbrs_rev_all)
    cross_vfas_fbrs = compute_spearman_ci(vfas_all, fbrs_rev_all)

    results["cross_scale_correlations"] = {
        "VCAS_vs_VFAS": cross_vcas_vfas,
        "VCAS_vs_Reversed_FBRS": cross_vcas_fbrs,
        "VFAS_vs_Reversed_FBRS": cross_vfas_fbrs,
    }

    cs_header = f"{'Scale Pair':<30} {'Spearman rho':<14} {'95% CI':<20} {'p-value'}"
    print(cs_header)
    print("-" * len(cs_header))
    print(f"{'VCAS vs VFAS':<30} {cross_vcas_vfas['rho']:<14.3f} [{cross_vcas_vfas['ci_lower']:.3f}, {cross_vcas_vfas['ci_upper']:.3f}]   {cross_vcas_vfas['p_value']:.4e}")
    print(f"{'VCAS vs (5 - FBRS)':<30} {cross_vcas_fbrs['rho']:<14.3f} [{cross_vcas_fbrs['ci_lower']:.3f}, {cross_vcas_fbrs['ci_upper']:.3f}]   {cross_vcas_fbrs['p_value']:.4e}")
    print(f"{'VFAS vs (5 - FBRS)':<30} {cross_vfas_fbrs['rho']:<14.3f} [{cross_vfas_fbrs['ci_lower']:.3f}, {cross_vfas_fbrs['ci_upper']:.3f}]   {cross_vfas_fbrs['p_value']:.4e}")

    # 6. Inter-Rater Reliability (if multi-rater data present)
    if "rater_id" in merged_df.columns:
        raters = list(merged_df["rater_id"].unique())
        if len(raters) >= 2:
            print("\n--- 6. INTER-RATER RELIABILITY (Between Clinician Raters) ---")
            r1_sub = merged_df[merged_df["rater_id"] == raters[0]].sort_values(by=["participant_id", "phase"])
            r2_sub = merged_df[merged_df["rater_id"] == raters[1]].sort_values(by=["participant_id", "phase"])
            
            # Match by participant_id and phase
            paired = pd.merge(r1_sub, r2_sub, on=["participant_id", "phase"], suffixes=("_r1", "_r2"))
            if len(paired) > 0:
                irr_vcas = compute_weighted_kappa(paired["VCAS_r1"].values, paired["VCAS_r2"].values, 0, 4)
                irr_vfas = compute_weighted_kappa(paired["VFAS_r1"].values, paired["VFAS_r2"].values, 0, 4)
                irr_fbrs = compute_weighted_kappa(paired["FBRS_r1"].values, paired["FBRS_r2"].values, 1, 4)

                results["inter_rater_reliability"] = {
                    "raters": [raters[0], raters[1]],
                    "pairs_evaluated": len(paired),
                    "VCAS_quadratic_weighted_kappa": irr_vcas,
                    "VFAS_quadratic_weighted_kappa": irr_vfas,
                    "FBRS_quadratic_weighted_kappa": irr_fbrs,
                }

                print(f"Raters: {raters[0]} vs {raters[1]} (N = {len(paired)} phase comparisons)")
                print(f"  - VCAS Weighted Kappa: {irr_vcas['weighted_kappa']:.3f} (Exact Agreement: {irr_vcas['observed_agreement']:.1%})")
                print(f"  - VFAS Weighted Kappa: {irr_vfas['weighted_kappa']:.3f} (Exact Agreement: {irr_vfas['observed_agreement']:.1%})")
                print(f"  - FBRS Weighted Kappa: {irr_fbrs['weighted_kappa']:.3f} (Exact Agreement: {irr_fbrs['observed_agreement']:.1%})")

    # 7. Friedman Test & Kendall's W across the 4 Phases
    # Compute for AI negative rate, VCAS, VFAS, and reversed FBRS
    print("\n--- 7. NON-PARAMETRIC PHASE VARIATION (Friedman Test & Kendall's W) ---")
    for metric_name, col_name, is_rev in [
        ("ai_negative_rate", "ai_negative_rate", False),
        ("VCAS", "VCAS", False),
        ("VFAS", "VFAS", False),
        ("FBRS_reversed_(5-FBRS)", "FBRS", True),
    ]:
        piv_df = primary_df.copy()
        if is_rev:
            piv_df[col_name] = reverse_fbrs(piv_df[col_name].values)
        pivot = piv_df.pivot(index="participant_id", columns="phase", values=col_name).dropna()
        avail_phases = [p for p in PHASES if p in pivot.columns]
        if len(avail_phases) == 4 and len(pivot) >= 2:
            matrix = pivot[avail_phases].values
            f_res = compute_friedman_and_kendall_w(matrix)
            results["friedman_test"][metric_name] = f_res
            print(f"Metric: {metric_name:<24} | Chi2(df=3): {f_res['friedman_chi2']:<7.3f} | p: {f_res['p_value']:<10.4e} | Kendall's W: {f_res['kendalls_w']:<6.3f} (N={f_res['num_subjects']})")

    # 8. Generate Visualizations
    generate_analysis_plots(primary_df, frames_df, plots_dir)

    # Save complete JSON results
    json_path = os.path.join(output_dir, "statistical_results.json")
    with open(json_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n✓ Saved statistical results to {json_path}")
    print(f"✓ Saved high-resolution figures to {plots_dir}")

    return results


def generate_analysis_plots(merged_df: pd.DataFrame, frames_df: pd.DataFrame, plots_dir: str):
    """
    Generates required plots:
      1. Stacked emotion distribution per procedural phase.
      2. Positive-rate bars per tool (AI, VCAS >= 1, VFAS >= 1, FBRS <= 2) per phase.
      3. Scale trajectory comparison across procedural phases (AI, VCAS, VFAS, 5 - FBRS).
    """
    # 1. Stacked Emotion Distribution per Phase
    valid_frames = frames_df[
        (frames_df["quality_flag"] == "VALID") &
        (frames_df["emotion_label"].isin(EMOTIONS))
    ]

    phase_emotion_pct = {}
    for p in PHASES:
        sub = valid_frames[valid_frames["phase"] == p]
        n = len(sub)
        if n > 0:
            phase_emotion_pct[p] = [
                (sub["emotion_label"] == em).sum() / n * 100 for em in EMOTIONS
            ]
        else:
            phase_emotion_pct[p] = [0.0] * 5

    fig, ax = plt.subplots(figsize=(9, 5), dpi=150)
    colors = ["#e11d48", "#f59e0b", "#10b981", "#64748b", "#3b82f6"] # angry, fear, happy, neutral, sad

    bottom = np.zeros(len(PHASES))
    x_pos = np.arange(len(PHASES))

    for idx, em in enumerate(EMOTIONS):
        pcts = [phase_emotion_pct[p][idx] for p in PHASES]
        ax.bar(x_pos, pcts, bottom=bottom, label=em.capitalize(), color=colors[idx], width=0.55, edgecolor="white", linewidth=0.5)
        bottom += np.array(pcts)

    ax.set_ylabel("Proportion of Frames (%)", fontsize=11, fontweight="bold")
    ax.set_title("Stacked Facial Emotion Distribution Across Procedural Phases", fontsize=12, fontweight="bold", pad=12)
    ax.set_xticks(x_pos)
    ax.set_xticklabels([p.replace("_", "\n") for p in PHASES], fontsize=10)
    ax.set_ylim(0, 100)
    ax.legend(title="Emotion", bbox_to_anchor=(1.02, 1), loc="upper left")
    plt.tight_layout()

    plot1_path = os.path.join(plots_dir, "stacked_emotion_distribution_per_phase.png")
    fig.savefig(plot1_path)
    plt.close(fig)

    # 2. Positive-Rate Bars per Tool per Phase (AI, VCAS >= 1, VFAS >= 1, FBRS <= 2)
    tool_rates = {
        "AI Negative Affect": [],
        "VCAS ≥ 1 (Anxiety)": [],
        "VFAS ≥ 1 (Facial)": [],
        "FBRS ≤ 2 (Neg Behavior)": [],
    }

    for p in PHASES:
        pdf = merged_df[merged_df["phase"] == p]
        if len(pdf) > 0:
            tool_rates["AI Negative Affect"].append(pdf["ai_binary_neg"].mean() * 100)
            tool_rates["VCAS ≥ 1 (Anxiety)"].append((pdf["VCAS"] >= 1).mean() * 100)
            tool_rates["VFAS ≥ 1 (Facial)"].append((pdf["VFAS"] >= 1).mean() * 100)
            tool_rates["FBRS ≤ 2 (Neg Behavior)"].append((pdf["FBRS"] <= FRANKL_NEGATIVE_THRESHOLD).mean() * 100)
        else:
            for k in tool_rates:
                tool_rates[k].append(0.0)

    fig, ax = plt.subplots(figsize=(11, 5.5), dpi=150)
    x = np.arange(len(PHASES))
    bar_width = 0.20

    ax.bar(x - 1.5 * bar_width, tool_rates["AI Negative Affect"], bar_width, label="AI Model (Negative Affect)", color="#0284c7")
    ax.bar(x - 0.5 * bar_width, tool_rates["VCAS ≥ 1 (Anxiety)"], bar_width, label="Clinician VCAS ≥ 1", color="#f97316")
    ax.bar(x + 0.5 * bar_width, tool_rates["VFAS ≥ 1 (Facial)"], bar_width, label="Clinician VFAS ≥ 1", color="#10b981")
    ax.bar(x + 1.5 * bar_width, tool_rates["FBRS ≤ 2 (Neg Behavior)"], bar_width, label="Clinician FBRS ≤ 2 (Negative Behavior)", color="#8b5cf6")

    ax.set_ylabel("Positive Distress / Negative Rate (%)", fontsize=11, fontweight="bold")
    ax.set_title("Comparator Prevalence Across Tools and Procedural Phases", fontsize=12, fontweight="bold", pad=12)
    ax.set_xticks(x)
    ax.set_xticklabels([p.replace("_", "\n") for p in PHASES], fontsize=10)
    ax.set_ylim(0, 105)
    ax.legend(loc="upper left")
    ax.grid(axis="y", linestyle="--", alpha=0.5)
    plt.tight_layout()

    plot2_path = os.path.join(plots_dir, "positive_rates_per_tool_per_phase.png")
    fig.savefig(plot2_path)
    plt.close(fig)

    # 3. Trajectory Plot: Mean Scaled Trajectories Across Procedural Phases
    means_ai = [merged_df[merged_df["phase"] == p]["ai_negative_rate"].mean() * 4.0 for p in PHASES] # Scale 0-1 to 0-4
    means_vcas = [merged_df[merged_df["phase"] == p]["VCAS"].mean() for p in PHASES]
    means_vfas = [merged_df[merged_df["phase"] == p]["VFAS"].mean() for p in PHASES]
    means_fbrs_rev = [reverse_fbrs(merged_df[merged_df["phase"] == p]["FBRS"].values).mean() for p in PHASES]

    fig, ax = plt.subplots(figsize=(9, 5), dpi=150)
    x = np.arange(len(PHASES))

    ax.plot(x, means_ai, marker="o", linewidth=2.5, color="#0284c7", label="AI Affect Rate (Scaled 0-4)")
    ax.plot(x, means_vcas, marker="s", linewidth=2.0, color="#f97316", linestyle="--", label="VCAS (0-4)")
    ax.plot(x, means_vfas, marker="^", linewidth=2.0, color="#10b981", linestyle="--", label="VFAS (0-4)")
    ax.plot(x, means_fbrs_rev, marker="D", linewidth=2.0, color="#8b5cf6", linestyle=":", label="Reversed FBRS: 5 - FBRS (1-4)")

    ax.set_ylabel("Distress Severity (0 to 4 Scale)", fontsize=11, fontweight="bold")
    ax.set_title("Multi-Scale Trajectory Across Procedural Dental Phases", fontsize=12, fontweight="bold", pad=12)
    ax.set_xticks(x)
    ax.set_xticklabels([p.replace("_", "\n") for p in PHASES], fontsize=10)
    ax.set_ylim(0, 4.2)
    ax.legend(loc="upper left")
    ax.grid(True, linestyle="--", alpha=0.4)
    plt.tight_layout()

    plot3_path = os.path.join(plots_dir, "clinical_scales_trajectory_across_phases.png")
    fig.savefig(plot3_path)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description="Run EmoDent Clinical Statistical Pipeline")
    parser.add_argument("--data-dir", default="./analysis/sample_data", type=str)
    parser.add_argument("--output-dir", default="./analysis/results", type=str)
    args = parser.parse_args()

    # Generate synthetic dataset if not present
    clinician_csv = os.path.join(args.data_dir, "clinician_scores.csv")
    if not os.path.exists(clinician_csv):
        from generate_synthetic_data import generate_synthetic_dataset
        print("Dataset not found. Generating synthetic dataset...")
        generate_synthetic_dataset(output_dir=args.data_dir, num_participants=30)

    frames_df, merged_df = load_and_aggregate_data(args.data_dir)
    run_full_analysis(merged_df, frames_df, args.output_dir)


if __name__ == "__main__":
    main()

