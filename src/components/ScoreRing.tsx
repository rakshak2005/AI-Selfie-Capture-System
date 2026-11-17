interface ScoreRingProps {
  value: number;
  threshold: number;
  facePresent: boolean;
  holding: number;
  label: string;
}

const RADIUS = 88;
const CENTER = 100;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function ScoreRing({ value, threshold, facePresent, holding, label }: ScoreRingProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const offset = CIRCUMFERENCE * (1 - clamped / 100);
  const angle = (threshold / 100) * 360 - 90;
  const tickX = CENTER + RADIUS * Math.cos((angle * Math.PI) / 180);
  const tickY = CENTER + RADIUS * Math.sin((angle * Math.PI) / 180);
  const reached = clamped >= threshold;

  return (
    <div className="ring">
      <svg viewBox="0 0 200 200" className="ring__svg" aria-hidden="true">
        <defs>
          <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e4ffa6" />
            <stop offset="55%" stopColor="#c6f16d" />
            <stop offset="100%" stopColor="#8ed94f" />
          </linearGradient>
        </defs>
        <circle cx={CENTER} cy={CENTER} r={RADIUS} className="ring__track" />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          className={`ring__progress ${reached ? "ring__progress--reached" : ""}`}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={facePresent ? offset : CIRCUMFERENCE}
        />
        <line
          x1={CENTER}
          y1={CENTER - RADIUS - 4}
          x2={CENTER}
          y2={CENTER - RADIUS + 4}
          className="ring__threshold"
          transform={`rotate(${threshold * 3.6} ${CENTER} ${CENTER})`}
        />
        <circle cx={tickX} cy={tickY} r="2.4" className="ring__threshold-dot" />
      </svg>

      <div className="ring__center">
        <div className="ring__value">
          {facePresent ? Math.round(clamped) : "--"}
          <span className="ring__percent">%</span>
        </div>
        <div className="ring__label">{facePresent ? label : "No face detected"}</div>
        <div className="ring__hold" aria-hidden="true" style={{ opacity: holding > 0 ? 1 : 0 }}>
          <span style={{ transform: `scaleX(${Math.min(1, Math.max(0, holding))})` }} />
        </div>
      </div>
    </div>
  );
}
