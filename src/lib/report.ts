import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Capture, ValidationResult } from "../types";
import { formatDateTime } from "./format";

export interface ReportInput {
  captures: Capture[];
  validation: ValidationResult | null;
  captureThreshold: number;
  autoCapture: boolean;
}

type RGB = [number, number, number];

const INK: RGB = [22, 24, 20];
const MUTED: RGB = [108, 114, 101];
const FAINT: RGB = [146, 151, 140];
const ACCENT: RGB = [198, 241, 109];
const ACCENT_DARK: RGB = [71, 99, 28];
const PANEL: RGB = [244, 246, 239];
const LINE: RGB = [222, 226, 214];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 17;
const CONTENT_W = PAGE_W - MARGIN * 2;

const pad = (value: number) => String(value).padStart(2, "0");

function fileStamp(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function pct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export async function generateProjectReport(input: ReportInput): Promise<void> {
  const { captures, validation, captureThreshold, autoCapture } = input;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  let y = MARGIN;

  const ink = (color: RGB) => doc.setTextColor(color[0], color[1], color[2]);
  const fill = (color: RGB) => doc.setFillColor(color[0], color[1], color[2]);
  const stroke = (color: RGB) => doc.setDrawColor(color[0], color[1], color[2]);
  const font = (size: number, style: "normal" | "bold" | "italic" = "normal", color: RGB = INK) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    ink(color);
  };

  const newPage = () => {
    doc.addPage();
    y = MARGIN;
  };

  const ensure = (space: number) => {
    if (y + space > PAGE_H - 20) newPage();
  };

  const heading = (index: string, title: string) => {
    ensure(20);
    y += 2;
    fill(ACCENT);
    doc.rect(MARGIN, y - 1, 2.4, 7.6, "F");
    font(8, "bold", FAINT);
    doc.text(index.toUpperCase(), MARGIN + 7, y + 2.4);
    font(14, "bold", INK);
    doc.text(title, MARGIN + 7, y + 8.4);
    y += 15;
  };

  const subheading = (text: string) => {
    ensure(12);
    y += 1.5;
    font(10, "bold", INK);
    doc.text(text, MARGIN, y);
    y += 5.6;
  };

  const paragraph = (text: string, options: { size?: number; color?: RGB; width?: number } = {}) => {
    const size = options.size ?? 9;
    const width = options.width ?? CONTENT_W;
    const lineHeight = size * 0.3528 * 1.52;
    const lines = doc.splitTextToSize(text, width) as string[];
    font(size, "normal", options.color ?? INK);
    lines.forEach((line) => {
      ensure(lineHeight + 1);
      doc.text(line, MARGIN, y);
      y += lineHeight;
    });
    y += 2;
  };

  const bullets = (items: string[], color: RGB = INK) => {
    for (const item of items) {
      const lines = doc.splitTextToSize(item, CONTENT_W - 6) as string[];
      const lineHeight = 9 * 0.3528 * 1.45;
      ensure(lines.length * lineHeight + 1.4);
      fill(ACCENT_DARK);
      doc.circle(MARGIN + 1.2, y - 1.1, 0.9, "F");
      font(9, "normal", color);
      lines.forEach((line, index) => {
        doc.text(line, MARGIN + 5, y + index * lineHeight);
      });
      y += lines.length * lineHeight + 1.4;
    }
    y += 1.5;
  };

  const table = (head: string[], rows: string[][], columnWidths?: number[]) => {
    ensure(24);
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [head],
      body: rows,
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 2.1,
        lineColor: LINE,
        lineWidth: 0.15,
        textColor: INK,
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [24, 27, 22],
        textColor: [246, 248, 241],
        fontStyle: "bold",
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: [248, 249, 244] },
      columnStyles: columnWidths
        ? Object.fromEntries(columnWidths.map((width, index) => [index, { cellWidth: width }]))
        : undefined,
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  };

  const statCards = (items: Array<{ label: string; value: string }>) => {
    ensure(27);
    const gap = 3;
    const width = (CONTENT_W - gap * (items.length - 1)) / items.length;
    items.forEach((item, index) => {
      const x = MARGIN + index * (width + gap);
      fill(PANEL);
      stroke(LINE);
      doc.setLineWidth(0.2);
      doc.roundedRect(x, y, width, 22, 2.2, 2.2, "FD");
      font(6.6, "bold", MUTED);
      doc.setCharSpace(0.35);
      doc.text(item.label.toUpperCase(), x + 4, y + 7);
      doc.setCharSpace(0);
      font(15, "bold", INK);
      doc.text(item.value, x + 4, y + 16.5);
    });
    y += 27;
  };

  const panel = (title: string, lines: string[]) => {
    ensure(18 + lines.length * 4.4);
    const height = 12 + lines.length * 4.6;
    fill(PANEL);
    stroke(LINE);
    doc.roundedRect(MARGIN, y, CONTENT_W, height, 2.4, 2.4, "FD");
    fill(ACCENT_DARK);
    doc.rect(MARGIN, y, 1.6, height, "F");
    font(8, "bold", ACCENT_DARK);
    doc.setCharSpace(0.4);
    doc.text(title.toUpperCase(), MARGIN + 6, y + 6.4);
    doc.setCharSpace(0);
    lines.forEach((line, index) => {
      font(8.4, "normal", INK);
      doc.text(doc.splitTextToSize(line, CONTENT_W - 12)[0] ?? line, MARGIN + 6, y + 12 + index * 4.4);
    });
    y += height + 6;
  };

  // ---------------------------------------------------------------- cover
  fill([12, 14, 11]);
  doc.rect(0, 0, PAGE_W, 104, "F");

  fill(ACCENT);
  doc.rect(MARGIN, 22, 16, 1.2, "F");

  font(7.6, "bold", [168, 178, 152]);
  doc.setCharSpace(1.5);
  doc.text("PROJECT REPORT", MARGIN, 31);
  doc.setCharSpace(0);

  font(29, "bold", [247, 249, 242]);
  doc.text("AI Selfie Capture", MARGIN, 46);
  doc.text("System", MARGIN, 57);

  font(9.6, "normal", [158, 168, 148]);
  doc.text("Real-time smile analysis, automatic capture, and local-first storage.", MARGIN, 68);
  doc.text("A complete browser-native computer-vision pipeline - no uploads, no servers.", MARGIN, 74.4);

  font(7.6, "normal", [122, 132, 116]);
  doc.setCharSpace(0.35);
  doc.text("SMILE STUDIO  /  VERSION 1.0", MARGIN, 92);
  doc.setCharSpace(0);

  // Decorative smile mark
  doc.setDrawColor(198, 241, 109);
  doc.setLineWidth(0.45);
  doc.circle(PAGE_W - 38, 45, 21);
  doc.circle(PAGE_W - 46, 40, 1.1, "F");
  doc.circle(PAGE_W - 30, 40, 1.1, "F");
  doc.setLineWidth(0.9);
  doc.lines([[1.1, 2.4], [3.4, 3.1], [5.9, 3.1], [3.3, 0], [5.6, -3.1], [1.1, -2.4]], PAGE_W - 50, 47, [1, 1], "S", false);

  y = 116;
  font(7, "bold", FAINT);
  doc.setCharSpace(0.55);
  doc.text("PREPARED", MARGIN, y);
  doc.text("APPLICATION", MARGIN + 66, y);
  doc.text("STORAGE", MARGIN + 132, y);
  doc.setCharSpace(0);

  font(8.6, "bold", INK);
  doc.text(formatDateTime(Date.now()), MARGIN, y + 6);
  doc.text("Smile Studio v1.0", MARGIN + 66, y + 6);
  doc.text("Browser IndexedDB", MARGIN + 132, y + 6);

  font(7.2, "normal", MUTED);
  doc.text("MediaPipe Face Landmarker", MARGIN + 66, y + 11.4);
  doc.text(`${captures.length} photo${captures.length === 1 ? "" : "s"} stored locally`, MARGIN + 132, y + 11.4);

  y += 22;

  // Accuracy callout
  const accuracyValid = validation !== null;
  fill(accuracyValid ? [241, 248, 226] : [247, 247, 244]);
  stroke(accuracyValid ? [207, 226, 176] : LINE);
  doc.setLineWidth(0.25);
  doc.roundedRect(MARGIN, y, CONTENT_W, 34, 3, 3, "FD");
  fill(accuracyValid ? ACCENT_DARK : FAINT);
  doc.rect(MARGIN, y, 2, 34, "F");

  font(7.2, "bold", MUTED);
  doc.setCharSpace(0.6);
  doc.text("MEASURED SMILE-CLASSIFICATION ACCURACY", MARGIN + 7, y + 7.4);
  doc.setCharSpace(0);

  font(26, "bold", ACCENT_DARK);
  doc.text(accuracyValid ? pct(validation.accuracy) : "Not measured", MARGIN + 7, y + 20.5);

  font(7.6, "normal", MUTED);
  if (validation) {
    doc.text(
      `Held-out 40% of ${validation.neutralSamples + validation.smileSamples} live frames | threshold ${validation.threshold}%`,
      MARGIN + 7,
      y + 27.5,
    );
    doc.text(
      `Precision ${pct(validation.precision)} | Recall ${pct(validation.recall)} | F1 ${pct(validation.f1)}`,
      MARGIN + 7,
      y + 31.5,
    );
  } else {
    doc.text(
      "Run the built-in 12-second accuracy test before exporting to include a real measured figure.",
      MARGIN + 7,
      y + 26.5,
    );
  }

  y += 43;

  font(8, "bold", INK);
  doc.text("Contents", MARGIN, y);
  y += 3;
  const contents = [
    "01  Executive summary",
    "02  Objectives and features",
    "03  Technology stack",
    "04  System architecture",
    "05  Smile scoring methodology",
    "06  Accuracy and validation",
    "07  Capture analytics",
    "08  Local storage and privacy",
    "09  Quality safeguards",
    "10  Limitations and future work",
    "11  Running the project",
  ];
  contents.forEach((item, index) => {
    font(8.4, "normal", index % 2 === 0 ? MUTED : INK);
    doc.text(item, MARGIN, y + 7 + index * 6);
    stroke(LINE);
    doc.setLineWidth(0.15);
    doc.line(MARGIN, y + 9.5 + index * 6, MARGIN + CONTENT_W, y + 9.5 + index * 6);
  });

  // ------------------------------------------------------- executive summary
  newPage();
  heading("01", "Executive summary");
  paragraph(
    "The AI Selfie Capture System is a browser-based photography tool that reads a person's smile in real time and saves the moment only when the smile is genuine. It runs a 478-point face landmark model on the live camera stream, converts facial blendshapes and mouth geometry into a single smile score, and automatically snaps a photo after the smile is held at a user-defined confidence for a short, stable interval.",
  );
  paragraph(
    "Unlike cloud-based photo filters, no frame ever leaves the device. The face model, WebAssembly runtime, and all inference logic are served from the application itself; photos are encoded locally and written to IndexedDB with their smile score and timestamp. The gallery survives page reloads, can be exported to disk, and is the data source for this report.",
  );
  paragraph(
    "The report documents the problem, the feature set, the technology choices, the detection methodology, measured accuracy, capture analytics, storage design, privacy posture, and the engineering trade-offs behind the implementation. All numbers describing accuracy are measured on the operator's own camera using the app's built-in validation protocol; nothing is copied from a paper or a marketing page.",
  );

  subheading("Project at a glance");
  table(
    ["Field", "Detail"],
    [
      ["Project", "AI Selfie Capture System (Smile Studio)"],
      ["Category", "Real-time computer vision / browser application"],
      ["Problem", "People take many selfies to catch a good smile; manual review is slow and cloud tools raise privacy concerns."],
      ["Solution", "Score the smile live, guide the user, and auto-capture once a stable, high-confidence smile is detected."],
      ["Core model", "MediaPipe Face Landmarker (BlazeFace detector + 478 3D landmarks + 52 ARKit blendshapes)"],
      ["Fusion", "Blendshape average (78%), mouth-corner elevation (14.3%), mouth-width ratio (7.7%), symmetry damping"],
      ["Storage", "IndexedDB object store plus optional device download; no backend service"],
      ["Output", "Local gallery, downloadable JPEGs, and this project PDF report"],
    ],
    [38, 138],
  );

  // ------------------------------------------------------- objectives
  heading("02", "Objectives and features");
  paragraph(
    "The build targets four outcomes: make smile measurement visible and trustworthy, make the capture experience feel effortless, keep every photo on the user's device, and make the engineering measurable through an in-app accuracy test.",
  );
  bullets([
    "Live smile score: a 0-100 percentage refreshed from the video stream, with a ring gauge, threshold marker, and rolling state label.",
    "Stable capture: manual shutter plus optional auto-capture that requires the smile to hold above the threshold (0.9 s) and enforces a cooldown to prevent bursts.",
    "Local gallery: each capture stores the JPEG, smile percentage, source (manual or auto), resolution, and timestamp in IndexedDB.",
    "Device export: download one photo or the entire gallery, with human-readable file names.",
    "Accuracy test: records neutral and smiling segments, tunes a personal decision threshold on the first 60%, and grades the remaining 40%.",
    "Project report: generates a multi-page PDF with methodology, measured accuracy, confusion matrix, analytics, and contact sheet.",
    "Minimal interface: a dark, quiet studio layout that keeps attention on the face and the score rather than on chrome.",
    "Fail-safe UX: explicit camera permission errors, model loading states, low-light and off-centre hints, and no face reading without consent.",
  ]);

  // ------------------------------------------------------- stack
  heading("03", "Technology stack");
  table(
    ["Layer", "Technology", "Role"],
    [
      ["UI", "React 19 + TypeScript 6", "Component state, live score rendering, modals, gallery, accessibility"],
      ["Build", "Vite 8", "Dev server, production bundling, static asset pipeline"],
      ["Inference", "@mediapipe/tasks-vision 1.2.3", "Face Landmarker in VIDEO mode with GPU delegate and CPU fallback"],
      ["Model", "face_landmarker.task (float16)", "Face detection, 478 landmarks, 52 ARKit-compatible blendshape coefficients"],
      ["Runtime", "MediaPipe WebAssembly", "Bundled in public/wasm so inference does not depend on a CDN at runtime"],
      ["Storage", "IndexedDB", "Durable local photo store; survives reloads and browser restarts"],
      ["Report", "jsPDF 4 + jspdf-autotable 5", "Vector text, tables, callouts, contact sheet and page numbering"],
      ["Styling", "Hand-written CSS", "Dark studio theme, responsive grid, reduced-motion support, no UI framework"],
    ],
    [26, 52, 98],
  );

  // ------------------------------------------------------- architecture
  heading("04", "System architecture");
  paragraph(
    "The pipeline is intentionally linear and inspectable. Each stage produces a small, testable artefact, and only the final score and the selected frame reach React state. The camera loop is driven by requestAnimationFrame and throttled to roughly 30 inferences per second.",
  );

  subheading("Processing flow");
  ensure(24);
  const flow = ["Camera", "Face Landmarker", "Score fusion", "Capture", "IndexedDB"];
  const boxGap = 4;
  const boxWidth = (CONTENT_W - boxGap * (flow.length - 1)) / flow.length;
  flow.forEach((label, index) => {
    const x = MARGIN + index * (boxWidth + boxGap);
    fill(index === 2 ? ACCENT : PANEL);
    stroke(index === 2 ? ACCENT_DARK : LINE);
    doc.roundedRect(x, y, boxWidth, 14, 2, 2, "FD");
    font(7.4, "bold", index === 2 ? ACCENT_DARK : INK);
    doc.text(label, x + boxWidth / 2, y + 8.6, { align: "center" });
    if (index < flow.length - 1) {
      stroke(FAINT);
      doc.setLineWidth(0.3);
      const arrowX = x + boxWidth + 0.8;
      doc.line(arrowX, y + 7, arrowX + 2.4, y + 7);
      doc.line(arrowX + 1.7, y + 6.3, arrowX + 2.4, y + 7);
      doc.line(arrowX + 1.7, y + 7.7, arrowX + 2.4, y + 7);
    }
  });
  y += 21;

  table(
    ["Stage", "What happens", "Output consumed by the next stage"],
    [
      [
        "1. Camera",
        "getUserMedia requests a 1280x960 ideal front-facing stream. The video element is mirrored for a natural selfie view; inference uses the unmirrored frame.",
        "HTMLVideoElement frames at 24-30 fps",
      ],
      [
        "2. Face Landmarker",
        "BlazeFace short-range detection locates the face, then the 478-point mesh and 52 blendshape coefficients are regressed for the primary face.",
        "Landmark coordinates, blendshape scores, presence confidence",
      ],
      [
        "3. Score fusion",
        "Blendshape smile coefficients are averaged and fused with geometric corner lift and mouth width, multiplied by a symmetry factor, then smoothstepped.",
        "Raw score (0-1) and median/EMA smoothed score",
      ],
      [
        "4. Capture",
        "The user's threshold and a 0.9 s hold timer gate manual or automatic capture. The frame is drawn to an offscreen canvas, mirrored, and encoded as JPEG.",
        "Data URL, smile percentage, timestamp, resolution",
      ],
      [
        "5. IndexedDB",
        "The record is written to the captures object store, a React state copy updates the gallery, and the browser is asked for persistent storage.",
        "Durable gallery rows and PDF report data",
      ],
    ],
    [30, 104, 42],
  );

  // ------------------------------------------------------- methodology
  heading("05", "Smile scoring methodology");
  paragraph(
    "A smile is not one signal. Mouth corners rise, the mouth widens, cheeks lift, and the expression is usually asymmetric. The scorer combines an ARKit-style blendshape reading with two geometric measurements so that a single noisy cue cannot trigger a photo. Blendshapes carry most of the weight because they are learned and normalized across faces.",
  );

  fill(PANEL);
  stroke(LINE);
  doc.roundedRect(MARGIN, y, CONTENT_W, 20, 2.4, 2.4, "FD");
  font(9.2, "bold", INK);
  doc.text("S_raw = clamp( [ 0.78 * B + 0.22 * (0.65 * L + 0.35 * W) ] * (0.88 + 0.12 * Sym) )", MARGIN + 5, y + 7.6);
  font(7.6, "normal", MUTED);
  doc.text("S = smoothstep(S_raw) = 3S_raw^2 - 2S_raw^3        displayed = 100 * EMA(median(S))", MARGIN + 5, y + 14.6);
  y += 27;

  table(
    ["Symbol", "Feature", "Definition", "Weight"],
    [
      ["B", "Blendshape smile", "Mean of mouthSmileLeft and mouthSmileRight coefficients (0-1)", "78%"],
      ["L", "Corner elevation", "(lip-centre y - mean corner y) / face height, normalised to 0-1 over a 0.09 band", "14.3%"],
      ["W", "Mouth width", "mouth-corner span / inter-ocular distance, normalised over a 0.45 band", "7.7%"],
      ["Sym", "Symmetry damping", "1 - |left - right|, applied as a 0.88-1.00 multiplier", "gate"],
    ],
    [14, 38, 106, 18],
  );

  subheading("Why these cues");
  bullets([
    "MouthSmileLeft and MouthSmileRight are model outputs trained against ARKit blendshape targets; they are robust to skin tone, glasses, and moderate lighting changes.",
    "Corner elevation catches the physical lift that defines a smile and rejects a mouth that is merely open.",
    "Mouth-width ratio rewards the horizontal stretch of a genuine smile and is scale-invariant because it is divided by inter-ocular distance.",
    "The symmetry multiplier only applies a 12% penalty at most, so a lopsided but real smile still passes.",
  ]);

  subheading("Temporal stability");
  paragraph(
    "Raw per-frame scores flicker when the mesh jitters. The pipeline keeps a five-frame median to discard single-frame spikes, then applies an exponential moving average with a fast attack (alpha 0.35) and a slow release (alpha 0.16). The asymmetry means the ring responds quickly to a new smile but falls gently when the face relaxes, which reads as confidence rather than lag.",
  );

  subheading("Thresholding and capture logic");
  table(
    ["Control", "Default", "Behaviour"],
    [
      ["Capture threshold", `${captureThreshold}% (user adjustable 35-95%)`, "Score must meet or exceed the threshold to arm a capture"],
      ["Hold duration", "900 ms", "Smile must remain above threshold while the ring fills; fidgeting resets the timer"],
      ["Cooldown", "2.5 s", "Prevents duplicate frames immediately after a manual or automatic capture"],
      ["Auto-capture", autoCapture ? "Enabled for this report" : "Disabled for this report", "Toggled by the user; manual shutter is always available"],
      ["Manual shutter", "Always on", "Captures the current frame and its live score regardless of the threshold"],
    ],
    [34, 54, 88],
  );

  // ------------------------------------------------------- accuracy
  heading("06", "Accuracy and validation");
  paragraph(
    "Accuracy claims are only useful when the protocol is explicit. The application includes a self-contained validation test that records two labelled segments from the live camera: a neutral expression and a deliberate smile. Features are computed by exactly the same code path as normal operation.",
  );

  if (validation) {
    fill([241, 248, 226]);
    stroke([207, 226, 176]);
    doc.roundedRect(MARGIN, y, CONTENT_W, 30, 2.6, 2.6, "FD");
    font(7.2, "bold", MUTED);
    doc.setCharSpace(0.55);
    doc.text("MEASURED ACCURACY (HELD-OUT 40%)", MARGIN + 6, y + 7);
    doc.setCharSpace(0);
    font(25, "bold", ACCENT_DARK);
    doc.text(pct(validation.accuracy), MARGIN + 6, y + 20);
    font(7.8, "normal", MUTED);
    doc.text(
      `${validation.evaluatedSamples} frames graded | threshold ${validation.threshold}%`,
      MARGIN + 6,
      y + 26,
    );
    font(20, "bold", ACCENT_DARK);
    doc.text(`F1 ${pct(validation.f1)}`, PAGE_W - MARGIN - 6, y + 16, { align: "right" });
    font(7.4, "normal", MUTED);
    doc.text(`Precision ${pct(validation.precision)} | Recall ${pct(validation.recall)}`, PAGE_W - MARGIN - 6, y + 23, {
      align: "right",
    });
    y += 36;

    subheading("Measured results");
    table(
      ["Metric", "Value", "Formula"],
      [
        ["Accuracy", pct(validation.accuracy), "(TP + TN) / (TP + TN + FP + FN)"],
        ["Precision", pct(validation.precision), "TP / (TP + FP)"],
        ["Recall", pct(validation.recall), "TP / (TP + FN)"],
        ["F1 score", pct(validation.f1), "2 * (precision * recall) / (precision + recall)"],
        ["Decision threshold", `${validation.threshold}%`, "Best balanced accuracy on the calibration split"],
        ["Neutral mean score", `${validation.neutralMean}%`, "Average raw fused score while resting"],
        ["Smile mean score", `${validation.smileMean}%`, "Average raw fused score while smiling"],
        ["Samples", `${validation.neutralSamples} neutral / ${validation.smileSamples} smile`, "Frames with a detected face"],
        ["Test timestamp", formatDateTime(validation.capturedAt), "Stored locally for report traceability"],
      ],
      [38, 56, 82],
    );

    subheading("Confusion matrix (held-out frames)");
    table(
      ["", "Predicted neutral", "Predicted smile"],
      [
        ["Actual neutral", `${validation.tn}  (TN)`, `${validation.fp}  (FP)`],
        ["Actual smile", `${validation.fn}  (FN)`, `${validation.tp}  (TP)`],
      ],
      [60, 60, 56],
    );

    subheading("Validation protocol");
    bullets([
      "Segment 1 (6 s): the operator holds a relaxed neutral expression with the face inside the tracking outline.",
      "Segment 2 (6 s): after a short prompt, the operator holds a natural full smile until the timer ends.",
      "Both segments are sampled every 60 ms, producing roughly 100 frames per class at 30 fps.",
      "The first 60% of each segment calibrates the threshold by maximising balanced accuracy; the untouched final 40% is graded.",
      "The resulting threshold and metrics are saved in localStorage and embedded in every subsequent PDF report.",
    ]);
    paragraph(
      "Frames from one recording are temporally correlated, so this is a within-session estimate rather than a cross-person benchmark. It still answers the practical question the system is judged on: on this camera, in this room, how reliably does the threshold separate a smile from a neutral face?",
      { color: MUTED, size: 8.4 },
    );
  } else {
    panel("Accuracy not measured", [
      "This report was generated before the in-app accuracy test was completed.",
      "Run Accuracy test from the capture panel (two 6-second segments) and regenerate the report.",
      "The PDF will then include held-out accuracy, precision, recall, F1, threshold, and a confusion matrix.",
    ]);
    subheading("Recommended protocol");
    bullets([
      "Sit in even, front-facing light and keep the entire face inside the tracking outline.",
      "Complete the neutral segment, wait for the smile prompt, then hold a natural full smile.",
      "Repeat the test in different lighting and re-run if conditions change substantially.",
      "Compare the reported accuracy and threshold; lower the capture threshold if recall is low, raise it if false positives appear.",
    ]);
  }

  // ------------------------------------------------------- analytics
  heading("07", "Capture analytics");
  const scores = captures.map((capture) => capture.smile);
  const average = scores.length
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    : 0;
  const best = scores.length ? Math.max(...scores) : 0;
  const autoCount = captures.filter((capture) => capture.source === "auto").length;

  statCards([
    { label: "Stored photos", value: String(captures.length) },
    { label: "Average smile", value: captures.length ? `${average}%` : "-" },
    { label: "Best smile", value: captures.length ? `${best}%` : "-" },
    { label: "Auto captured", value: captures.length ? `${Math.round((autoCount / captures.length) * 100)}%` : "-" },
  ]);

  if (captures.length > 0) {
    paragraph(
      `The local gallery currently holds ${captures.length} capture${captures.length === 1 ? "" : "s"}. ${
        captures.length === 1
          ? "One moment"
          : `${autoCount} capture${autoCount === 1 ? " was" : "s were"} taken automatically`
      }, and the rest used the manual shutter. The newest capture was recorded on ${formatDateTime(
        captures[0].createdAt,
      )}.`,
      { size: 8.6 },
    );

    subheading("Recent captures");
    table(
      ["#", "Captured", "Smile", "Mode", "Resolution"],
      captures.slice(0, 12).map((capture, index) => [
        String(index + 1).padStart(2, "0"),
        formatDateTime(capture.createdAt),
        `${capture.smile}%`,
        capture.source === "auto" ? "Auto" : "Manual",
        `${capture.width} x ${capture.height}`,
      ]),
      [12, 74, 24, 30, 36],
    );

    if (captures.length > 12) {
      paragraph(`Plus ${captures.length - 12} earlier capture${captures.length - 12 === 1 ? "" : "s"} retained in the gallery.`, {
        color: MUTED,
        size: 8,
      });
    }
  } else {
    paragraph(
      "No photos were stored at the time this report was generated. Capture a selfie to populate the analytics and contact sheet.",
      { color: MUTED },
    );
  }

  // Contact sheet
  const contact = captures.slice(0, 6);
  if (contact.length > 0) {
    subheading("Contact sheet");
    ensure(36);
    const cardWidth = 40;
    const cardHeight = 30;
    const gap = 5.6;
    let rowY = y;
    contact.forEach((capture, index) => {
      const column = index % 3;
      if (column === 0) {
        if (index > 0) rowY += cardHeight + 10;
        if (rowY + cardHeight + 13 > PAGE_H - 20) {
          newPage();
          rowY = y;
        }
      }
      const x = MARGIN + column * (cardWidth + gap);
      try {
        doc.addImage(capture.dataUrl, "JPEG", x, rowY, cardWidth, cardHeight, undefined, "FAST");
      } catch {
        fill([236, 238, 232]);
        doc.rect(x, rowY, cardWidth, cardHeight, "F");
      }
      stroke(LINE);
      doc.setLineWidth(0.2);
      doc.rect(x, rowY, cardWidth, cardHeight, "S");
      font(7, "bold", INK);
      doc.text(`${capture.smile}% smile`, x, rowY + cardHeight + 4);
      font(6.6, "normal", MUTED);
      doc.text(formatDateTime(capture.createdAt), x, rowY + cardHeight + 7.6);
    });
    y = rowY + cardHeight + 13;
  }

  // ------------------------------------------------------- storage
  heading("08", "Local storage and privacy");
  paragraph(
    "The product promise is simple: the photo, the score, and the report are yours. The application has no backend, no analytics, no third-party inference call, and no upload path. The face model and WebAssembly runtime are bundled with the app, so smile analysis continues to work offline after the first load.",
  );

  subheading("IndexedDB schema");
  table(
    ["Field", "Type", "Purpose"],
    [
      ["id", "string (UUID)", "Primary key for the capture record"],
      ["dataUrl", "string (JPEG data URL)", "Mirrored, compressed selfie at camera resolution"],
      ["smile", "number 0-100", "Smile score frozen at the moment of capture"],
      ["createdAt", "number (epoch ms)", "Timestamp used for ordering and reporting"],
      ["width / height", "number", "Intrinsic pixel size of the stored image"],
      ["source", "manual | auto", "How the capture was triggered"],
    ],
    [36, 56, 84],
  );

  subheading("Privacy properties");
  bullets([
    "Camera frames are processed in-memory and never transmitted; inference runs on-device via WebAssembly.",
    "Photos stay in IndexedDB until the operator deletes them; clearing site data removes the gallery.",
    "The app requests persistent storage so the browser does not silently evict the gallery under pressure.",
    "Export is an explicit user action; images are written to the Downloads folder and nowhere else.",
    "No accounts, cookies for tracking, or external storage services are used.",
    "The PDF report is generated locally from the same IndexedDB rows and is never uploaded.",
  ]);

  // ------------------------------------------------------- safeguards
  heading("09", "Quality safeguards");
  paragraph(
    "Accuracy is as much about the operator experience as the model. The interface actively coaches the pose and lighting conditions that matter, and it refuses to guess when the input is unusable.",
  );
  table(
    ["Guard", "Implementation", "Why it matters"],
    [
      ["Face presence gate", "No score is shown and no auto-capture is armed until the landmarker returns a face", "Prevents phantom captures of empty frames"],
      ["Lighting hint", "Average luminance is sampled every 12 frames from a 64x48 downscale; below 45 triggers advice", "Low light blurs mesh detail and flattens blendshapes"],
      ["Distance hint", "Face height below 27% of the frame asks the user to move closer", "Small faces produce noisy landmarks"],
      ["Centering hint", "Face centre beyond 17% of the frame width asks the user to recentre", "Off-centre faces clip the mouth or cheeks"],
      ["Hold timer", "Smile must stay above threshold for 900 ms", "Filters transitional expressions and talking"],
      ["Cooldown", "2.5 s between captures", "Prevents duplicate bursts"],
      ["Smoothing", "Median of five frames plus asymmetric EMA", "Removes jitter without hiding real changes"],
      ["Error handling", "Permission, busy-camera, and missing-camera states have explicit messages and retry", "Recovery instead of a silent black frame"],
    ],
    [32, 100, 44],
  );

  // ------------------------------------------------------- limitations
  heading("10", "Limitations and future work");
  subheading("Known limitations");
  bullets([
    "The accuracy estimate comes from a short single-person recording; it is not a cross-demographic benchmark.",
    "Extreme head yaw, heavy occlusion, and very low light reduce landmark quality even when a face is detected.",
    "Blendshape scores can be influenced by strong expressions that are not smiles, such as grimaces; the geometric cues mitigate but do not eliminate this.",
    "Photo quality is limited by the webcam and by JPEG encoding at 0.9 quality.",
    "IndexedDB quota is browser-managed; very large galleries may need pruning.",
  ]);

  subheading("Roadmap");
  bullets([
    "Add an optional 'review before save' mode and burst selection that keeps the single best smile from a 2-second window.",
    "Run the validation protocol across multiple consenting participants and lighting conditions to publish a cross-subject accuracy range.",
    "Store a lightweight embedding of each capture so the gallery can be grouped by expression intensity.",
    "Add exposure and white-balance feedback, plus a horizon/head-tilt guide.",
    "Offer a local folder export via the File System Access API for studio workflows.",
    "Provide print-ready contact sheets and compare-view for picking the best frame.",
  ]);

  // ------------------------------------------------------- run
  heading("11", "Running the project");
  paragraph(
    "The project is a standard Vite application. The model and WASM runtime are committed under public/, so the only network requirement is the initial dependency install.",
  );

  fill([18, 20, 16]);
  doc.roundedRect(MARGIN, y, CONTENT_W, 42, 2.4, 2.4, "F");
  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  doc.setTextColor(214, 224, 202);
  const commands = [
    "npm install",
    "npm run dev        # open the printed localhost URL",
    "npm run build      # type-check and produce dist/",
    "npm run preview    # serve the production build",
  ];
  commands.forEach((line, index) => {
    doc.text(line, MARGIN + 6, y + 9 + index * 7.2);
  });
  y += 49;

  paragraph(
    "Camera access requires a secure context: localhost during development, or HTTPS when hosted. On first load the browser asks for camera permission; if it is denied, the app explains how to re-enable it and offers a retry control.",
    { size: 8.6, color: MUTED },
  );

  subheading("Source map");
  table(
    ["Path", "Responsibility"],
    [
      ["src/hooks/useSmileEngine.ts", "Camera lifecycle, MediaPipe loop, smoothing, overlay rendering, quality hints"],
      ["src/lib/faceMetrics.ts", "Landmark geometry, blendshape fusion, score curve"],
      ["src/lib/validation.ts", "Threshold tuning, held-out metrics, persistence of results"],
      ["src/lib/db.ts", "IndexedDB CRUD and persistent-storage request"],
      ["src/lib/report.ts", "This PDF: layout, tables, analytics, contact sheet"],
      ["src/components/ScoreRing.tsx", "Accessible gauge with threshold marker and hold progress"],
      ["src/components/Gallery.tsx", "Local gallery, lightbox, download and delete"],
      ["src/components/AccuracyTest.tsx", "Guided two-segment validation workflow"],
      ["public/models/face_landmarker.task", "Bundled face landmark model"],
      ["public/wasm/", "Bundled MediaPipe WebAssembly runtime"],
    ],
    [62, 114],
  );

  subheading("Glossary");
  table(
    ["Term", "Meaning"],
    [
      ["Blendshape", "Coefficient (0-1) describing how strongly one facial action is present, following the ARKit naming scheme."],
      ["Landmark", "One of 478 3D points on the face mesh, normalised to image coordinates."],
      ["EMA", "Exponential moving average; the smoothing factor controls how quickly the score follows new input."],
      ["Hold-out split", "Data reserved from tuning so the final metric is not measured on the frames that chose the threshold."],
      ["Balanced accuracy", "Average of sensitivity and specificity; robust when the two classes have unequal sample counts."],
      ["IndexedDB", "Transactional browser database used here to persist photo blobs and metadata."],
    ],
    [32, 144],
  );

  // ------------------------------------------------------- page furniture
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    if (page === 1) continue;
    stroke(LINE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, PAGE_H - 14, PAGE_W - MARGIN, PAGE_H - 14);
    font(7, "normal", FAINT);
    doc.text("AI Selfie Capture System | Project Report", MARGIN, PAGE_H - 9);
    doc.text(`Page ${page} of ${pageCount}`, PAGE_W - MARGIN, PAGE_H - 9, { align: "right" });
    doc.text("Generated locally", MARGIN + 76, PAGE_H - 9);
  }

  doc.save(`AI-Selfie-Project-Report-${fileStamp()}.pdf`);
}
