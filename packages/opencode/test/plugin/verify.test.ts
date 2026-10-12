import { afterEach, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import type { PluginInput } from "@opencode-ai/plugin"
import { detectChecks, findWeakening, VerifyPlugin } from "../../src/plugin/verify"

const dirs: string[] = []

afterEach(async () => {
  delete process.env.OPENCODE_VERIFY
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

async function repo(files: Record<string, string>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "verify-"))
  dirs.push(dir)
  await write(dir, files)
  await git(dir, "init", "-q")
  await git(dir, "add", "-A")
  await git(dir, "commit", "-qm", "init")
  return dir
}

async function write(dir: string, files: Record<string, string>) {
  for (const [file, text] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true })
    await Bun.write(path.join(dir, file), text)
  }
}

async function git(dir: string, ...args: string[]) {
  const proc = Bun.spawn(["git", "-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: dir, stdout: "pipe" })
  await proc.exited
  return (await new Response(proc.stdout).text()).trim()
}

test("detects package.json scripts with the right runner", async () => {
  const dir = await repo({
    "package.json": JSON.stringify({ scripts: { test: "vitest run", typecheck: "tsc --noEmit" } }),
    "pnpm-lock.yaml": "",
  })
  expect(await detectChecks(dir)).toEqual(["pnpm run typecheck", "pnpm run test"])
})

test("ignores the npm placeholder test script", async () => {
  const dir = await repo({
    "package.json": JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
  })
  expect(await detectChecks(dir)).toEqual([])
})

test("detects python tests", async () => {
  const dir = await repo({ "tests/test_x.py": "", "x.py": "" })
  const checks = await detectChecks(dir)
  expect(checks).toHaveLength(1)
  expect(checks[0]).toMatch(/python3 -m (pytest -q|unittest)$/)
})

test("flags skipped tests, removed assertions, suppressions and deleted test files", async () => {
  const dir = await repo({
    "test/a.test.ts": 'test("a", () => {\n  expect(1).toBe(1)\n  expect(2).toBe(2)\n})\n',
    "test/b.test.ts": 'test("b", () => {})\n',
    "tests/test_c.py": "def test_c():\n    assert True\n",
    "src/x.ts": "export const x = 1\n",
  })
  const base = await git(dir, "rev-parse", "HEAD")
  await write(dir, {
    "test/a.test.ts": 'test.skip("a", () => {\n  expect(1).toBe(1)\n})\n',
    "src/x.ts": "// @ts-ignore\nexport const x: string = 1\n",
  })
  await fs.rm(path.join(dir, "test/b.test.ts"))
  const findings = await findWeakening(dir, base)
  expect(findings).toContain("test/b.test.ts: test file deleted")
  expect(findings).toContain("test/a.test.ts: tests skipped or focused")
  expect(findings).toContain("test/a.test.ts: 1 assertion removed")
  expect(findings).toContain("src/x.ts: type/lint suppression added")
  expect(findings.some((f) => f.includes("test_c.py"))).toBe(false)
})

test("adding tests is not flagged", async () => {
  const dir = await repo({ "test/a.test.ts": 'test("a", () => {\n  expect(1).toBe(1)\n})\n' })
  const base = await git(dir, "rev-parse", "HEAD")
  await write(dir, { "test/a.test.ts": 'test("a", () => {\n  expect(1).toBe(1)\n  expect(3).toBe(3)\n})\n' })
  expect(await findWeakening(dir, base)).toEqual([])
})

async function plugin(dir: string) {
  process.env.OPENCODE_VERIFY = "1"
  const hooks = await VerifyPlugin({ directory: dir } as PluginInput)
  const start = () => hooks["chat.message"]!({ sessionID: "s" }, { message: {} as any, parts: [] })
  const stop = async (attempt = 0, parentID?: string) => {
    const output: { continue?: string; note?: string; metadata?: Record<string, any> } = {}
    await hooks["session.stopping"]!({ sessionID: "s", agent: "build", messageID: "m", attempt, parentID }, output)
    return output
  }
  return { start, stop }
}

const failingProject = {
  "package.json": JSON.stringify({ scripts: { test: "bun test" } }),
  "src/add.ts": "export const add = (a: number, b: number) => a - b\n",
  "test/add.test.ts": 'import { expect, test } from "bun:test"\nimport { add } from "../src/add"\ntest("add", () => {\n  expect(add(2, 3)).toBe(5)\n})\n',
}

test("does nothing when the turn changed no files", async () => {
  const dir = await repo(failingProject)
  const p = await plugin(dir)
  await p.start()
  expect(await p.stop()).toEqual({})
})

test("sends failing checks back, then passes once fixed", async () => {
  const dir = await repo({ ...failingProject, "src/add.ts": "export const add = (a: number, b: number) => a + b\n" })
  const p = await plugin(dir)
  await p.start()
  await write(dir, { "src/add.ts": "export const add = (a: number, b: number) => a * b\n" })
  const failed = await p.stop()
  expect(failed.continue).toContain("bun run test")
  expect(failed.metadata?.verify.status).toBe("failed")
  await write(dir, { "src/add.ts": "export const add = (a: number, b: number) => b + a\n" })
  const passed = await p.stop(1)
  expect(passed.continue).toBeUndefined()
  expect(passed.note).toStartWith("Verified")
  expect(passed.metadata?.verify.status).toBe("passed")
}, 30_000)

test("gives up as unverified when the agent stops again without changes", async () => {
  const dir = await repo({ ...failingProject, "src/add.ts": "export const add = (a: number, b: number) => a + b\n" })
  const p = await plugin(dir)
  await p.start()
  await write(dir, { "src/add.ts": "export const add = (a: number, b: number) => a * b\n" })
  expect((await p.stop()).continue).toBeDefined()
  const again = await p.stop(1)
  expect(again.continue).toBeUndefined()
  expect(again.metadata?.verify.status).toBe("unverified")
}, 30_000)

test("catches a test deleted to make the suite pass", async () => {
  const dir = await repo(failingProject)
  const p = await plugin(dir)
  await p.start()
  await fs.rm(path.join(dir, "test/add.test.ts"))
  await write(dir, { "test/other.test.ts": 'import { test } from "bun:test"\ntest("ok", () => {})\n' })
  const out = await p.stop()
  expect(out.continue).toContain("test file deleted")
  expect(out.metadata?.verify.status).toBe("failed")
}, 30_000)

test("skips subagent sessions and respects the env switch", async () => {
  const dir = await repo(failingProject)
  const p = await plugin(dir)
  await p.start()
  await write(dir, { "src/add.ts": "export const add = (a: number, b: number) => a * b\n" })
  expect(await p.stop(0, "parent")).toEqual({})
  process.env.OPENCODE_VERIFY = "0"
  expect(await p.stop()).toEqual({})
})
