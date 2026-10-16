#!/usr/bin/env python3
"""Build X Algo Quest data from the xai-org/x-algorithm repo.

Usage: python3 -I tools/build.py <path-to-x-algorithm-clone>

Reads every commit day, every ranking weight in home-mixer params, merges the
hand-written copy in copy.json, and writes index.html from template.html.
Prints any patch days or factors that still need hand-written copy.
"""
import datetime
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = sys.argv[1]
GH = "https://github.com/xai-org/x-algorithm"
PARAM = re.compile(r'param!\(\s*(\w+)\s*,\s*([^,]+?)\s*,\s*"([^"]+)"\s*,\s*(.+?)\s*\)\s*;', re.S)


def git(*args):
    return subprocess.run(["git", "-C", REPO, *args], capture_output=True, text=True).stdout


def params_at(sha):
    out = {}
    for f in git("ls-tree", "-r", "--name-only", sha, "home-mixer").splitlines():
        if f.endswith(".rs") and "param" in f:
            for m in PARAM.finditer(git("show", f"{sha}:{f}")):
                out[m.group(1)] = re.sub(r"\s+", " ", m.group(4))
    return out


def num(v):
    try:
        return float(v)
    except ValueError:
        return None


def is_factor(name):
    return name.endswith("Weight") or name.endswith("WeightBoost")


copy = json.load(open(os.path.join(HERE, "copy.json")))

# Group commits by day, oldest first.
days = []
for line in git("log", "--reverse", "--date=short", "--pretty=%H %ad").splitlines():
    sha, date = line.split()
    if days and days[-1]["date"] == date:
        days[-1]["shas"].append(sha)
    else:
        days.append({"date": date, "shas": [sha]})

prev = {}
factors = {}
out_days = []
for d in days:
    files = plus = minus = 0
    for sha in d["shas"]:
        stat = git("show", "--shortstat", "--format=", sha)
        for n, kind in re.findall(r"(\d+) (file|insertion|deletion)", stat):
            if kind == "file":
                files += int(n)
            elif kind == "insertion":
                plus += int(n)
            else:
                minus += int(n)
    cur = params_at(d["shas"][-1])
    chips = []
    for k, v in cur.items():
        if not is_factor(k):
            continue
        val = num(v)
        if k not in factors:
            factors[k] = {"code": k, "since": d["date"], "history": [[d["date"], val]]}
            if prev:  # not the first snapshot: this is a brand new factor
                chips.append({"factor": k, "from": None, "to": val, "kind": "new"})
        elif k in prev and prev[k] != v:
            factors[k]["history"].append([d["date"], val])
            old = num(prev[k])
            if val is not None and old is not None:
                if val < 0 or old < 0:
                    kind = "harsher" if val < old else "softer"
                else:
                    kind = "buff" if val > old else "nerf"
                chips.append({"factor": k, "from": old, "to": val, "kind": kind})
        factors[k].pop("gone", None)
    for k in prev:
        if is_factor(k) and k not in cur and k in factors:
            factors[k]["gone"] = d["date"]
            chips.append({"factor": k, "from": num(prev[k]), "to": None, "kind": "gone"})
    if cur:
        prev = cur
    note = copy["days"].get(d["date"])
    lines = plus + minus
    auto_hype = 1 if lines < 2000 else 2 if lines < 8000 else 3 if lines < 20000 else 4
    entry = {
        "date": d["date"],
        "sha": d["shas"][-1][:7],
        "url": f"{GH}/commit/{d['shas'][-1]}",
        "commits": len(d["shas"]),
        "files": files,
        "plus": plus,
        "minus": minus,
        "chips": chips,
        "title": note["title"] if note else "Behind-the-scenes patch",
        "story": note["story"] if note else "Code changed under the hood. Full notes land with the next scan.",
        "extra": note.get("extra", []) if note else [],
        "tags": note.get("tags", []) if note else ["tech"],
        "hype": note.get("hype", auto_hype) if note else max(auto_hype, 3 if chips else 1),
        "needsCopy": note is None,
    }
    out_days.append(entry)

out_factors = []
for k, f in factors.items():
    meta = copy["factors"].get(k, {})
    f["name"] = meta.get("name") or re.sub(r"(?<!^)(?=[A-Z])", " ", k.replace("WeightBoost", " Bonus").replace("Weight", "")).strip()
    f["note"] = meta.get("note", "")
    f["icon"] = meta.get("icon", "unknown")
    f["now"] = f["history"][-1][1]
    out_factors.append(f)

head_date = out_days[-1]["date"]
data = {
    "repo": GH,
    "checkedAt": datetime.datetime.now().astimezone().isoformat(timespec="minutes"),
    "latest": head_date,
    "days": out_days,
    "factors": out_factors,
}

tpl = open(os.path.join(HERE, "template.html")).read()
blob = json.dumps(data, separators=(",", ":")).replace("</", "<\\/")
page = tpl.replace("/*DATA*/null", blob)

# artifact.html: the fragment the claude.ai Artifact viewer wraps in its own skeleton
open(os.path.join(HERE, "artifact.html"), "w").write(page)

# public/index.html: a complete document for the Vercel site
SITE = "https://xalgoquest.vercel.app"
DESC = "Every change to the X For You algorithm, turned into a pixel game. Plain words, real numbers from X's code, scanned every day."
cut = page.index('<canvas id="fx"')
head, body = page[:cut], page[cut:]
meta = f"""<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="{DESC}">
<link rel="canonical" href="{SITE}/">
<meta property="og:type" content="website">
<meta property="og:title" content="X Algo Quest">
<meta property="og:description" content="{DESC}">
<meta property="og:url" content="{SITE}/">
<meta property="og:image" content="{SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="X Algo Quest">
<meta name="twitter:description" content="{DESC}">
<meta name="twitter:image" content="{SITE}/og.png">
<style>:root{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}body{{margin:0}}img{{max-width:100%}}[hidden]{{display:none!important}}</style>
"""
os.makedirs(os.path.join(HERE, "public"), exist_ok=True)
open(os.path.join(HERE, "public", "index.html"), "w").write(
    f'<!doctype html>\n<html lang="en">\n<head>\n{meta}{head}</head>\n<body>\n{body}\n</body>\n</html>\n')

missing_days = [d["date"] for d in out_days if d["needsCopy"]]
missing_factors = [f["code"] for f in out_factors if f["code"] not in copy["factors"]]
print(f"days={len(out_days)} factors={len(out_factors)} latest={head_date}")
print("NEEDS_DAY_COPY", " ".join(missing_days) or "-")
print("NEEDS_FACTOR_COPY", " ".join(missing_factors) or "-")
