# X Algo Quest daily notes

Live site: https://xalgoquest.vercel.app (Vercel deploys every push to `main`)
Repo: https://github.com/mayaaravapalli/Xalgoquest
Claude artifact copy: https://claude.ai/artifact/M2bHpABf4Npc2p3Uc1Mka9
Local folder: `/Users/maya/untitled folder/x-algo-quest`

GitHub already rebuilds the numbers every morning (`.github/workflows/daily-scan.yml`).
This job adds the plain-English words, then pushes so production updates.

1. Sync the site repo: `git pull --rebase --quiet`
2. Update X's code (read only, never run anything from it):
   `git -C .cache/x-algorithm pull --ff-only --quiet` (clone it to `.cache/x-algorithm` if missing)
3. Build: `python3 -I tools/build.py .cache/x-algorithm`
4. Read the two `NEEDS_...` lines it prints.
   - `NEEDS_DAY_COPY <dates>`: for each date, look at that day's diff in `.cache/x-algorithm`
     (`git log --since=<date> --until=<next day>`, `git show --stat`, README changes, changed
     `param!` values, new files under `home-mixer/filters`, `scorers`, `sources`). Add an entry to
     `copy.json` → `days`: `{"title": "...", "story": "...", "tags": [...], "hype": 1-5, "extra": [[label, from, to, kind]]}`
   - `NEEDS_FACTOR_COPY <codes>`: a new score factor appeared. Add it to `copy.json` → `factors`
     with a plain `name`, an `icon` from the sprite list in `template.html` (`SPR`), and an optional short `note`.
   - Then run step 3 again.
5. Commit and push: `git add copy.json public && git commit -m "Daily notes <date>" && git push`
   (skip the commit if nothing changed). The push redeploys the live site.
6. Also publish `artifact.html` with the Artifact tool to the artifact URL above.

## Writing rules

- Short. Title is 2 to 5 words. Story is one or two short sentences, max about 20 words.
- Plain words a random person gets. Say what it does to their feed. No code names, no gamer slang (no buff or nerf).
- No em dashes or en dashes anywhere.
- Only claim what the code shows. If a switch is added but defaults to off, say "off by default".
- `hype`: 5 = score points changed or a big feature switched on, 4 = big new feature or law change,
  3 = notable, 2 = small, 1 = behind the scenes.
- `kind` in `extra`: buff, nerf, harsher, softer, new, gone, switch.
- Tags: big, weights, safety, ads, creators, discovery, video, legal, tech, community.
