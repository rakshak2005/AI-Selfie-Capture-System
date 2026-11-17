import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const OUT = "C:/Users/raksh/AppData/Local/Temp/opencode/e2e-out";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const smileFace = fs.readFileSync("C:/Users/raksh/AppData/Local/Temp/opencode/obama.jpg").toString("base64");
const neutralFace = fs.readFileSync("C:/Users/raksh/AppData/Local/Temp/opencode/lena.jpg").toString("base64");

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: [
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
    "--window-size=1440,1100",
    "--enable-unsafe-swiftshader",
    "--no-first-run",
  ],
  defaultViewport: { width: 1440, height: 1080, deviceScaleFactor: 1 },
});

const page = await browser.newPage();
const logs = [];
page.on("console", (message) => logs.push(`${message.type()}: ${message.text()}`));
page.on("pageerror", (error) => logs.push(`PAGEERROR: ${error.message}`));
page.on("requestfailed", (request) =>
  logs.push(`REQFAIL: ${request.url()} ${request.failure()?.errorText ?? ""}`),
);

const client = await page.createCDPSession();
await client.send("Browser.setDownloadBehavior", {
  behavior: "allow",
  downloadPath: OUT,
  eventsEnabled: true,
});

await page.evaluateOnNewDocument(
  ({ smile, neutral }) => {
    const load = (base64) =>
      new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.src = `data:image/jpeg;base64,${base64}`;
      });

    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 960;
    const context = canvas.getContext("2d");
    let active = null;

    const paint = () => {
      if (!active) return;
      const scale = Math.max(canvas.width / active.width, canvas.height / active.height);
      const width = active.width * scale;
      const height = active.height * scale;
      context.save();
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
      context.drawImage(active, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      context.restore();
    };

    Promise.all([load(smile), load(neutral)]).then(([smileImage, neutralImage]) => {
      window.__faces = { smile: smileImage, neutral: neutralImage };
      active = smileImage;
      paint();
      window.setInterval(paint, 40);
    });

    window.__setFace = (name) => {
      active = window.__faces?.[name] ?? null;
    };

    const stream = canvas.captureStream(30);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => stream,
        enumerateDevices: async () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
  },
  { smile: smileFace, neutral: neutralFace },
);

const waitFace = () =>
  page.waitForFunction(
    () => document.querySelector(".stage__footer")?.textContent?.includes("Face locked"),
    { timeout: 30000 },
  );

await page.goto("http://localhost:4173", { waitUntil: "networkidle2", timeout: 60000 });
await waitFace();
await new Promise((resolve) => setTimeout(resolve, 2500));

const readState = () =>
  page.evaluate(() => ({
    score: document.querySelector(".ring__value")?.textContent?.trim(),
    label: document.querySelector(".ring__label")?.textContent?.trim(),
    footer: document.querySelector(".stage__footer")?.textContent?.replace(/\s+/g, " ").trim(),
    gallery: document.querySelectorAll(".shot").length,
    threshold: document.querySelector(".slider-row__label strong")?.textContent?.trim(),
  }));

const initial = await readState();
await page.screenshot({ path: path.join(OUT, "01-live.png") });

// Manual capture
await page.click(".btn--capture");
await page.waitForFunction(() => document.querySelectorAll(".shot").length === 1, { timeout: 10000 });
await new Promise((resolve) => setTimeout(resolve, 900));
const afterManual = await readState();

const stored = await page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("smile-studio");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const rows = await new Promise((resolve, reject) => {
    const request = db.transaction("captures", "readonly").objectStore("captures").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return rows.map((row) => ({
    smile: row.smile,
    source: row.source,
    width: row.width,
    height: row.height,
    bytes: row.dataUrl.length,
  }));
});
await page.screenshot({ path: path.join(OUT, "02-manual-capture.png") });

// Auto capture (score is already above the default threshold)
await page.click(".switch-card");
await page.waitForFunction(() => document.querySelectorAll(".shot").length >= 2, { timeout: 15000 }).catch(() => {});
await new Promise((resolve) => setTimeout(resolve, 700));
const afterAuto = await readState();
await page.screenshot({ path: path.join(OUT, "03-auto-capture.png") });

// Report 1: no validation data
async function generateReport(previousCount) {
  await page.click(".topbar__actions .btn--primary");
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const files = fs.readdirSync(OUT).filter((file) => file.endsWith(".pdf"));
    if (files.length > previousCount) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return files.map((file) => path.join(OUT, file)).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
    }
  }
  return null;
}
const reportOne = await generateReport(0);

// Accuracy test: neutral (Lena) -> smile (Obama)
await page.evaluate(() => window.__setFace("neutral"));
await new Promise((resolve) => setTimeout(resolve, 2500));
const neutralState = await readState();
await page.click(".switch-card--action");
await new Promise((resolve) => setTimeout(resolve, 500));
await page.screenshot({ path: path.join(OUT, "04-accuracy-intro.png") });
await page.click(".modal__actions .btn--primary");
await new Promise((resolve) => setTimeout(resolve, 6600));
await page.evaluate(() => window.__setFace("smile"));
await new Promise((resolve) => setTimeout(resolve, 600));
await page.screenshot({ path: path.join(OUT, "05-accuracy-smile.png") });
await page.waitForFunction(() => Boolean(document.querySelector(".test-result__score")), { timeout: 30000 }).catch(() => {});
await new Promise((resolve) => setTimeout(resolve, 700));
const validationState = await page.evaluate(() => {
  const raw = localStorage.getItem("smile-studio.validation.v2");
  return {
    result: raw ? JSON.parse(raw) : null,
    shown: document.querySelector(".test-result__score")?.textContent?.trim(),
    threshold: document.querySelector(".slider-row__label strong")?.textContent?.trim(),
  };
});
await page.screenshot({ path: path.join(OUT, "06-accuracy-result.png") });
await page.click(".test-result .modal__actions .btn--ghost");

// Report 2: measured validation data
await new Promise((resolve) => setTimeout(resolve, 400));
const reportTwo = await generateReport(1);

// Gallery + lightbox
await page.screenshot({ path: path.join(OUT, "07-gallery.png"), fullPage: true });
await page.click(".shot__open");
await new Promise((resolve) => setTimeout(resolve, 500));
await page.screenshot({ path: path.join(OUT, "08-lightbox.png") });
await page.click(".lightbox__actions .btn--icon");

// Mobile
await page.setViewport({ width: 390, height: 900, deviceScaleFactor: 1 });
await new Promise((resolve) => setTimeout(resolve, 1200));
await page.screenshot({ path: path.join(OUT, "09-mobile.png"), fullPage: true });

const summary = {
  initial,
  afterManual,
  afterAuto,
  stored,
  neutralState,
  validationState,
  reportOne,
  reportOneBytes: reportOne ? fs.statSync(reportOne).size : null,
  reportTwo,
  reportTwoBytes: reportTwo ? fs.statSync(reportTwo).size : null,
  logs: logs.filter(
    (line) =>
      !line.includes("Sets FaceBlendshapesGraph") &&
      !line.includes("OpenGL error checking") &&
      !line.includes("Graph successfully started") &&
      !line.includes("XNNPACK delegate"),
  ),
};
console.log(JSON.stringify(summary, null, 2));

await browser.close();
