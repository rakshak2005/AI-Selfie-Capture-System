import puppeteer from "puppeteer-core";
import fs from "node:fs";

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1200, height: 900 },
});

for (const name of ["obama", "biden", "lena"]) {
  const base64 = fs.readFileSync(`C:/Users/raksh/AppData/Local/Temp/opencode/${name}.jpg`).toString("base64");
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.evaluateOnNewDocument((faceBase64) => {
    const image = new Image();
    image.src = `data:image/jpeg;base64,${faceBase64}`;
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 960;
    const context = canvas.getContext("2d");
    image.onload = () => {
      const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      const paint = () => {
        context.save();
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
        context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
        context.restore();
      };
      paint();
      window.setInterval(paint, 40);
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
  }, base64);

  await page.goto("http://localhost:4173", { waitUntil: "networkidle2" });
  await page.waitForFunction(
    () => document.querySelector(".stage__footer")?.textContent?.includes("Face locked"),
    { timeout: 25000 },
  ).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const state = await page.evaluate(() => ({
    ring: document.querySelector(".ring__value")?.textContent?.trim(),
    label: document.querySelector(".ring__label")?.textContent?.trim(),
    hint: document.querySelector(".panel__hint")?.textContent?.trim(),
    footer: document.querySelector(".stage__footer")?.textContent?.replace(/\s+/g, " ").trim(),
  }));

  console.log(name, JSON.stringify(state), errors.length ? errors : "");
  await page.close();
}

await browser.close();
