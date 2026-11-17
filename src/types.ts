export type CaptureSource = "manual" | "auto";

export interface Capture {
  id: string;
  dataUrl: string;
  smile: number;
  createdAt: number;
  width: number;
  height: number;
  source: CaptureSource;
}

export interface ValidationResult {
  /** Held-out accuracy as a percentage, e.g. 96.4 */
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  threshold: number;
  /** Scores from the 60% calibration split, grouped by class. */
  tp: number;
  tn: number;
  fp: number;
  fn: number;
  neutralMean: number;
  smileMean: number;
  neutralSamples: number;
  smileSamples: number;
  evaluatedSamples: number;
  capturedAt: number;
}

export interface SmileReading {
  score: number;
  raw: number;
  blendshape: number;
  cornerLift: number;
  widthRatio: number;
  facePresent: boolean;
  brightness: number;
}
