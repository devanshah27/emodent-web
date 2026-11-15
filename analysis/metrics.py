"""
Statistical Metrics and Agreement Calculations for EmoDent Clinical Validation.
Implements:
- Cohen's Kappa, PABAK, Gwet's AC1
- Sensitivity, Specificity, PPV, NPV, 2x2 Confusion Table
- Spearman's rho with 95% Confidence Interval (Fisher z-transform)
- Friedman test and Kendall's W across 4 procedural phases
- Automatic high-prevalence warning (Kappa paradox detector)
- Frankl Behavior Rating Scale (FBRS) reversal logic (5 - FBRS) and negative behavior threshold (FBRS <= 2)
- Quadratic Weighted Kappa for ordinal inter-rater reliability
- Cross-scale correlation matrix with construct overlap analysis
"""

from typing import Dict, Any, Tuple, Optional, List
import numpy as np
import scipy.stats as stats

# Frankl Behavior Rating Scale (1 to 4) is reverse-oriented relative to VCAS and VFAS.
# Lower score = worse behavior. FBRS <= 2 indicates negative behavior present.
FRANKL_NEGATIVE_THRESHOLD = 2


def reverse_fbrs(fbrs_scores: np.ndarray) -> np.ndarray:
    """
    Reverses the Frankl Behavior Rating Scale: reversed = 5 - FBRS.
    After reversal:
      1 (Definitely positive) -> 4 (distress-equivalent: low)
      4 (Definitely negative) -> 1 (distress-equivalent: high)
    Specifically:
      Raw FBRS 4 (++) -> 1
      Raw FBRS 3 (+)  -> 2
      Raw FBRS 2 (-)  -> 3
      Raw FBRS 1 (--) -> 4
    Higher reversed value represents more uncooperative/negative behavior,
    making the direction and sign directly comparable with VCAS (0-4) and VFAS (0-4).
    """
    fbrs_arr = np.asarray(fbrs_scores, dtype=float)
    return 5.0 - fbrs_arr


def is_fbrs_negative(fbrs_scores: np.ndarray) -> np.ndarray:
    """
    Binarizes Frankl Behavior Rating Scale:
    FBRS <= 2 counts as "negative behavior present" (1),
    FBRS >= 3 counts as "positive/cooperative behavior" (0).
    """
    fbrs_arr = np.asarray(fbrs_scores)
    return (fbrs_arr <= FRANKL_NEGATIVE_THRESHOLD).astype(int)


def compute_weighted_kappa(
    rater1: np.ndarray,
    rater2: np.ndarray,
    min_val: int = 0,
    max_val: int = 4
) -> Dict[str, Any]:
    """
    Computes Quadratic Weighted Kappa (Fleiss-Cohen) for ordinal clinical scales.
    Used for inter-rater reliability between clinician raters.
    """
    r1 = np.asarray(rater1).astype(int)
    r2 = np.asarray(rater2).astype(int)
    n = len(r1)

    if n == 0 or len(r2) != n:
        return {"weighted_kappa": 0.0, "n": n, "observed_agreement": 0.0}

    k = max_val - min_val + 1
    # Build confusion matrix
    O = np.zeros((k, k), dtype=float)
    for val1, val2 in zip(r1, r2):
        i = int(np.clip(val1 - min_val, 0, k - 1))
        j = int(np.clip(val2 - min_val, 0, k - 1))
        O[i, j] += 1.0

    # Quadratic weight matrix
    w = np.zeros((k, k), dtype=float)
    for i in range(k):
        for j in range(k):
            w[i, j] = 1.0 - ((i - j) ** 2) / float((k - 1) ** 2)

    r1_counts = np.sum(O, axis=1)
    r2_counts = np.sum(O, axis=0)
    E = np.outer(r1_counts, r2_counts) / max(n, 1)

    po = np.sum(w * O) / max(n, 1)
    pe = np.sum(w * E) / max(n, 1)

    if abs(1.0 - pe) < 1e-12:
        kappa = 1.0 if abs(po - 1.0) < 1e-12 else 0.0
    else:
        kappa = float(np.clip((po - pe) / (1.0 - pe), -1.0, 1.0))

    exact_agreement = np.trace(O) / max(n, 1)

    return {
        "weighted_kappa": round(kappa, 4),
        "observed_agreement": round(float(exact_agreement), 4),
        "weighted_po": round(float(po), 4),
        "weighted_pe": round(float(pe), 4),
        "n": n,
    }


def compute_confusion_matrix_2x2(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, int]:
    """
    Computes 2x2 contingency table elements:
      TP: true = 1, pred = 1
      FP: true = 0, pred = 1
      FN: true = 1, pred = 0
      TN: true = 0, pred = 0
    """
    y_true = np.asarray(y_true).astype(int)
    y_pred = np.asarray(y_pred).astype(int)

    tp = int(np.sum((y_true == 1) & (y_pred == 1)))
    fp = int(np.sum((y_true == 0) & (y_pred == 1)))
    fn = int(np.sum((y_true == 1) & (y_pred == 0)))
    tn = int(np.sum((y_true == 0) & (y_pred == 0)))

    return {"TP": tp, "FP": fp, "FN": fn, "TN": tn, "total": len(y_true)}


def compute_agreement_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, Any]:
    """
    Computes agreement statistics between binary raters:
      - Observed Agreement (Po)
      - Cohen's Kappa (kappa)
      - PABAK (Prevalence-Adjusted Bias-Adjusted Kappa)
      - Gwet's AC1
      - Sensitivity, Specificity, PPV, NPV
      - High-prevalence warning if positive rate > 90% or < 10%
    """
    cm = compute_confusion_matrix_2x2(y_true, y_pred)
    tp, fp, fn, tn, n = cm["TP"], cm["FP"], cm["FN"], cm["TN"], cm["total"]

    if n == 0:
        return {"error": "Empty dataset"}

    # 1. Observed agreement
    p_o = (tp + tn) / n

    # 2. Cohen's Kappa
    p_true_pos = (tp + fn) / n
    p_true_neg = (fp + tn) / n
    p_pred_pos = (tp + fp) / n
    p_pred_neg = (fn + tn) / n

    p_e_kappa = (p_true_pos * p_pred_pos) + (p_true_neg * p_pred_neg)
    if abs(1.0 - p_e_kappa) < 1e-12:
        kappa = 1.0 if abs(p_o - 1.0) < 1e-12 else 0.0
    else:
        kappa = (p_o - p_e_kappa) / (1.0 - p_e_kappa)

    # 3. PABAK: Prevalence-Adjusted Bias-Adjusted Kappa
    pabak = 2.0 * p_o - 1.0

    # 4. Gwet's AC1
    # pi is average probability that an item is classified as positive
    pi = (p_true_pos + p_pred_pos) / 2.0
    p_e_gwet = 2.0 * pi * (1.0 - pi)
    if abs(1.0 - p_e_gwet) < 1e-12:
        gwet_ac1 = 1.0
    else:
        gwet_ac1 = (p_o - p_e_gwet) / (1.0 - p_e_gwet)

    # 5. Diagnostic metrics
    sens = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    spec = tn / (fp + tn) if (fp + tn) > 0 else 0.0
    ppv = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    npv = tn / (fn + tn) if (fn + tn) > 0 else 0.0

    # 6. High prevalence check (> 90% or < 10% in either rater)
    high_prevalence_warning = False
    warning_message = None
    if p_true_pos > 0.90 or p_pred_pos > 0.90 or p_true_pos < 0.10 or p_pred_pos < 0.10:
        high_prevalence_warning = True
        warning_message = (
            f"HIGH PREVALENCE WARNING: Positive prevalence ({p_true_pos:.1%}) exceeds 90% or is under 10%. "
            "Cohen's kappa suffers from the prevalence paradox and may be severely suppressed despite high agreement. "
            "Do NOT present Gwet's AC1 alone as proof of accuracy; evaluate sensitivity, specificity, and confusion table."
        )

    return {
        "confusion_matrix": {"TP": tp, "FP": fp, "FN": fn, "TN": tn, "N": n},
        "observed_agreement": round(float(p_o), 4),
        "cohens_kappa": round(float(kappa), 4),
        "pabak": round(float(pabak), 4),
        "gwets_ac1": round(float(gwet_ac1), 4),
        "sensitivity": round(float(sens), 4),
        "specificity": round(float(spec), 4),
        "ppv": round(float(ppv), 4),
        "npv": round(float(npv), 4),
        "true_positive_rate": round(float(p_true_pos), 4),
        "pred_positive_rate": round(float(p_pred_pos), 4),
        "high_prevalence_warning": high_prevalence_warning,
        "warning_message": warning_message,
    }


def compute_spearman_ci(x: np.ndarray, y: np.ndarray, alpha: float = 0.05) -> Dict[str, Any]:
    """
    Computes Spearman's rank correlation coefficient rho with 95% Confidence Interval
    using Fisher's z-transformation.
    """
    x = np.asarray(x)
    y = np.asarray(y)
    n = len(x)

    if n < 4:
        return {"rho": 0.0, "p_value": 1.0, "ci_lower": 0.0, "ci_upper": 0.0, "n": n}

    rho, p_val = stats.spearmanr(x, y)
    if np.isnan(rho):
        rho = 0.0
        p_val = 1.0

    # Clip rho slightly within (-1, 1) to avoid arctanh singularity
    rho_clipped = np.clip(rho, -0.99999, 0.99999)
    z = np.arctanh(rho_clipped)
    se = 1.0 / np.sqrt(n - 3)
    z_crit = stats.norm.ppf(1.0 - alpha / 2.0)

    z_lower = z - z_crit * se
    z_upper = z + z_crit * se

    ci_lower = np.tanh(z_lower)
    ci_upper = np.tanh(z_upper)

    return {
        "rho": round(float(rho), 4),
        "p_value": float(p_val),
        "ci_lower": round(float(ci_lower), 4),
        "ci_upper": round(float(ci_upper), 4),
        "n": n,
    }


def compute_friedman_and_kendall_w(matrix: np.ndarray) -> Dict[str, Any]:
    """
    Computes Friedman test and Kendall's W concordance coefficient across phases.
    matrix shape: [N_subjects, K_phases] (typically K = 4)
    Kendall's W = chi2_friedman / (N * (K - 1))
    """
    matrix = np.asarray(matrix)
    n_subjects, k_phases = matrix.shape

    if n_subjects < 2 or k_phases < 2:
        return {"statistic": 0.0, "p_value": 1.0, "kendalls_w": 0.0}

    # Pass individual phase columns to scipy.stats.friedmanchisquare
    phase_cols = [matrix[:, i] for i in range(k_phases)]
    res = stats.friedmanchisquare(*phase_cols)

    stat = float(res.statistic)
    p_val = float(res.pvalue)

    # Kendall's W concordance coefficient
    kendall_w = stat / (n_subjects * (k_phases - 1))
    kendall_w = float(np.clip(kendall_w, 0.0, 1.0))

    return {
        "friedman_chi2": round(stat, 4),
        "p_value": p_val,
        "kendalls_w": round(kendall_w, 4),
        "num_subjects": n_subjects,
        "num_phases": k_phases,
    }

