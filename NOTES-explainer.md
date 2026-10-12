# Claude's explainer notes (study material, not the submission)

> Detailed numbers and sources are in NOTES-evidence.md. The code is at https://github.com/hulkiciray/opencode/tree/verify-gate

---

## Part 1: Problem statement

### What is broken or missing
- OpenCode ends a turn when the model stops calling tools and says it's finished. This is the exit check in `packages/opencode/src/session/prompt.ts`.
- Nothing checks the work at that moment. "Done" = "the model says so".
- Partial coverage exists: after each edit, OpenCode shows the agent language-server errors (type errors). But it never runs the project's tests and never notices weakened tests.
- Plugins can't fix this. No hook fires before the turn ends; `session.idle` fires after it has ended.

### What people are asking to change (issues on github.com/anomalyco/opencode)

| Issue | What people want |
|---|---|
| #12472 (open since Feb, 41 👍) | Claude Code hooks, especially the **Stop hook**, which they use to check "were tests run?" before the agent may stop. Say the `session.idle` workaround can't put the agent back to work. |
| #16626 (open since Mar) | Exactly a `session.stopping` hook. Explains why `session.idle` fails: in headless `opencode run` the process exits before a re-prompt arrives, and a re-prompt shows up as a fake user message. Comments: wants `pnpm check-types` before the session ends; wants a "verified-claims gate" after an agent invented a command-line flag. |
| #27167 (152 👍, 79 comments) | `/goal` mode: keep working until the goal is done. Its PR #27163 has been open since May. **The model marks its own goal complete.** |
| #44712 / #54487 | V1 stop-hook PR closed at the V1 freeze; a V2 version was opened the day before we started. |
| #32132 | A subagent stops halfway and reports "completed"; the parent believes it. |
| Ecosystem | Workaround plugins: opencode-goal-plugin, opencode-claude-code-hooks, oh-my-opencode. |

**Pattern:** strong demand for "don't stop until it's really done", but every existing solution trusts either the model's word or a script the user writes. Nothing built in checks the work against evidence.

### Who it hurts
- Developers who trust "done" and move on without reviewing.
- Headless/CI users (`opencode run`): nobody watching, so a false "done" goes straight downstream.
- Plugin authors: no supported place to add a check.

### Why it matters
- A false "done" is worse than an honest "not sure": the person stops looking, and bugs found later cost more.

### Evidence it's real (measured before building)
90 runs of stock OpenCode: 10 tasks × 3 runs × 3 models.

| | gpt-5-mini | gpt-4.1-mini | gpt-5-nano |
|---|---|---|---|
| said done but wrong | 20% | 63% | 23% |
| final message claimed success but wrong | 6 runs | 7 runs | 1 run |
| done with project tests failing | 0% | 7% | 3% |

**Key finding:** finishing with the project's tests failing was rare, and nobody weakened tests. The common failure was **misreading the request**. The agent wrote tests for its own interpretation, they passed, and it reported success. Examples:
- "drop symbols" became ™ → "tm"
- *every* URL went on its own line, not just the long ones

---

## Part 2: Solution statement

### What was built
1. **`session.stopping` hook** in the core loop. Before the turn ends, plugins are asked. A plugin can send the agent back with a message (hidden from the user) or add a note the user sees. Capped at 10 continuations; a crashing plugin can't break the session.
2. **Verifier plugin** on top of the hook. Opt-in via config or `OPENCODE_VERIFY=1`.

### How it works
1. Turn starts: snapshot of the files using git (changes nothing).
2. Agent tries to stop: if no files changed, do nothing.
3. Otherwise detect the project's checks (test/typecheck scripts, pytest/unittest, go, cargo) and run them.
4. Scan the changes for cheating: deleted test files, `.skip`, removed assertions, `@ts-ignore`, a changed test script.
5. **Failure:** send the error output back to the agent ("fix the code, don't loosen the tests, say so if the problem was already there"). The user sees "Verification failed, attempt 1/3".
6. **Pass:** the user sees "Verified ✓".
7. **Still failing** after 3 tries, or the agent stops again without changes: marked **"Unverified"** instead of done.

### Why this approach
- Evidence over self-report (the `/goal` designs let the model grade itself).
- A general hook plus one plugin: others can build their own checks; this answers #16626 and #12472.
- Opt-in: slow test suites shouldn't affect anyone by default.
- The "stops again without changes" rule lets the agent push back on failures that already existed, with no endless loop.

### What was tried that failed
- Free models are blocked for source builds (#49433), so a paid key was needed.
- The first version of the user note broke the next model call: note metadata was replayed to OpenAI as provider metadata and rejected. A test caught it; fixed by keeping notes out of what's replayed to the model.
- Plugin errors would have crashed the loop, so the hook call was isolated.
- Rejected idea: running the tests at turn start to find failures that already existed (the agent edits files while those tests run).
- The starting assumption was wrong: we expected agents to skip or break tests. The measurement showed misread requirements dominate.
- Evaluation bugs found and fixed:
  - a scoring regex counted the verifier's own note as the agent claiming success
  - a false alarm on `package.json`
  - grading skipped `node_modules`
- Upstream: the V1 loop is frozen and a V2 hook PR appeared in parallel. The verifier only depends on the hook contract, so it can move to V2.

### How we know it works
- 14 new automated tests (11 verifier, 3 loop); 72 pass with OpenCode's existing loop tests.
- Benchmark graded on restored original tests plus hidden tests:

| | gpt-5-mini | gpt-4.1-mini | gpt-5-nano |
|---|---|---|---|
| fully correct (off → on, /30) | 24 → 24 | 10 → 11 | 23 → 23 |
| done with project tests failing | 0 → 0 | 2 → 0 | 1 → 0 |

- Stepped in on 9 runs: 8 ended green, 1 honestly marked Unverified. Once it caught an agent that had removed 6 assertions; the agent restored them.
- **Bottom line:** it fully removes the failure it targets, at negligible cost. It doesn't fix misread requirements; that's the next step.
- **Limits:** 10 small synthetic tasks, 3 runs each, 3 cheap models; the ts-csv hidden test is stricter than its prompt.

### How hard the problem is
- A change in the core agent loop of an Effect-based codebase that's mid-migration.
- Fail-safe design: the cap, error isolation, no infinite loops.
- Telling failures that already existed apart from new ones.
- Cheating detection.
- A fair, cheat-proof benchmark with hidden tests.
