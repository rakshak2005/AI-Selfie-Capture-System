import type { ValidationResult } from "../types";

export interface ScoreSample {
  score: number;
  t: number;
}

const VALIDATION_KEY = "smile-studio.validation.v2";
const THRESHOLD_KEY = "smile-studio.capture-threshold.v1";
export const DEFAULT_THRESHOLD = 68;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Choose the decision threshold on the first 60% of each recording, then
 * score it on the untouched 40% that follows. Keeping the split temporal
 * avoids grading the classifier on the same frames that tuned it.
 */
export function evaluateValidation(neutral: ScoreSample[], smile: ScoreSample[]): ValidationResult {
  const orderedNeutral = [...neutral].sort((a, b) => a.t - b.t);
  const orderedSmile = [...smile].sort((a, b) => a.t - b.t);

  if (orderedNeutral.length < 5 || orderedSmile.length < 5) {
    throw new Error("Not enough samples were collected. Keep your face in frame for the whole test.");
  }

  const split = (samples: ScoreSample[]) => {
    const cut = Math.max(1, Math.floor(samples.length * 0.6));
    return {
      calibration: samples.slice(0, cut).map((sample) => sample.score),
      evaluation: samples.slice(cut).map((sample) => sample.score),
    };
  };

  const neutralSplit = split(orderedNeutral);
  const smileSplit = split(orderedSmile);

  const calibNeutral = neutralSplit.calibration;
  const calibSmile = smileSplit.calibration;
  const evalNeutral = neutralSplit.evaluation.length
    ? neutralSplit.evaluation
    : neutralSplit.calibration;
  const evalSmile = smileSplit.evaluation.length
    ? smileSplit.evaluation
    : smileSplit.calibration;

  // Pick the threshold with the best balanced accuracy on the calibration set.
  let bestThreshold = 0.6;
  let bestBalanced = -1;
  let bestMargin = -1;

  for (let threshold = 0.1; threshold <= 0.9501; threshold += 0.005) {
    const truePositive = calibSmile.filter((score) => score >= threshold).length;
    const trueNegative = calibNeutral.filter((score) => score < threshold).length;
    const sensitivity = truePositive / calibSmile.length;
    const specificity = trueNegative / calibNeutral.length;
    const balanced = (sensitivity + specificity) / 2;
    const margin = Math.abs(threshold - (mean(calibNeutral) + mean(calibSmile)) / 2);

    if (
      balanced > bestBalanced + 0.0001 ||
      (Math.abs(balanced - bestBalanced) <= 0.0001 && margin < bestMargin)
    ) {
      bestBalanced = balanced;
      bestThreshold = threshold;
      bestMargin = margin;
    }
  }

  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;

  for (const score of evalSmile) {
    if (score >= bestThreshold) tp += 1;
    else fn += 1;
  }
  for (const score of evalNeutral) {
    if (score >= bestThreshold) fp += 1;
    else tn += 1;
  }

  const evaluatedSamples = tp + tn + fp + fn;
  const accuracy = ((tp + tn) / Math.max(1, evaluatedSamples)) * 100;
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    accuracy: Math.round(accuracy * 10) / 10,
    precision: Math.round(precision * 1000) / 10,
    recall: Math.round(recall * 1000) / 10,
    f1: Math.round(f1 * 1000) / 10,
    threshold: Math.round(clamp(bestThreshold) * 100),
    tp,
    tn,
    fp,
    fn,
    neutralMean: Math.round(mean(orderedNeutral.map((sample) => sample.score)) * 100),
    smileMean: Math.round(mean(orderedSmile.map((sample) => sample.score)) * 100),
    neutralSamples: orderedNeutral.length,
    smileSamples: orderedSmile.length,
    evaluatedSamples,
    capturedAt: Date.now(),
  };
}

export function loadValidation(): ValidationResult | null {
  try {
    const raw = localStorage.getItem(VALIDATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ValidationResult;
    return typeof parsed?.accuracy === "number" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveValidation(result: ValidationResult): void {
  localStorage.setItem(VALIDATION_KEY, JSON.stringify(result));
}

export function loadThreshold(): number {
  const stored = Number(localStorage.getItem(THRESHOLD_KEY));
  return Number.isFinite(stored) && stored >= 35 && stored <= 95 ? stored : DEFAULT_THRESHOLD;
}

export function saveThreshold(value: number): void {
  localStorage.setItem(THRESHOLD_KEY, String(Math.round(value)));
}
