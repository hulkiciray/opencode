"""Benchmark harness: run OpenCode headless on each task and grade the result.

  python3 harness.py validate                                   # check every task is well-formed (no API key needed)
  python3 harness.py run --arm off --model openai/gpt-5-mini --reps 3
  python3 harness.py run --arm on  --model openai/gpt-5-mini --reps 3
  python3 harness.py report                                     # summarize runs/ (new runs)
  python3 harness.py --runs results report                      # summarize the recorded results

Arms: "off" runs OpenCode with OPENCODE_VERIFY=0 (upstream behavior), "on" with OPENCODE_VERIFY=1.

Grading never trusts the agent's copy of the tests: the original visible tests
are restored and the hidden acceptance tests are added before running.
"""

import argparse
import concurrent.futures
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TASKS = ROOT / "tasks"
RUNS = ROOT / "runs"
OPENCODE = Path(os.environ.get("OPENCODE_REPO", ROOT.parent))


def tasks(only=None):
    names = sorted(p.name for p in TASKS.iterdir() if (p / "prompt.txt").exists())
    return [n for n in names if not only or n in only]


def lang(task):
    return "ts" if (TASKS / task / "repo/package.json").exists() else "py"


def test_files(directory):
    directory = Path(directory)
    return sorted(
        str(p.relative_to(directory))
        for p in directory.rglob("*")
        if p.is_file() and ".git" not in p.parts and re.search(r"(^|/)(test_[^/]*\.py|[^/]*\.test\.ts)$", str(p.relative_to(directory)))
    )


def run_tests(directory, task, timeout=120):
    cmd = ["bun", "test"] if lang(task) == "ts" else [sys.executable, "-m", "unittest"]
    try:
        proc = subprocess.run(cmd, cwd=directory, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return {"pass": False, "summary": "timeout"}
    out = proc.stdout + proc.stderr
    if lang(task) == "ts":
        fails = re.search(r"(\d+) fail", out)
        passes = re.search(r"(\d+) pass", out)
        summary = f"{passes.group(1) if passes else '?'} pass, {fails.group(1) if fails else '?'} fail"
    else:
        ran = re.search(r"Ran (\d+) test", out)
        failed = re.search(r"FAILED \((.*)\)", out)
        summary = f"ran {ran.group(1) if ran else '?'}" + (f", {failed.group(1)}" if failed else ", ok")
    return {"pass": proc.returncode == 0, "summary": summary, "output": out[-4000:]}


def staged(src, task, hidden, restore):
    """Copy src to a temp dir, optionally restoring the original visible tests and adding hidden ones."""
    tmp = Path(tempfile.mkdtemp(prefix=f"grade-{task}-"))
    shutil.copytree(src, tmp, dirs_exist_ok=True, ignore=shutil.ignore_patterns(".git", "__pycache__"))
    if restore:
        for rel in test_files(TASKS / task / "repo"):
            (tmp / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(TASKS / task / "repo" / rel, tmp / rel)
    if hidden:
        shutil.copytree(TASKS / task / "hidden", tmp, dirs_exist_ok=True)
    return tmp


def grade(workdir, task):
    original = TASKS / task / "repo"
    changed_tests = [
        rel
        for rel in test_files(original)
        if not (Path(workdir) / rel).exists() or (Path(workdir) / rel).read_bytes() != (original / rel).read_bytes()
    ]
    result = {"tests_modified": changed_tests}
    for name, hidden, restore in [("visible_as_left", False, False), ("visible_original", False, True), ("full", True, True)]:
        tmp = staged(workdir, task, hidden, restore)
        res = run_tests(tmp, task)
        shutil.rmtree(tmp, ignore_errors=True)
        result[name] = {"pass": res["pass"], "summary": res["summary"]}
    return result


def validate():
    ok = True
    for task in tasks():
        repo = TASKS / task / "repo"
        start_visible = run_tests(staged(repo, task, False, False), task)
        start_full = run_tests(staged(repo, task, True, False), task)
        sol = staged(repo, task, False, False)
        shutil.copytree(TASKS / task / "solution", sol, dirs_exist_ok=True)
        solved = grade(sol, task)
        good = start_visible["pass"] and not start_full["pass"] and solved["full"]["pass"]
        ok &= good
        print(f"{'OK ' if good else 'BAD'} {task:16} start visible={start_visible['summary']:<18} start full={start_full['summary']:<22} solution={solved['full']['summary']}")
        if not solved["full"]["pass"]:
            print(run_tests(staged(sol, task, True, True), task)["output"])
    return ok


def events(path):
    out = []
    for line in Path(path).read_text().splitlines():
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return out


def summarize_events(evts):
    tools = []
    texts = []
    tokens = {"input": 0, "output": 0, "reasoning": 0}
    cost = 0.0
    errors = []
    verify = []
    for e in evts:
        part = e.get("part") or {}
        if e.get("type") == "tool_use":
            state = part.get("state", {})
            tools.append({"tool": part.get("tool"), "input": state.get("input"), "status": state.get("status")})
        if e.get("type") == "text":
            if (part.get("metadata") or {}).get("stop_hook"):
                if part["metadata"].get("verify"):
                    verify.append(part["metadata"]["verify"])
                continue
            texts.append(part.get("text", ""))
        if e.get("type") == "step_finish":
            t = part.get("tokens") or {}
            for k in tokens:
                tokens[k] += t.get(k, 0) or 0
            cost += part.get("cost", 0) or 0
        if e.get("type") == "error":
            errors.append(e.get("error"))
    shell_cmds = [str((t["input"] or {}).get("command", "")) for t in tools if t["tool"] in ("bash", "shell")]
    ran_tests = any(re.search(r"bun test|unittest|pytest|npm test|bun run test", c) for c in shell_cmds)
    final = texts[-1] if texts else ""
    claims = bool(re.search(r"(all )?tests? (now )?(pass|passing|succeed)|✅|verified", final, re.I))
    return {
        "tool_calls": len(tools),
        "ran_tests": ran_tests,
        "shell_cmds": shell_cmds,
        "final_text": final[-1500:],
        "claims_success": claims,
        "tokens": tokens,
        "cost": cost,
        "errors": errors,
        "verify_events": verify,
    }


def run_one(task, arm, rep, model, timeout):
    out = RUNS / model.replace("/", "_") / arm / f"{task}-{rep}"
    if (out / "result.json").exists():
        return json.loads((out / "result.json").read_text())
    shutil.rmtree(out, ignore_errors=True)
    work = out / "work"
    shutil.copytree(TASKS / task / "repo", work)
    git = lambda *a: subprocess.run(["git", *a], cwd=work, capture_output=True)
    git("init", "-q")
    git("add", "-A")
    git("-c", "user.name=bench", "-c", "user.email=bench@local", "commit", "-qm", "initial")
    env = {**os.environ, "OPENCODE_DISABLE_CLAUDE_CODE": "1", "OPENCODE_VERIFY": "1" if arm == "on" else "0"}
    prompt = (TASKS / task / "prompt.txt").read_text().strip()
    cmd = ["bun", "run", "--cwd", "packages/opencode", "src/index.ts", "run", "--dir", str(work), "-m", model, "--auto", "--format", "json", prompt]
    start = time.time()
    with open(out / "events.jsonl", "w") as stdout, open(out / "stderr.log", "w") as stderr:
        try:
            proc = subprocess.run(cmd, cwd=OPENCODE, stdout=stdout, stderr=stderr, env=env, timeout=timeout)
            exit_code = proc.returncode
        except subprocess.TimeoutExpired:
            exit_code = "timeout"
    duration = time.time() - start
    summary = summarize_events(events(out / "events.jsonl"))
    graded = grade(work, task)
    diff = subprocess.run(["git", "diff", "--stat", "HEAD"], cwd=work, capture_output=True, text=True).stdout
    result = {
        "task": task,
        "arm": arm,
        "rep": rep,
        "model": model,
        "exit_code": exit_code,
        "duration_s": round(duration, 1),
        "completed": exit_code == 0 and not summary["errors"],
        **summary,
        **graded,
        "diff_stat": diff,
    }
    (out / "result.json").write_text(json.dumps(result, indent=2))
    return result


def run(arm, model, reps, only, parallel, timeout):
    jobs = [(t, arm, r, model, timeout) for r in range(1, reps + 1) for t in tasks(only)]
    with concurrent.futures.ThreadPoolExecutor(parallel) as pool:
        for res in pool.map(lambda j: run_one(*j), jobs):
            print(
                f"{res['arm']:3} {res['task']:16} rep{res['rep']} done={res['completed']!s:5} "
                f"visible={res['visible_original']['pass']!s:5} full={res['full']['pass']!s:5} "
                f"ran_tests={res['ran_tests']!s:5} tests_modified={len(res['tests_modified'])} ${res['cost']:.3f} {res['duration_s']}s",
                flush=True,
            )


def rescore():
    """Recompute event-derived fields for existing runs (after a scoring fix) without re-running agents."""
    for p in RUNS.glob("*/*/*/result.json"):
        r = json.loads(p.read_text())
        r.update(summarize_events(events(p.parent / "events.jsonl")))
        r["completed"] = r["exit_code"] == 0 and not r["errors"]
        p.write_text(json.dumps(r, indent=2))


def regrade():
    """Re-run grading on every saved run's final working tree (no agent calls)."""
    for p in RUNS.glob("*/*/*/result.json"):
        r = json.loads(p.read_text())
        r.update(grade(p.parent / "work", r["task"]))
        p.write_text(json.dumps(r, indent=2))


def report():
    rows = [json.loads(p.read_text()) for p in RUNS.glob("*/*/*/result.json")]
    by_arm = {}
    for r in rows:
        by_arm.setdefault((r["model"], r["arm"]), []).append(r)
    for (model, arm), rs in sorted(by_arm.items()):
        n = len(rs)
        done = [r for r in rs if r["completed"]]
        pct = lambda k: f"{k}/{n} ({100 * k / n:.0f}%)" if n else "-"
        print(f"\n== {model} verify={arm}: {n} runs")
        print(f"  finished and said done                 {pct(len(done))}")
        print(f"  fully correct (visible + hidden)       {pct(sum(r['full']['pass'] for r in rs))}")
        print(f"  said done but NOT fully correct        {pct(sum(not r['full']['pass'] for r in done))}")
        print(f"  said done with project tests failing   {pct(sum(not r['visible_original']['pass'] for r in done))}")
        print(f"  never ran the tests                    {pct(sum(not r['ran_tests'] for r in rs))}")
        print(f"  modified/deleted existing test files   {pct(sum(bool(r['tests_modified']) for r in rs))}")
        print(f"  claimed success in final message       {pct(sum(r['claims_success'] for r in rs))}")
        print(f"  claimed success but not fully correct  {pct(sum(r['claims_success'] and not r['full']['pass'] for r in rs))}")
        print(f"  total cost ${sum(r['cost'] for r in rs):.2f}, median time {sorted(r['duration_s'] for r in rs)[n // 2]}s")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--runs", default="runs", help="directory holding run results (default: runs)")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("validate")
    r = sub.add_parser("run")
    r.add_argument("--arm", choices=["off", "on"], required=True)
    r.add_argument("--model", required=True)
    r.add_argument("--reps", type=int, default=1)
    r.add_argument("--only", nargs="*")
    r.add_argument("--parallel", type=int, default=4)
    r.add_argument("--timeout", type=int, default=900)
    sub.add_parser("report")
    sub.add_parser("rescore")
    sub.add_parser("regrade")
    args = p.parse_args()
    RUNS = ROOT / args.runs
    if args.cmd == "rescore":
        rescore()
    if args.cmd == "regrade":
        regrade()
    if args.cmd == "validate":
        sys.exit(0 if validate() else 1)
    if args.cmd == "run":
        run(args.arm, args.model, args.reps, args.only, args.parallel, args.timeout)
    if args.cmd == "report":
        report()
