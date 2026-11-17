import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

/**
 * Landmark indices from the MediaPipe Face Mesh topology (478 points).
 * The landmarker maps these consistently for every face.
 */
export const LANDMARKS = {
  browTop: 10,
  chin: 152,
  rightEyeOuter: 33,
  leftEyeOuter: 263,
  rightCheek: 234,
  leftCheek: 454,
  mouthRight: 61,
  mouthLeft: 291,
  lipTopOuter: 0,
  lipBottomOuter: 17,
  lipTopInner: 13,
  lipBottomInner: 14,
} as const;

/** Outer face contour, used for the on-screen tracking outline. */
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400,
  377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

export type BlendshapeMap = Record<string, number>;

export interface FaceGeometry {
  score: number;
  blendshape: number;
  cornerLift: number;
  widthRatio: number;
  /** Face height relative to the frame height (0..1). */
  faceHeight: number;
  centerX: number;
  centerY: number;
  symmetry: number;
}

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

const distance = (a: NormalizedLandmark, b: NormalizedLandmark, aspect: number) =>
  Math.hypot((a.x - b.x) * aspect, a.y - b.y);

/**
 * Turn the raw MediaPipe result into a single calibrated smile score.
 *
 * The score fuses three independent signals so a single noisy cue cannot
 * trigger a capture:
 *  - ARKit-compatible blendshapes (mouthSmileLeft/Right) — 78%
 *  - mouth-corner elevation relative to the lip centreline — 14%
 *  - mouth width relative to inter-ocular distance — 8%
 */
export function analyzeSmile(
  landmarks: NormalizedLandmark[],
  blendshapes: BlendshapeMap | null,
  aspectRatio: number,
): FaceGeometry | null {
  if (landmarks.length < 455) return null;

  const aspect = aspectRatio > 0 ? aspectRatio : 4 / 3;
  const point = (index: number) => landmarks[index];
  const { mouthRight, mouthLeft, lipTopInner, lipBottomInner, browTop, chin } = LANDMARKS;

  const eyeSpan = distance(point(LANDMARKS.rightEyeOuter), point(LANDMARKS.leftEyeOuter), aspect);
  const mouthSpan = distance(point(mouthRight), point(mouthLeft), aspect);
  const faceSpan = distance(point(browTop), point(chin), aspect);
  if (eyeSpan < 0.01 || faceSpan < 0.05) return null;

  const mouthCenterY = (point(lipTopInner).y + point(lipBottomInner).y) / 2;
  const cornerY = (point(mouthRight).y + point(mouthLeft).y) / 2;

  // Positive when the corners sit above the lip centreline (a smile).
  const cornerLift = (mouthCenterY - cornerY) / faceSpan;
  const widthRatio = mouthSpan / eyeSpan;

  const liftScore = clamp((cornerLift - 0.004) / 0.09);
  const widthScore = clamp((widthRatio - 0.98) / 0.45);
  const geometry = 0.65 * liftScore + 0.35 * widthScore;

  const left = blendshapes?.mouthSmileLeft ?? 0;
  const right = blendshapes?.mouthSmileRight ?? 0;
  const symmetry = 1 - Math.abs(left - right);
  const smileBlend = blendshapes ? (left + right) / 2 : 0;

  // Fuse. Without blendshapes the geometric model still works, just softer.
  let fused = blendshapes
    ? 0.78 * smileBlend + 0.22 * geometry
    : 0.72 * geometry;
  fused *= 0.88 + 0.12 * symmetry;

  // A gentle S-curve gives the percentage a natural feel: faint smiles sit
  // in the 40s, genuine smiles in the 80-100 band.
  const curved = clamp(fused);
  const score = clamp(curved * curved * (3 - 2 * curved));

  const xs = landmarks.map((landmark) => landmark.x);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (point(browTop).y + point(chin).y) / 2;

  return {
    score,
    blendshape: smileBlend,
    cornerLift,
    widthRatio,
    faceHeight: faceSpan,
    centerX,
    centerY,
    symmetry,
  };
}

export function toBlendshapeMap(
  categories: Array<{ categoryName: string; score: number }> | undefined,
): BlendshapeMap | null {
  if (!categories || categories.length === 0) return null;
  const map: BlendshapeMap = {};
  for (const category of categories) {
    map[category.categoryName] = category.score;
  }
  return map;
}

export function clamp01(value: number): number {
  return clamp(value);
}
