import { useEffect, useRef, useState } from "react";
import type { EngineSnapshot } from "../hooks/useSmileEngine";
import type { ValidationResult } from "../types";
import { evaluateValidation, saveValidation } from "../lib/validation";
import type { ScoreSample } from "../lib/validation";
import { CloseIcon, ScanIcon, SparkIcon } from "./Icons";

type Phase = "intro" | "neutral" | "smile" | "result" | "error";

interface AccuracyTestProps {
  open: boolean;
  latestRef: { current: EngineSnapshot };
  onClose: () => void;
  onComplete: (result: ValidationResult) => void;
  hasResult: boolean;
}

const SEGMENT_MS = 6000;
const SMILE_DELAY_MS = 1100;

export default function AccuracyTest({ open, latestRef, onClose, onComplete, hasResult }: AccuracyTestProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [progress, setProgress] = useState(0);
  const [remaining, setRemaining] = useState(Math.ceil(SEGMENT_MS / 1000));
  const [liveScore, setLiveScore] = useState(0);
  const [faceVisible, setFaceVisible] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [errorText, setErrorText] = useState("");

  const neutralRef = useRef<ScoreSample[]>([]);
  const smileRef = useRef<ScoreSample[]>([]);

  useEffect(() => {
    if (!open) return;
    setPhase("intro");
    setProgress(0);
    setRemaining(Math.ceil(SEGMENT_MS / 1000));
    setResult(null);
    setErrorText("");
    setFaceVisible(false);
    neutralRef.current = [];
    smileRef.current = [];
  }, [open]);

  useEffect(() => {
    if (!open || (phase !== "neutral" && phase !== "smile")) return;

    let interval = 0;
    let delay = 0;
    let cancelled = false;
    const samples: ScoreSample[] = [];
    setProgress(0);
    setRemaining(Math.ceil(SEGMENT_MS / 1000));

    const begin = () => {
      const startedAt = performance.now();
      interval = window.setInterval(() => {
        if (cancelled) return;
        const elapsed = performance.now() - startedAt;
        const snapshot = latestRef.current;
        setFaceVisible(snapshot.facePresent);
        setLiveScore(snapshot.facePresent ? Math.round(snapshot.score * 100) : 0);
        if (snapshot.facePresent) samples.push({ score: snapshot.raw, t: elapsed });

        setProgress(Math.min(1, elapsed / SEGMENT_MS));
        setRemaining(Math.max(0, Math.ceil((SEGMENT_MS - elapsed) / 1000)));

        if (elapsed < SEGMENT_MS) return;

        window.clearInterval(interval);
        if (samples.length < 12) {
          setErrorText(
            "We could not see your face for most of that segment. Check the lighting, center your face, and try again.",
          );
          setPhase("error");
          return;
        }

        if (phase === "neutral") {
          neutralRef.current = samples;
          setPhase("smile");
          return;
        }

        smileRef.current = samples;
        try {
          const evaluation = evaluateValidation(neutralRef.current, samples);
          saveValidation(evaluation);
          onComplete(evaluation);
          setResult(evaluation);
          setPhase("result");
        } catch (error) {
          setErrorText(error instanceof Error ? error.message : "The accuracy test could not be completed.");
          setPhase("error");
        }
      }, 60);
    };

    if (phase === "smile") {
      delay = window.setTimeout(begin, SMILE_DELAY_MS);
    } else {
      begin();
    }

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearTimeout(delay);
    };
  }, [open, phase, latestRef, onComplete]);

  if (!open) return null;

  const active = phase === "neutral" || phase === "smile";
  const phaseTitle = phase === "neutral" ? "Keep a neutral face" : "Now smile, big";
  const phaseHint =
    phase === "neutral"
      ? "Relax your expression and look straight at the lens."
      : "Hold a natural, full smile until the timer ends.";

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="accuracy-title">
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__card">
        <button className="modal__close btn--icon" onClick={onClose} aria-label="Close accuracy test">
          <CloseIcon />
        </button>

        {phase === "intro" && (
          <div className="test-intro">
            <div className="badge badge--accent">
              <ScanIcon size={14} />
              Accuracy test
            </div>
            <h2 id="accuracy-title">Measure this detector, on your face.</h2>
            <p>
              A 12-second test records your neutral expression, then your smile. The first 60% of each recording
              tunes the decision threshold; the remaining 40% is held back to measure accuracy honestly.
            </p>
            <ol className="test-steps">
              <li>
                <span>1</span>
                <div>
                  <strong>Neutral · 6s</strong>
                  <p>Keep your face inside the tracking outline, expression relaxed.</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Smile · 6s</strong>
                  <p>Wait for the prompt, then hold your brightest natural smile.</p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>Report · instant</strong>
                  <p>Accuracy, precision, recall and F1 are saved into your project PDF.</p>
                </div>
              </li>
            </ol>
            <div className="modal__actions">
              <button className="btn btn--ghost" onClick={onClose}>
                Not now
              </button>
              <button className="btn btn--primary" onClick={() => setPhase("neutral")}>
                <SparkIcon size={15} />
                {hasResult ? "Run test again" : "Start test"}
              </button>
            </div>
          </div>
        )}

        {active && (
          <div className="test-live">
            <div className="badge">
              <span className={`dot ${faceVisible ? "dot--live" : "dot--idle"}`} />
              {faceVisible ? "Face detected" : "Face not detected"}
            </div>
            <h2 id="accuracy-title" className="test-live__title">
              {phase === "smile" && remaining === Math.ceil(SEGMENT_MS / 1000) ? "Get ready to smile" : phaseTitle}
            </h2>
            <p>{phaseHint}</p>

            <div className="test-live__timer">
              {remaining}
              <span>s</span>
            </div>

            <div className="test-live__bar" aria-hidden="true">
              <span style={{ transform: `scaleX(${progress})` }} />
            </div>

            <div className="test-live__row">
              <span>Segment {phase === "neutral" ? "1 of 2" : "2 of 2"}</span>
              <span className="test-live__score">{faceVisible ? `${liveScore}% live` : "waiting for a face"}</span>
            </div>

            <button className="btn btn--ghost btn--block" onClick={onClose}>
              Cancel test
            </button>
          </div>
        )}

        {phase === "error" && (
          <div className="test-intro">
            <div className="badge badge--warn">Test incomplete</div>
            <h2 id="accuracy-title">Let's try once more.</h2>
            <p>{errorText}</p>
            <div className="modal__actions">
              <button className="btn btn--ghost" onClick={onClose}>
                Close
              </button>
              <button className="btn btn--primary" onClick={() => setPhase("neutral")}>
                Restart test
              </button>
            </div>
          </div>
        )}

        {phase === "result" && result && (
          <div className="test-result">
            <div className="badge badge--accent">
              <ScanIcon size={14} />
              Validation complete
            </div>
            <div className="test-result__score">
              {result.accuracy.toFixed(1)}
              <span>%</span>
            </div>
            <p className="test-result__caption">Held-out accuracy on your camera</p>

            <div className="test-result__grid">
              <div>
                <span>Precision</span>
                <strong>{result.precision.toFixed(1)}%</strong>
              </div>
              <div>
                <span>Recall</span>
                <strong>{result.recall.toFixed(1)}%</strong>
              </div>
              <div>
                <span>F1 score</span>
                <strong>{result.f1.toFixed(1)}%</strong>
              </div>
              <div>
                <span>Threshold</span>
                <strong>{result.threshold}%</strong>
              </div>
            </div>

            <div className="test-result__matrix">
              <span />
              <span>Pred. neutral</span>
              <span>Pred. smile</span>
              <span>Neutral</span>
              <span>{result.tn}</span>
              <span>{result.fp}</span>
              <span>Smile</span>
              <span>{result.fn}</span>
              <span>{result.tp}</span>
            </div>

            <p className="test-result__note">
              {result.neutralSamples + result.smileSamples} frames analysed · {result.evaluatedSamples} held out for
              grading · neutral mean {result.neutralMean}% · smile mean {result.smileMean}%.
            </p>

            <div className="modal__actions">
              <button className="btn btn--ghost" onClick={onClose}>
                Done
              </button>
              <button className="btn btn--primary" onClick={() => setPhase("neutral")}>
                Run again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
