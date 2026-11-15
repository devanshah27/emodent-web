"""
Pytest unit tests for statistical functions in analysis/metrics.py.
Includes tests for:
  - 2x2 confusion matrix
  - Cohen's Kappa, PABAK, Gwet's AC1
  - High prevalence warning
  - Spearman rho with Fisher z 95% CI
  - Friedman test & Kendall's W across procedural phases
  - Frankl Behavior Rating Scale (FBRS) reversal logic (5 - FBRS)
  - FBRS threshold binarization (FBRS <= 2)
  - Quadratic Weighted Kappa for ordinal inter-rater reliability
"""

import numpy as np
import pytest
from metrics import (
    compute_confusion_matrix_2x2,
    compute_agreement_metrics,
    compute_spearman_ci,
    compute_friedman_and_kendall_w,
    reverse_fbrs,
    is_fbrs_negative,
    compute_weighted_kappa,
    FRANKL_NEGATIVE_THRESHOLD,
)


def test_confusion_matrix_2x2():
    y_true = np.array([1, 1, 0, 0, 1])
    y_pred = np.array([1, 0, 0, 1, 1])
    cm = compute_confusion_matrix_2x2(y_true, y_pred)
    assert cm["TP"] == 2
    assert cm["FP"] == 1
    assert cm["FN"] == 1
    assert cm["TN"] == 1
    assert cm["total"] == 5


def test_agreement_metrics_perfect_concordance():
    y_true = np.array([1, 0, 1, 0, 1, 0, 1, 0])
    y_pred = np.array([1, 0, 1, 0, 1, 0, 1, 0])
    res = compute_agreement_metrics(y_true, y_pred)

    assert res["observed_agreement"] == 1.0
    assert res["cohens_kappa"] == 1.0
    assert res["pabak"] == 1.0
    assert res["gwets_ac1"] == 1.0
    assert res["sensitivity"] == 1.0
    assert res["specificity"] == 1.0
    assert res["high_prevalence_warning"] is False


def test_agreement_metrics_high_prevalence_warning():
    # 95% prevalence of 1s (e.g. 19 ones out of 20)
    y_true = np.array([1]*19 + [0])
    y_pred = np.array([1]*18 + [0, 0]) # only 1 mismatch
    res = compute_agreement_metrics(y_true, y_pred)

    # High prevalence warning should trigger
    assert res["high_prevalence_warning"] is True
    assert "HIGH PREVALENCE WARNING" in res["warning_message"]
    # PABAK and Gwet's AC1 should handle the prevalence paradox much better than Kappa
    assert res["gwets_ac1"] > res["cohens_kappa"]


def test_spearman_ci():
    # Perfect positive monotonic correlation
    x = np.array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0])
    y = np.array([1.5, 3.2, 4.1, 5.8, 7.2, 8.9, 10.1, 12.0, 14.2, 16.5])

    res = compute_spearman_ci(x, y)
    assert res["rho"] == 1.0
    assert res["p_value"] < 0.001
    assert res["ci_lower"] > 0.90
    assert res["ci_upper"] <= 1.0


def test_friedman_and_kendall_w():
    # 5 subjects evaluated across 4 procedural phases with consistent increase
    # e.g., Pre-treatment < Anesthesia < Extraction > Post-treatment
    matrix = np.array([
        [0.1, 0.7, 0.8, 0.2],
        [0.0, 0.8, 0.9, 0.1],
        [0.2, 0.6, 0.7, 0.3],
        [0.1, 0.9, 0.8, 0.2],
        [0.0, 0.7, 0.9, 0.1],
    ])

    res = compute_friedman_and_kendall_w(matrix)
    assert res["num_subjects"] == 5
    assert res["num_phases"] == 4
    assert res["friedman_chi2"] > 0
    assert res["p_value"] < 0.05
    # High concordance should result in high Kendall's W (> 0.7)
    assert res["kendalls_w"] > 0.70


def test_fbrs_reversal_logic():
    # Test reverse orientation logic: 5 - FBRS
    raw_fbrs = np.array([1, 2, 3, 4])
    reversed_fbrs = reverse_fbrs(raw_fbrs)
    
    # 1 (Definitely negative) -> 4 (highest distress/uncooperative)
    # 2 (Negative) -> 3
    # 3 (Positive) -> 2
    # 4 (Definitely positive) -> 1 (lowest distress)
    np.testing.assert_array_equal(reversed_fbrs, np.array([4.0, 3.0, 2.0, 1.0]))


def test_fbrs_threshold_binarization():
    assert FRANKL_NEGATIVE_THRESHOLD == 2
    scores = np.array([1, 2, 3, 4])
    binary_neg = is_fbrs_negative(scores)
    # 1 and 2 count as negative behavior present (1)
    # 3 and 4 count as cooperative / positive (0)
    np.testing.assert_array_equal(binary_neg, np.array([1, 1, 0, 0]))


def test_weighted_kappa_inter_rater():
    r1 = np.array([0, 1, 2, 3, 4, 1, 2, 3])
    r2 = np.array([0, 1, 2, 3, 4, 1, 2, 3])
    # Perfect agreement
    res = compute_weighted_kappa(r1, r2, 0, 4)
    assert res["weighted_kappa"] == 1.0
    assert res["observed_agreement"] == 1.0

    # Minor 1-point difference has high weighted kappa
    r3 = np.array([0, 1, 2, 3, 3, 1, 2, 3])
    res_minor = compute_weighted_kappa(r1, r3, 0, 4)
    assert res_minor["weighted_kappa"] > 0.85



def test_confusion_matrix_2x2():
    y_true = np.array([1, 1, 0, 0, 1])
    y_pred = np.array([1, 0, 0, 1, 1])
    cm = compute_confusion_matrix_2x2(y_true, y_pred)
    assert cm["TP"] == 2
    assert cm["FP"] == 1
    assert cm["FN"] == 1
    assert cm["TN"] == 1
    assert cm["total"] == 5


def test_agreement_metrics_perfect_concordance():
    y_true = np.array([1, 0, 1, 0, 1, 0, 1, 0])
    y_pred = np.array([1, 0, 1, 0, 1, 0, 1, 0])
    res = compute_agreement_metrics(y_true, y_pred)

    assert res["observed_agreement"] == 1.0
    assert res["cohens_kappa"] == 1.0
    assert res["pabak"] == 1.0
    assert res["gwets_ac1"] == 1.0
    assert res["sensitivity"] == 1.0
    assert res["specificity"] == 1.0
    assert res["high_prevalence_warning"] is False


def test_agreement_metrics_high_prevalence_warning():
    # 95% prevalence of 1s (e.g. 19 ones out of 20)
    y_true = np.array([1]*19 + [0])
    y_pred = np.array([1]*18 + [0, 0]) # only 1 mismatch
    res = compute_agreement_metrics(y_true, y_pred)

    # High prevalence warning should trigger
    assert res["high_prevalence_warning"] is True
    assert "HIGH PREVALENCE WARNING" in res["warning_message"]
    # PABAK and Gwet's AC1 should handle the prevalence paradox much better than Kappa
    assert res["gwets_ac1"] > res["cohens_kappa"]


def test_spearman_ci():
    # Perfect positive monotonic correlation
    x = np.array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0])
    y = np.array([1.5, 3.2, 4.1, 5.8, 7.2, 8.9, 10.1, 12.0, 14.2, 16.5])

    res = compute_spearman_ci(x, y)
    assert res["rho"] == 1.0
    assert res["p_value"] < 0.001
    assert res["ci_lower"] > 0.90
    assert res["ci_upper"] <= 1.0


def test_friedman_and_kendall_w():
    # 5 subjects evaluated across 4 procedural phases with consistent increase
    # e.g., Pre-treatment < Anesthesia < Extraction > Post-treatment
    matrix = np.array([
        [0.1, 0.7, 0.8, 0.2],
        [0.0, 0.8, 0.9, 0.1],
        [0.2, 0.6, 0.7, 0.3],
        [0.1, 0.9, 0.8, 0.2],
        [0.0, 0.7, 0.9, 0.1],
    ])

    res = compute_friedman_and_kendall_w(matrix)
    assert res["num_subjects"] == 5
    assert res["num_phases"] == 4
    assert res["friedman_chi2"] > 0
    assert res["p_value"] < 0.05
    # High concordance should result in high Kendall's W (> 0.7)
    assert res["kendalls_w"] > 0.70

