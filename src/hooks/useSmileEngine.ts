import { useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { analyzeSmile, FACE_OVAL, toBlendshapeMap } from "../lib/faceMetrics";

export type EngineStatus = "loading" | "ready" | "error";
export type CameraStatus = "starting" | "live" | "error";

export interface EngineSnapshot {
  raw: number;
  score: number;
  facePresent: boolean;
  ts: number;
}

export interface EngineUi {
  facePresent: boolean;
  score: number;
  raw: number;
  fps: number;
  brightness: number;
  hint: string | null;
  faceHeight: number;
  centerX: number;
  centerY: number;
}

const INITIAL_UI: EngineUi = {
  facePresent: false,
  score: 0,
  raw: 0,
  fps: 0,
  brightness: 0,
  hint: null,
  faceHeight: 0,
  centerX: 0.5,
  centerY: 0.5,
};

let landmarkerPromise: Promise<FaceLandmarker> | null = null;
let sharedLandmarker: FaceLandmarker | null = null;

async function buildLandmarker(delegate: "GPU" | "CPU"): Promise<FaceLandmarker> {
  const base = import.meta.env.BASE_URL;
  const fileset = await FilesetResolver.forVisionTasks(`${base}wasm`);
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: `${base}models/face_landmarker.task`,
      delegate,
    },
    runningMode: "VIDEO",
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
  });
}

function getLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = buildLandmarker("GPU")
      .catch((error) => {
        console.warn("GPU delegate unavailable, falling back to CPU.", error);
        return buildLandmarker("CPU");
      })
      .then((landmarker) => {
        sharedLandmarker = landmarker;
        return landmarker;
      });

    landmarkerPromise.catch(() => {
      landmarkerPromise = null;
    });
  }
  return landmarkerPromise;
}

function friendlyCameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access was blocked. Allow the camera in your browser settings and retry.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found. Connect a webcam and retry.";
  }
  if (name === "NotReadableError") {
    return "The camera is busy in another app. Close it and retry.";
  }
  return error instanceof Error ? error.message : "Something went wrong while starting the camera.";
}

function drawOverlay(
  canvas: HTMLCanvasElement | null,
  landmarks: NormalizedLandmark[] | null,
  smiling: boolean,
) {
  if (!canvas) return;
  const width = canvas.width;
  const height = canvas.height;
  if (!width || !height) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);

  if (!landmarks) return;

  const scale = height / 720;
  const accent = smiling ? "rgba(198, 241, 109, 0.95)" : "rgba(255, 255, 255, 0.62)";

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.beginPath();
  FACE_OVAL.forEach((index, position) => {
    const point = landmarks[index];
    if (!point) return;
    const x = point.x * width;
    const y = point.y * height;
    if (position === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
  ctx.lineWidth = 1.6 * scale;
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  for (const index of [234, 454, 10, 152]) {
    const point = landmarks[index];
    if (!point) continue;
    ctx.beginPath();
    ctx.arc(point.x * width, point.y * height, 2.2 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.4 * scale;
  ctx.beginPath();
  [61, 291].forEach((index, position) => {
    const point = landmarks[index];
    if (!point) return;
    if (position === 0) ctx.moveTo(point.x * width, point.y * height);
    else ctx.lineTo(point.x * width, point.y * height);
  });
  ctx.stroke();

  ctx.fillStyle = accent;
  for (const index of [61, 291, 13, 14]) {
    const point = landmarks[index];
    if (!point) continue;
    ctx.beginPath();
    ctx.arc(point.x * width, point.y * height, 3 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function useSmileEngine() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const latestRef = useRef<EngineSnapshot>({ raw: 0, score: 0, facePresent: false, ts: 0 });
  const trackingRef = useRef(true);

  const [status, setStatus] = useState<EngineStatus>("loading");
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("starting");
  const [error, setError] = useState<string | null>(null);
  const [ui, setUi] = useState<EngineUi>(INITIAL_UI);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    let stream: MediaStream | null = null;

    let smoothed = 0;
    let medianWindow: number[] = [];
    let framesInWindow = 0;
    let fpsValue = 0;
    let fpsWindowStart = 0;
    let lastDetect = 0;
    let lastUiUpdate = 0;
    let frameIndex = 0;
    let brightness = 0;
    let faceHeight = 0;
    let centerX = 0.5;
    let centerY = 0.5;
    let hint: string | null = null;

    const brightnessCanvas = document.createElement("canvas");
    brightnessCanvas.width = 64;
    brightnessCanvas.height = 48;
    const brightnessCtx = brightnessCanvas.getContext("2d", { willReadFrequently: true });

    const publish = (facePresent: boolean, now: number) => {
      if (now - lastUiUpdate < 60) return;
      lastUiUpdate = now;
      setUi({
        facePresent,
        score: smoothed,
        raw: latestRef.current.raw,
        fps: fpsValue,
        brightness,
        hint,
        faceHeight,
        centerX,
        centerY,
      });
    };

    const loop = (now: number) => {
      rafId = requestAnimationFrame(loop);
      const video = videoRef.current;
      const landmarker = sharedLandmarker;
      if (!video || !landmarker || video.readyState < 2 || video.videoWidth === 0) return;
      if (now - lastDetect < 32) return;

      lastDetect = now;
      framesInWindow += 1;
      if (!fpsWindowStart) fpsWindowStart = now;
      if (now - fpsWindowStart > 500) {
        fpsValue = Math.round(framesInWindow * 1000 / (now - fpsWindowStart));
        framesInWindow = 0;
        fpsWindowStart = now;
      }

      let result;
      try {
        result = landmarker.detectForVideo(video, now);
      } catch {
        return;
      }

      const landmarks = result.faceLandmarks?.[0] ?? null;
      const facePresent = Boolean(landmarks && landmarks.length > 0);
      const aspect = video.videoWidth / Math.max(1, video.videoHeight);

      if (facePresent && landmarks) {
        const geometry = analyzeSmile(
          landmarks,
          toBlendshapeMap(result.faceBlendshapes?.[0]?.categories),
          aspect,
        );

        const raw = geometry?.score ?? 0;
        medianWindow.push(raw);
        if (medianWindow.length > 5) medianWindow.shift();
        const sorted = [...medianWindow].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)] ?? raw;

        const alpha = median > smoothed ? 0.35 : 0.16;
        smoothed += (median - smoothed) * alpha;
        if (smoothed < 0.004) smoothed = 0;

        if (geometry) {
          faceHeight = geometry.faceHeight;
          centerX = geometry.centerX;
          centerY = geometry.centerY;
          hint =
            brightness > 0 && brightness < 45
              ? "A little more light will sharpen the reading."
              : faceHeight <= 0.27
                ? "Move a little closer to the camera."
                : Math.abs(centerX - 0.5) > 0.17
                  ? "Center your face in the frame."
                  : null;
        }

        latestRef.current = { raw, score: smoothed, facePresent: true, ts: now };
        publish(true, now);
      } else {
        smoothed *= 0.88;
        if (smoothed < 0.005) smoothed = 0;
        medianWindow = [];
        faceHeight = 0;
        hint = "Bring your face into the frame.";
        latestRef.current = { raw: 0, score: smoothed, facePresent: false, ts: now };
        publish(false, now);
      }

      if (brightnessCtx && frameIndex++ % 12 === 0) {
        try {
          brightnessCtx.drawImage(video, 0, 0, 64, 48);
          const { data } = brightnessCtx.getImageData(0, 0, 64, 48);
          let total = 0;
          for (let index = 0; index < data.length; index += 4) {
            total += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
          }
          brightness = total / (data.length / 4);
        } catch {
          // Local camera frames are same-origin; ignore if a frame cannot be read.
        }
      }

      const canvas = overlayRef.current;
      if (canvas && video.videoWidth) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        drawOverlay(
          canvas,
          trackingRef.current && facePresent ? landmarks : null,
          facePresent && smoothed >= 0.5,
        );
      }
    };

    const start = async () => {
      try {
        setStatus("loading");
        setCameraStatus("starting");
        setError(null);

        await getLandmarker();
        if (cancelled) return;

        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        await new Promise<void>((resolve) => {
          if (video.readyState >= 2) {
            resolve();
            return;
          }
          video.onloadedmetadata = () => resolve();
        });
        await video.play().catch(() => undefined);
        if (cancelled) return;

        setStatus("ready");
        setCameraStatus("live");
        rafId = requestAnimationFrame(loop);
      } catch (cameraError) {
        if (cancelled) return;
        console.error(cameraError);
        setError(friendlyCameraError(cameraError));
        setStatus("error");
        setCameraStatus("error");
      }
    };

    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (stream) stream.getTracks().forEach((track) => track.stop());
      const video = videoRef.current;
      if (video) {
        video.onloadedmetadata = null;
        video.srcObject = null;
      }
      drawOverlay(overlayRef.current, null, false);
    };
  }, [attempt]);

  const retry = () => setAttempt((value) => value + 1);

  return {
    videoRef,
    overlayRef,
    latestRef,
    trackingRef,
    status,
    cameraStatus,
    error,
    ui,
    retry,
  };
}
