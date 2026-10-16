// Records the on-page tour to public/xalgoquest-tour.mp4 (1920x1080, 30 fps, 8-bit soundtrack).
// Usage: node tools/record.mjs            full video
//        node tools/record.mjs --stills DIR   a few PNG frames for review
//        node tools/record.mjs --og        public/og.png share image
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FFMPEG_DIR = process.env.FFMPEG_DIR || resolve(ROOT, "../launchreel/node_modules/@remotion/compositor-darwin-arm64");
const FPS = 30, W = 1920, H = 1080;
const args = process.argv.slice(2);
const page_url = pathToFileURL(join(ROOT, "public/index.html")).href + "#record";

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars", "--force-color-profile=srgb"] });
const page = await browser.newPage();
const og = args[0] === "--og";
await page.setViewport({ width: og ? 1200 : W, height: og ? 675 : H, deviceScaleFactor: 1 });
await page.goto(page_url, { waitUntil: "networkidle0" });
await page.evaluate(async () => { await document.fonts.ready; });
await new Promise(r => setTimeout(r, 400));
const { dur, sounds } = await page.evaluate(() => ({ dur: window.__xaqTour.dur, sounds: window.__xaqTour.sounds }));
const shot = async t => { await page.evaluate(t => window.__xaqTour.seek(t), t); return page.screenshot({ type: "png" }); };

if (og) {
  writeFileSync(join(ROOT, "public/og.png"), await shot(7.6));
  console.log("wrote public/og.png");
} else if (args[0] === "--stills") {
  const dir = args[1]; mkdirSync(dir, { recursive: true });
  for (const t of [0.0, 0.5, 1.3, 2.9, 4.9, 6.9, 9.8, 12.2, 15.6, 18.5, 20.7, 23.3]) writeFileSync(join(dir, `t${t}.png`), await shot(t));
  console.log("stills in", dir);
} else {
  const wav = join(ROOT, ".cache/tour-audio.wav");
  mkdirSync(dirname(wav), { recursive: true });
  writeFileSync(wav, soundtrack(dur, sounds));
  const out = join(ROOT, "public/xalgoquest-tour.mp4");
  if (existsSync(out)) rmSync(out);
  const ff = spawn(join(FFMPEG_DIR, "ffmpeg"), [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    "-i", wav,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium",
    "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out
  ], { env: { ...process.env, DYLD_LIBRARY_PATH: FFMPEG_DIR }, stdio: ["pipe", "inherit", "inherit"] });
  const total = Math.round(dur * FPS);
  for (let i = 0; i < total; i++) {
    const buf = await shot(i / FPS);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
    if (i % 150 === 0) console.log(`frame ${i}/${total}`);
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on("close", c => c === 0 ? r() : j(new Error("ffmpeg exit " + c))));
  console.log("wrote", out);
}
await browser.close();

/* 8-bit soundtrack: the page's own sound effects on cue, over a soft square-wave bass loop */
function soundtrack(dur, cues) {
  const SR = 44100, n = Math.ceil((dur + .5) * SR), mix = new Float32Array(n);
  const tone = (f, t0, len, vol, shape = "square") => {
    const a = Math.floor(t0 * SR), b = Math.min(n, a + Math.floor(len * SR));
    for (let i = a; i < b; i++) {
      const tt = (i - a) / SR, ph = (tt * f) % 1;
      const w = shape === "square" ? (ph < .5 ? 1 : -1) : shape === "tri" ? 4 * Math.abs(ph - .5) - 1 : Math.sign(Math.sin(2 * Math.PI * ph)) * .6;
      mix[i] += w * vol * Math.exp(-tt * 3 / len);
    }
  };
  const SFX = {
    blip: t => tone(660, t, .06, .16),
    tick: (t, f) => tone(f || 660, t, .04, .1),
    down: t => [784, 622, 523, 392].forEach((f, i) => tone(f, t + i * .08, .14, .12, "saw")),
    start: t => [262, 330, 392, 523, 392, 523, 659].forEach((f, i) => tone(f, t + i * .09, .15, .15)),
    up: t => [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * .07, .12, .16)),
    coin: t => { tone(988, t, .08, .16); tone(1319, t + .08, .3, .16); },
    mega: t => [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, t + i * .085, .16, .16))
  };
  cues.forEach(([t, name, arg]) => (SFX[name] || SFX.blip)(t, arg));
  // bass: C Am F G, eighth notes at 132 bpm, from the first frame
  const roots = [65.41, 55.0, 43.65, 49.0], beat = 60 / 132;
  for (let t = 0, k = 0; t < dur; t += beat / 2, k++) {
    const bar = Math.floor(k / 8) % 4, f = roots[bar] * (k % 2 ? 2 : 1);
    tone(f, t, beat / 2 * .95, .07, "tri");
    if (k % 4 === 2) tone(roots[bar] * 6, t, beat / 2, .018);
  }
  const out = Buffer.alloc(44 + n * 2);
  out.write("RIFF", 0); out.writeUInt32LE(36 + n * 2, 4); out.write("WAVE", 8); out.write("fmt ", 12);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22); out.writeUInt32LE(SR, 24);
  out.writeUInt32LE(SR * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write("data", 36); out.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / (SR * .01), (n - i) / (SR * .8));
    out.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(mix[i] * env * 32767))), 44 + i * 2);
  }
  return out;
}
