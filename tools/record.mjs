// Records the page's videos at 30 fps with an 8-bit soundtrack.
// Usage: node tools/record.mjs                    site tour  -> public/xalgoquest-tour.mp4 (1920x1080)
//        node tools/record.mjs --promo            X promo    -> public/xalgoquest-x.mp4 (1080x1080)
//        node tools/record.mjs --stills DIR [--promo]   review frames
//        node tools/record.mjs --og               public/og.png share image
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FFMPEG_DIR = process.env.FFMPEG_DIR || resolve(ROOT, "../launchreel/node_modules/@remotion/compositor-darwin-arm64");
const FPS = 30;
const args = process.argv.slice(2);
const promo = args.includes("--promo"), og = args.includes("--og"), stillsAt = args.indexOf("--stills");
const hook = promo ? "__xaqPromo" : "__xaqTour";
const [W, H] = og ? [1200, 675] : promo ? [1080, 1080] : [1920, 1080];
const url = pathToFileURL(join(ROOT, "public/index.html")).href + (promo ? "#promo" : "#record");

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars", "--force-color-profile=srgb"] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: "networkidle0" });
await page.evaluate(async () => { await document.fonts.ready; });
await new Promise(r => setTimeout(r, 400));
const { dur, sounds, music } = await page.evaluate(h => ({ dur: window[h].dur, sounds: window[h].sounds, music: window[h].music || null }), hook);
const shot = async t => { await page.evaluate((h, t) => window[h].seek(t), hook, t); return page.screenshot({ type: "png" }); };

if (og) {
  writeFileSync(join(ROOT, "public/og.png"), await shot(6.4));
  console.log("wrote public/og.png");
} else if (stillsAt >= 0) {
  const dir = args[stillsAt + 1]; mkdirSync(dir, { recursive: true });
  const times = promo ? [0, .3, .97, 1.7, 2.95, 4.05, 5.5, 6.5, 8.5, 9.6, 11.0, 12.3, 14.0] : [0.3, 1.2, 2.6, 6.0, 8.2, 10.4, 12.6, 14.6, 16.8, 18.9, 20.8];
  for (const t of times) writeFileSync(join(dir, `${promo ? "p" : "t"}${t}.png`), await shot(t));
  console.log("stills in", dir);
} else {
  const wav = join(ROOT, `.cache/${promo ? "promo" : "tour"}-audio.wav`);
  mkdirSync(dirname(wav), { recursive: true });
  writeFileSync(wav, soundtrack(dur, sounds, music));
  const out = join(ROOT, promo ? "public/xalgoquest-x.mp4" : "public/xalgoquest-tour.mp4");
  if (existsSync(out)) rmSync(out);
  const ff = spawn(join(FFMPEG_DIR, "ffmpeg"), [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    "-i", wav,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17", "-preset", "medium",
    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out
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

/* 8-bit soundtrack: the page's own sound effects on cue, over a bass loop; the promo adds a kick on every beat */
function soundtrack(dur, cues, music) {
  const SR = 44100, n = Math.ceil((dur + .5) * SR), mix = new Float32Array(n);
  let seed = 9; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 * 2 - 1;
  const tone = (f, t0, len, vol, shape = "square") => {
    const a = Math.floor(t0 * SR), b = Math.min(n, a + Math.floor(len * SR));
    for (let i = Math.max(0, a); i < b; i++) {
      const tt = (i - a) / SR, ph = (tt * f) % 1;
      const w = shape === "square" ? (ph < .5 ? 1 : -1) : shape === "tri" ? 4 * Math.abs(ph - .5) - 1 : Math.sign(Math.sin(2 * Math.PI * ph)) * .6;
      mix[i] += w * vol * Math.exp(-tt * 3 / len);
    }
  };
  const kick = (t0, vol = .55) => {
    const a = Math.floor(t0 * SR), len = .2 * SR;
    let ph = 0;
    for (let i = 0; i < len && a + i < n; i++) { const tt = i / SR, f = 40 + 110 * Math.exp(-tt * 28); ph += f / SR; mix[a + i] += Math.sin(2 * Math.PI * ph) * vol * Math.exp(-tt * 16); }
  };
  const noise = (t0, len, vol, rise = false) => {
    const a = Math.floor(t0 * SR), b = Math.min(n, a + Math.floor(len * SR));
    for (let i = Math.max(0, a); i < b; i++) { const k = (i - a) / (b - a); mix[i] += rnd() * vol * (rise ? k * k : Math.exp(-k * 6)); }
  };
  const SFX = {
    blip: t => tone(660, t, .06, .16),
    tick: (t, f) => tone(f || 660, t, .04, .1),
    down: t => [784, 622, 523, 392].forEach((f, i) => tone(f, t + i * .08, .14, .12, "saw")),
    start: t => [262, 330, 392, 523, 392, 523, 659].forEach((f, i) => tone(f, t + i * .09, .15, .15)),
    up: t => [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * .07, .12, .16)),
    coin: t => { tone(988, t, .08, .16); tone(1319, t + .08, .3, .16); },
    mega: t => [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, t + i * .085, .16, .16)),
    slam: t => { kick(t, .8); noise(t, .35, .35); tone(55, t, .4, .25, "tri"); },
    riser: t => { noise(t, .5, .22, true); for (let i = 0; i < 8; i++) tone(330 * Math.pow(1.12, i), t + i * .06, .06, .06); }
  };
  cues.forEach(([t, name, arg]) => (SFX[name] || SFX.blip)(t, arg));
  const bpm = music ? music.bpm : 132, beat = 60 / bpm;
  const roots = [65.41, 55.0, 43.65, 49.0];
  for (let t = 0, k = 0; t < dur; t += beat / 2, k++) {
    const bar = Math.floor(k / 8) % 4, f = roots[bar] * (k % 2 ? 2 : 1);
    tone(f, t, beat / 2 * .95, music ? .09 : .07, "tri");
    if (k % 4 === 2) tone(roots[bar] * 6, t, beat / 2, .018);
    if (music && music.kick && t < music.until) {
      if (k % 2 === 0) kick(t);
      noise(t + beat / 4, .04, .05);
    }
  }
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(mix[i]));
  const gain = peak > .95 ? .95 / peak : 1;
  const out = Buffer.alloc(44 + n * 2);
  out.write("RIFF", 0); out.writeUInt32LE(36 + n * 2, 4); out.write("WAVE", 8); out.write("fmt ", 12);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22); out.writeUInt32LE(SR, 24);
  out.writeUInt32LE(SR * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write("data", 36); out.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / (SR * .005), (n - i) / (SR * .8));
    out.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(mix[i] * gain * env * 32767))), 44 + i * 2);
  }
  return out;
}
