const pad = (value: number) => String(value).padStart(2, "0");

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getDate()} ${date.toLocaleString("en-US", { month: "short" })} ${date.getFullYear()}, ${formatTime(timestamp)}`;
}

export function formatFileStamp(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function smileLabel(score: number, threshold: number): string {
  if (score >= 93) return "Radiant";
  if (score >= threshold) return "Beautiful smile";
  if (score >= threshold - 14) return "Almost there";
  if (score >= 22) return "A gentle smile";
  return "Neutral";
}

export function averageScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}
