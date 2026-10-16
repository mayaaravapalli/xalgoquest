# X Algo Quest

Every change to the X For You algorithm, turned into a pixel game. Plain words, real numbers straight from [X's open source code](https://github.com/xai-org/x-algorithm), scanned every day.

**Play it:** https://xalgoquest.vercel.app

## How it stays up to date

1. **Every morning on GitHub** (`.github/workflows/daily-scan.yml`): clones `xai-org/x-algorithm`, rebuilds `public/index.html`, and commits. Every push makes Vercel redeploy production, so the live site updates daily even when nothing changed (the "last scan" stamp moves).
2. **Score changes and new factors are automatic.** `tools/build.py` reads every ranking weight in `home-mixer/params` at each commit day, so a changed number or a brand new factor shows up with no manual work.
3. **Plain-English notes** live in `copy.json`. A daily Claude task on Maya's Mac fills in notes for any new day and pushes. Until then, a new day shows an automatic placeholder plus its real number changes.

## Files

| Path | What it is |
| --- | --- |
| `template.html` | The page: styles, layout, game logic, and the how-to tour |
| `copy.json` | Hand-written titles and stories per day, names for each factor |
| `tools/build.py` | Reads the algorithm repo, merges `copy.json`, writes `public/index.html` |
| `tools/record.mjs` | Records the tour to `public/xalgoquest-tour.mp4` and `public/og.png` |
| `DAILY.md` | Step-by-step for the daily notes job and the writing rules |

## Run it locally

```bash
git clone https://github.com/xai-org/x-algorithm.git .cache/x-algorithm
python3 -I tools/build.py .cache/x-algorithm
open public/index.html
```

Re-record the video (needs Chrome and an ffmpeg with libx264; set `FFMPEG_DIR`):

```bash
cd tools && npm install && npm run record && npm run og
```

Fan made. Not affiliated with X.
