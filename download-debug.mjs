import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const OUT = "C:/Users/raksh/AppData/Local/Temp/opencode/download-debug";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: [
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
    "--enable-unsafe-swiftshader",
    "--no-first-run",
  ],
  defaultViewport: { width: 1400, height: 1000 },
});

const page = await browser.newPage();
const logs = [];
page.on("console", (message) => logs.push(`${message.type()}: ${message.text()}`));
page.on("pageerror", (error) => logs.push(`PAGEERROR: ${error.message}`));
page.on("popup", () => logs.push("POPUP"));
browser.on("targetcreated", (target) => logs.push(`TARGET ${target.type()} ${target.url()}`));

const client = await page.createCDPSession();
await client.send("Browser.setDownloadBehavior", {
  behavior: "allow",
  downloadPath: OUT,
  eventsEnabled: true,
});
await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: OUT }).catch((error) => logs.push(`PAGEDL ${error.message}`));
client.on("Browser.downloadWillBegin", (event) => logs.push(`DOWNLOAD_BEGIN ${JSON.stringify(event)}`));
client.on("Browser.downloadProgress", (event) => logs.push(`DOWNLOAD_PROGRESS ${JSON.stringify(event)}`));
client.on("Page.downloadWillBegin", (event) => logs.push(`PAGE_DOWNLOAD_BEGIN ${JSON.stringify(event)}`));

await page.goto("http://localhost:4173", { waitUntil: "networkidle2" });

// Baseline: plain blob download
const baseline = await page.evaluate(() => {
  const url = URL.createObjectURL(new Blob(["hello"], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "baseline.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return Boolean(url);
});
await new Promise((resolve) => setTimeout(resolve, 2500));
logs.push(`BASELINE ${baseline} files=${JSON.stringify(fs.readdirSync(OUT))}`);

// Real report
await page.click(".topbar__actions .btn--primary");
for (let attempt = 0; attempt < 40; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const files = fs.readdirSync(OUT);
  if (files.some((file) => file.endsWith(".pdf"))) break;
}
console.log(logs.join("\n"));
console.log("FILES", fs.readdirSync(OUT).map((file) => `${file}:${fs.statSync(path.join(OUT, file)).size}`));
console.log("PAGES", browser.targets().map((target) => `${target.type()} ${target.url()}`));
await browser.close();
