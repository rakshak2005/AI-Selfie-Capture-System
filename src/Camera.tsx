import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import AccuracyTest from "./components/AccuracyTest";
import Gallery from "./components/Gallery";
import ScoreRing from "./components/ScoreRing";
import {
  CameraIcon,
  CheckIcon,
  FileIcon,
  ScanIcon,
  ShieldIcon,
  SmileMark,
  SparkIcon,
} from "./components/Icons";
import { useSmileEngine } from "./hooks/useSmileEngine";
import {
  clearCaptures,
  deleteCapture,
  listCaptures,
  requestPersistentStorage,
  saveCapture,
} from "./lib/db";
import { formatFileStamp, smileLabel } from "./lib/format";
import { loadThreshold, loadValidation, saveThreshold } from "./lib/validation";
import type { Capture, CaptureSource, ValidationResult } from "./types";

const AUTO_KEY = "smile-studio.auto-capture.v1";
const HOLD_MS = 900;
const COOLDOWN_MS = 2500;

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function Camera() {
  const engine = useSmileEngine();
  const { videoRef, latestRef, trackingRef } = engine;

  const [captures, setCaptures] = useState<Capture[]>([]);
  const [galleryReady, setGalleryReady] = useState(false);
  const [threshold, setThreshold] = useState<number>(() => loadThreshold());
  const [autoCapture, setAutoCapture] = useState<boolean>(() => localStorage.getItem(AUTO_KEY) !== "0");
  const [validation, setValidation] = useState<ValidationResult | null>(() => loadValidation());
  const [showMesh, setShowMesh] = useState(true);
  const [holding, setHolding] = useState(0);
  const [flash, setFlash] = useState(0);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [accuracyOpen, setAccuracyOpen] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const toastId = useRef(0);
  const autoArmedRef = useRef(true);
  const lastCaptureRef = useRef(0);

  const notify = useCallback((message: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, text: message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    listCaptures()
      .then((rows) => {
        if (!cancelled) setCaptures(rows);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) notify("The local gallery could not be opened in this browser.");
      })
      .finally(() => {
        if (!cancelled) setGalleryReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [notify]);

  useEffect(() => {
    trackingRef.current = showMesh;
  }, [showMesh, trackingRef]);

  useEffect(() => {
    saveThreshold(threshold);
  }, [threshold]);

  useEffect(() => {
    localStorage.setItem(AUTO_KEY, autoCapture ? "1" : "0");
  }, [autoCapture]);

  const capture = useCallback(
    async (source: CaptureSource) => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) {
        notify("The camera is not ready yet.");
        return;
      }

      const width = video.videoWidth;
      const height = video.videoHeight;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return;

      context.translate(width, 0);
      context.scale(-1, 1);
      context.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);

      const snapshot = latestRef.current;
      const record: Capture = {
        id: createId(),
        dataUrl,
        smile: Math.round(snapshot.facePresent ? snapshot.score * 100 : 0),
        createdAt: Date.now(),
        width,
        height,
        source,
      };

      try {
        await saveCapture(record);
        lastCaptureRef.current = Date.now();
        autoArmedRef.current = false;
        setCaptures((previous) => [record, ...previous]);
        setFlash((value) => value + 1);
        setHolding(0);
        notify(source === "auto" ? "Auto-captured and saved on this device." : "Selfie saved to your local gallery.");
        void requestPersistentStorage();
      } catch (error) {
        console.error(error);
        notify("The photo could not be saved. Your browser storage may be full.");
      }
    },
    [latestRef, notify, videoRef],
  );

  // Auto-capture: hold a high-confidence smile for 0.9s, then snap. One photo
  // per smile - the trigger re-arms only after the smile relaxes.
  useEffect(() => {
    if (!autoCapture) {
      setHolding(0);
      return;
    }

    let holdStartedAt = 0;
    let belowSince = 0;

    const timer = window.setInterval(() => {
      const snapshot = latestRef.current;
      const now = performance.now();
      const fresh = now - snapshot.ts <= 700 && document.visibilityState === "visible";
      const present = fresh && snapshot.facePresent;
      const effective = present ? snapshot.score * 100 : 0;

      // Re-arm only after a genuine drop in expression.
      if (present && effective <= Math.max(0, threshold - 10)) {
        if (!belowSince) belowSince = now;
        if (!autoArmedRef.current && now - belowSince > 450) autoArmedRef.current = true;
      } else {
        belowSince = 0;
      }

      if (!present || effective < threshold || !autoArmedRef.current) {
        holdStartedAt = 0;
        setHolding((previous) => (previous === 0 ? previous : 0));
        return;
      }

      if (!holdStartedAt) holdStartedAt = now;
      const ratio = Math.min(1, (now - holdStartedAt) / HOLD_MS);
      setHolding((previous) => (Math.abs(previous - ratio) > 0.01 ? ratio : previous));

      if (ratio >= 1 && Date.now() - lastCaptureRef.current > COOLDOWN_MS) {
        holdStartedAt = 0;
        setHolding(0);
        void capture("auto");
      }
    }, 90);

    return () => window.clearInterval(timer);
  }, [autoCapture, capture, latestRef, threshold]);

  const handleDownload = useCallback((shot: Capture) => {
    const link = document.createElement("a");
    link.href = shot.dataUrl;
    link.download = `selfie-${formatFileStamp(shot.createdAt)}.jpg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, []);

  const handleDownloadAll = useCallback(() => {
    captures.forEach((shot, index) => {
      window.setTimeout(() => handleDownload(shot), index * 450);
    });
    notify(`Preparing ${captures.length} download${captures.length === 1 ? "" : "s"}. Check your Downloads folder.`);
  }, [captures, handleDownload, notify]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteCapture(id);
        setCaptures((previous) => previous.filter((shot) => shot.id !== id));
        notify("Photo deleted from this device.");
      } catch (error) {
        console.error(error);
        notify("That photo could not be deleted.");
      }
    },
    [notify],
  );

  const handleClear = useCallback(async () => {
    try {
      await clearCaptures();
      setCaptures([]);
      notify("Local gallery cleared.");
    } catch (error) {
      console.error(error);
      notify("The gallery could not be cleared.");
    }
  }, [notify]);

  const handleAccuracyComplete = useCallback(
    (result: ValidationResult) => {
      setValidation(result);
      setThreshold(result.threshold);
      notify(`Measured ${result.accuracy.toFixed(1)}% accuracy. Capture threshold tuned to ${result.threshold}%.`);
    },
    [notify],
  );

  const handleReport = useCallback(async () => {
    if (reportBusy) return;
    setReportBusy(true);
    await new Promise((resolve) => window.setTimeout(resolve, 60));
    try {
      const { generateProjectReport } = await import("./lib/report");
      await generateProjectReport({
        captures,
        validation,
        captureThreshold: threshold,
        autoCapture,
      });
      notify(
        validation
          ? "Project report downloaded with measured accuracy."
          : "Report downloaded. Run the accuracy test to include a measured accuracy figure.",
      );
    } catch (error) {
      console.error(error);
      notify("The report could not be generated. Please try again.");
    } finally {
      setReportBusy(false);
    }
  }, [autoCapture, captures, notify, reportBusy, threshold, validation]);

  const scorePercent = engine.ui.facePresent ? Math.round(engine.ui.score * 100) : 0;
  const ready = engine.status === "ready" && engine.ui.facePresent;

  const toggleAutoCapture = () => {
    if (!autoCapture) {
      autoArmedRef.current = true;
      lastCaptureRef.current = 0;
    }
    setAutoCapture(!autoCapture);
  };

  const statusHint = engine.status === "loading"
    ? "Loading the face model..."
    : engine.status === "error"
      ? engine.error ?? "The camera could not be started."
      : engine.ui.hint;
  const label = smileLabel(scorePercent, threshold);

  return (
    <div className="studio">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">
            <SmileMark />
          </span>
          <div className="brand__text">
            <span className="brand__name">Smile Studio</span>
            <span className="brand__sub">AI selfie capture</span>
          </div>
        </div>

        <div className="topbar__actions">
          <span className="pill pill--quiet">
            <ShieldIcon size={13} />
            On-device
          </span>
          {validation && (
            <span className="pill pill--metric" title="Measured on this camera with the built-in test">
              {validation.accuracy.toFixed(1)}% accuracy
            </span>
          )}
          <button className="btn btn--primary btn--sm" onClick={handleReport} disabled={reportBusy}>
            <FileIcon size={15} />
            {reportBusy ? "Building report..." : "Project report"}
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className={`stage ${engine.status === "error" ? "stage--error" : ""}`} aria-label="Camera preview">
          <div className="stage__media">
            <video ref={videoRef} autoPlay playsInline muted />
            <canvas ref={engine.overlayRef} aria-hidden="true" />
          </div>

          <div className="stage__top">
            <span className={`badge ${engine.cameraStatus === "live" ? "badge--live" : ""}`}>
              <span className={`dot ${engine.cameraStatus === "live" ? "dot--live" : "dot--idle"}`} />
              {engine.cameraStatus === "live" ? `Live · ${engine.ui.fps || 30} fps` : engine.cameraStatus === "error" ? "Camera offline" : "Starting camera"}
            </span>

            <label className="mesh-toggle">
              <input type="checkbox" checked={showMesh} onChange={(event) => setShowMesh(event.target.checked)} />
              <span>Mesh</span>
            </label>
          </div>

          {engine.status === "loading" && (
            <div className="stage__cover">
              <div className="spinner" />
              <strong>Waking up the face model</strong>
              <span>478 landmarks and smile blendshapes load locally.</span>
            </div>
          )}

          {engine.status === "error" && (
            <div className="stage__cover stage__cover--error">
              <strong>Camera unavailable</strong>
              <span>{engine.error}</span>
              <button className="btn btn--primary btn--sm" onClick={engine.retry}>
                Try again
              </button>
            </div>
          )}

          {engine.status === "ready" && (
            <div className={`stage__hint ${statusHint && !engine.ui.facePresent ? "" : "stage__hint--soft"}`}>
              {statusHint ?? (autoCapture ? "Hold your smile to capture automatically" : "You are framed well. Take the shot.")}
            </div>
          )}

          <div className="stage__footer">
            <span>
              <span className={`dot ${ready ? "dot--live" : "dot--idle"}`} />
              {ready ? "Face locked" : "Searching for a face"}
            </span>
            <span>{engine.ui.facePresent ? `${scorePercent}% smile` : "Local processing"}</span>
          </div>

          {flash > 0 && <div key={flash} className="stage__flash" />}
        </section>

        <aside className="panel" aria-label="Smile controls">
          <div className="panel__top">
            <span className="eyebrow">Smile score</span>
            <span className="panel__engine">
              <SparkIcon size={12} />
              Blend + geometry
            </span>
          </div>

          <ScoreRing
            value={scorePercent}
            threshold={threshold}
            facePresent={engine.ui.facePresent}
            holding={holding}
            label={label}
          />

          <p className={`panel__hint ${engine.ui.hint ? "panel__hint--warn" : ""}`}>
            {!engine.ui.facePresent
              ? "Center your face in the frame to begin."
              : engine.ui.hint ?? (autoCapture
                ? holding > 0
                  ? "Hold it there, capturing shortly."
                  : `Reach ${threshold}% and hold for a moment.`
                : "Press capture whenever the moment feels right.")}
          </p>

          <button
            className="btn btn--primary btn--capture"
            onClick={() => void capture("manual")}
            disabled={!ready}
          >
            <CameraIcon size={19} />
            Capture selfie
          </button>

          <div className="panel__row">
            <button
              className={`switch-card ${autoCapture ? "is-on" : ""}`}
              role="switch"
              aria-checked={autoCapture}
              onClick={toggleAutoCapture}
            >
              <span className="switch-card__text">
                <strong>Auto-capture</strong>
                <small>{autoCapture ? `Armed at ${threshold}%` : "Manual only"}</small>
              </span>
              <span className="switch" aria-hidden="true">
                <span />
              </span>
            </button>

            <button className="switch-card switch-card--action" onClick={() => setAccuracyOpen(true)}>
              <span className="switch-card__text">
                <strong>Accuracy test</strong>
                <small>
                  {validation ? `${validation.accuracy.toFixed(1)}% measured` : "12 seconds"}
                </small>
              </span>
              <ScanIcon size={18} />
            </button>
          </div>

          <div className="slider-row">
            <div className="slider-row__label">
              <span className="eyebrow">Capture at</span>
              <strong>{threshold}%</strong>
            </div>
            <input
              type="range"
              min={35}
              max={95}
              step={1}
              value={threshold}
              onChange={(event) => setThreshold(Number(event.target.value))}
              aria-label="Smile threshold for capture"
              style={{ "--fill": `${((threshold - 35) / 60) * 100}%` } as CSSProperties}
            />
            <div className="slider-row__scale">
              <span>Subtle</span>
              <span>Ear to ear</span>
            </div>
          </div>

          <div className="panel__meta">
            <span>
              <ShieldIcon size={13} />
              Photos stay in IndexedDB
            </span>
            <span>{captures.length} saved</span>
          </div>
        </aside>
      </main>

      {!galleryReady ? (
        <div className="gallery-loading">
          <div className="spinner spinner--sm" />
          Opening your local gallery...
        </div>
      ) : (
        <Gallery
          captures={captures}
          onDelete={(id) => void handleDelete(id)}
          onClear={() => void handleClear()}
          onDownload={handleDownload}
          onDownloadAll={handleDownloadAll}
        />
      )}

      <footer className="footnote">
        <span>Smile analysis, capture, and reporting run entirely in this browser tab.</span>
        <span>Built with MediaPipe Face Landmarker, React, and IndexedDB.</span>
      </footer>

      <AccuracyTest
        open={accuracyOpen}
        latestRef={latestRef}
        onClose={() => setAccuracyOpen(false)}
        onComplete={handleAccuracyComplete}
        hasResult={validation !== null}
      />

      {reportBusy && (
        <div className="busy" role="status">
          <div className="busy__card">
            <div className="spinner" />
            <strong>Building your project report</strong>
            <span>Laying out accuracy, analytics, and the contact sheet.</span>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <CheckIcon size={15} />
          {toast.text}
        </div>
      )}
    </div>
  );
}
