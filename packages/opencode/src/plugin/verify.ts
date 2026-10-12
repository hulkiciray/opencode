import path from "path"
import type { Hooks, PluginInput } from "@opencode-ai/plugin"

// Verifies the agent's work before a primary session is allowed to finish a turn that changed files:
// runs the project's own checks, flags edits that weaken tests, and sends failures back to the agent
// through the session.stopping hook. Enabled with `experimental.verify` or OPENCODE_VERIFY=1.

type Settings = { commands?: string[]; max_attempts?: number; timeout?: number }

type CheckResult = { command: string; ok: boolean; code: number | null; duration: number; output: string }

type Turn = {
  base?: string
  verified?: string
  failed?: string
  attempts: number
  warned: boolean
}

const TEST_FILE = /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]*\.py$|_test\.(py|go)$/
const SKIP_MARKER =
  /\b(it|test|describe)\.(skip|todo|only)\(|\bx(it|describe|test)\(|@pytest\.mark\.(skip|xfail)|@unittest\.skip|pytest\.skip\(|self\.skipTest\(|\bt\.Skip\(|#\[ignore\]/
const ASSERTION = /\b(expect|assert\w*|should)\b/
const SUPPRESSION = /@ts-ignore|@ts-nocheck|@ts-expect-error|eslint-disable|#\s*type:\s*ignore|#\s*noqa|#\s*pragma: no cover/

async function sh(cwd: string, cmd: string[], timeout = 30_000) {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, CI: "true" } })
  const timer = setTimeout(() => proc.kill(), timeout)
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]).finally(() => clearTimeout(timer))
  return { stdout, stderr, code: proc.signalCode ? null : code }
}

async function git(cwd: string, ...args: string[]) {
  const res = await sh(cwd, ["git", "-c", "user.name=opencode", "-c", "user.email=opencode@localhost", ...args])
  return res.code === 0 ? res.stdout.trim() : undefined
}

// A cheap identifier of the working tree state: a stash commit of tracked changes (or HEAD) plus untracked files.
async function fingerprint(cwd: string) {
  const tracked = (await git(cwd, "stash", "create")) || (await git(cwd, "rev-parse", "HEAD"))
  if (tracked === undefined) return undefined
  const untracked = (await git(cwd, "ls-files", "--others", "--exclude-standard")) ?? ""
  const files = untracked.split("\n").filter(Boolean).slice(0, 500)
  const hashes = files.length ? ((await git(cwd, "hash-object", "--", ...files)) ?? "") : ""
  return [tracked, files.join(","), hashes].join("|")
}

async function exists(file: string) {
  return Bun.file(file).exists()
}

export async function detectChecks(dir: string): Promise<string[]> {
  const checks: string[] = []
  if (await exists(path.join(dir, "package.json"))) {
    const pkg = await Bun.file(path.join(dir, "package.json"))
      .json()
      .catch(() => ({}))
    const scripts: Record<string, string> = pkg.scripts ?? {}
    const runner = (await exists(path.join(dir, "pnpm-lock.yaml")))
      ? "pnpm"
      : (await exists(path.join(dir, "yarn.lock")))
        ? "yarn"
        : (await exists(path.join(dir, "package-lock.json")))
          ? "npm"
          : "bun"
    if (scripts.typecheck) checks.push(`${runner} run typecheck`)
    if (scripts.test && !scripts.test.includes("no test specified")) checks.push(`${runner} run test`)
  }
  const python = (
    await Promise.all(
      ["pyproject.toml", "setup.py", "setup.cfg", "pytest.ini", "tox.ini", "requirements.txt"].map((f) =>
        exists(path.join(dir, f)),
      ),
    )
  ).some(Boolean)
  const pyTests = await sh(dir, ["git", "ls-files", "--cached", "--others", "--exclude-standard", "*test_*.py", "*_test.py"])
  if (python || pyTests.stdout.trim()) {
    const venv = (await exists(path.join(dir, ".venv/bin/python")))
      ? ".venv/bin/python"
      : (await exists(path.join(dir, "venv/bin/python")))
        ? "venv/bin/python"
        : undefined
    const py = venv ? path.join(dir, venv) : "python3"
    const pytest = await sh(dir, [py, "-c", "import pytest"]).catch(() => ({ code: 1 }))
    checks.push(pytest.code === 0 ? `${py} -m pytest -q` : `${py} -m unittest`)
  }
  if (await exists(path.join(dir, "go.mod"))) checks.push("go test ./...")
  if (await exists(path.join(dir, "Cargo.toml"))) checks.push("cargo test")
  if (!checks.length && (await exists(path.join(dir, "Makefile")))) {
    const makefile = await Bun.file(path.join(dir, "Makefile")).text()
    if (/^test:/m.test(makefile)) checks.push("make test")
  }
  return checks
}

async function runCheck(dir: string, command: string, timeout: number): Promise<CheckResult> {
  const start = Date.now()
  const res = await sh(dir, ["sh", "-c", command], timeout * 1000).catch((e) => ({
    stdout: "",
    stderr: String(e),
    code: 1,
  }))
  const output = (res.stdout + res.stderr).trim().split("\n").slice(-60).join("\n").slice(-4000)
  return { command, ok: res.code === 0, code: res.code, duration: Date.now() - start, output }
}

// Look at what changed since the turn started for signs that tests were weakened instead of the code being fixed.
export async function findWeakening(dir: string, base: string) {
  const findings: string[] = []
  const status = (await git(dir, "diff", "--name-status", base)) ?? ""
  for (const line of status.split("\n").filter(Boolean)) {
    const [kind, file] = line.split("\t")
    if (kind === "D" && TEST_FILE.test(file)) findings.push(`${file}: test file deleted`)
  }
  const diff = (await git(dir, "diff", "--no-color", "-U0", base)) ?? ""
  const files = diff.split(/^diff --git /m).slice(1)
  for (const chunk of files) {
    const file = chunk.match(/ b\/(.+)\n/)?.[1] ?? ""
    const added = chunk.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    const removed = chunk.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"))
    if (TEST_FILE.test(file)) {
      if (added.some((l) => SKIP_MARKER.test(l))) findings.push(`${file}: tests skipped or focused`)
      const lost = removed.filter((l) => ASSERTION.test(l)).length - added.filter((l) => ASSERTION.test(l)).length
      if (lost > 0) findings.push(`${file}: ${lost} assertion${lost === 1 ? "" : "s"} removed`)
    }
    if (added.some((l) => SUPPRESSION.test(l))) findings.push(`${file}: type/lint suppression added`)
    if (path.basename(file) === "package.json" && removed.some((l) => /"test"\s*:/.test(l)))
      findings.push(`${file}: test script changed`)
  }
  return findings
}

function format(results: CheckResult[]) {
  return results
    .filter((r) => !r.ok)
    .map(
      (r) =>
        `✗ \`${r.command}\` ${r.code === null ? "timed out" : `exited with code ${r.code}`}:\n\`\`\`\n${r.output}\n\`\`\``,
    )
    .join("\n\n")
}

export async function VerifyPlugin(input: PluginInput): Promise<Hooks> {
  let settings: Settings | undefined
  const turns = new Map<string, Turn>()
  const enabled = () => {
    const env = process.env.OPENCODE_VERIFY
    if (env !== undefined) return env === "1" || env === "true"
    return settings !== undefined
  }

  return {
    config: async (cfg) => {
      const verify = (cfg.experimental as { verify?: boolean | Settings } | undefined)?.verify
      settings = verify === true ? {} : verify || undefined
    },
    "chat.message": async (msg) => {
      if (!enabled()) return
      turns.set(msg.sessionID, { base: await fingerprint(input.directory), attempts: 0, warned: false })
    },
    "session.stopping": async (info, output) => {
      if (!enabled() || info.parentID) return
      const dir = input.directory
      const turn = turns.get(info.sessionID)
      const now = await fingerprint(dir)
      // Nothing to verify: not a git repo, no turn start recorded, no changes this turn, or this exact state already passed.
      if (!turn || !now || !turn.base || now === turn.base || now === turn.verified) return
      const max = settings?.max_attempts ?? 3
      const commands = settings?.commands ?? (await detectChecks(dir))
      const results: CheckResult[] = []
      for (const command of commands) results.push(await runCheck(dir, command, settings?.timeout ?? 300))
      const baseCommit = turn.base.split("|")[0]
      const weakening = await findWeakening(dir, baseCommit)
      const failed = results.filter((r) => !r.ok)
      const summary = results.map((r) => `${r.ok ? "✓" : "✗"} ${r.command}`).join(", ")
      const metadata = (status: string) => ({
        verify: {
          status,
          attempt: turn.attempts,
          checks: results.map((r) => ({ command: r.command, ok: r.ok, code: r.code, duration: r.duration })),
          weakening,
        },
      })

      if (!commands.length && !weakening.length) {
        output.note = "Verification skipped: no checks found for this project (set experimental.verify.commands)."
        output.metadata = metadata("skipped")
        return
      }

      const blocking = failed.length > 0 || (weakening.length > 0 && !turn.warned)
      if (!blocking) {
        turn.verified = now
        output.note = weakening.length
          ? `Verified with warnings: ${summary}. Test changes to review: ${weakening.join("; ")}`
          : `Verified: ${summary}`
        output.metadata = metadata(weakening.length ? "passed_with_warnings" : "passed")
        return
      }

      // Give up when the budget is spent, or when the agent ended its turn again without changing anything
      // (it is pushing back, e.g. the failure is pre-existing); the user sees the turn as unverified.
      if (turn.attempts >= max || now === turn.failed) {
        output.note = `Unverified: ${summary}${weakening.length ? `. Test changes to review: ${weakening.join("; ")}` : ""}`
        output.metadata = metadata("unverified")
        return
      }

      turn.attempts++
      turn.failed = now
      turn.warned ||= weakening.length > 0
      output.note = `Verification failed (attempt ${turn.attempts}/${max}): ${summary}${weakening.length ? `; ${weakening.length} test change(s) flagged` : ""}. Sent back to the agent.`
      output.metadata = metadata("failed")
      output.continue = [
        "Before finishing, OpenCode verified your changes and found problems.",
        format(results),
        weakening.length
          ? `These changes look like they weaken the tests instead of fixing the code:\n${weakening.map((w) => `- ${w}`).join("\n")}\nRevert them unless the user explicitly asked for them.`
          : "",
        "Keep working until the checks pass. Do not skip, delete or loosen tests to make them pass. If a failure is pre-existing or unrelated to your change, or a test change was explicitly requested, do not change more code: say so clearly in your final message.",
      ]
        .filter(Boolean)
        .join("\n\n")
    },
  }
}
