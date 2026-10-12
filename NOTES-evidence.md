# Raw evidence and engineering log

## 1. What the code does today (upstream dev @ 055d95bb7e, Oct 9 2026)

- The agent loop ends a turn as soon as the model returns finish=stop with no tool calls:
  `packages/opencode/src/session/prompt.ts` (the `if (lastAssistant?.finish && ...) break` block, ~line 1111 upstream).
  Nothing checks whether the work is correct before the turn ends.
- After an edit, OpenCode does feed LSP diagnostics back (type errors etc.):
  `packages/opencode/src/tool/edit.ts:198`, `write.ts:76`, `apply_patch.ts:271`.
  So static errors in edited files are covered. Tests and behavior are not.
- Plugin hooks (`packages/plugin/src/index.ts`) have nothing that fires before the loop exits.
  `session.idle` fires after the loop has already ended.
- The `opencode` CLI and TUI use this V1 loop (`server/routes/instance/httpapi/handlers/session.ts:291` → `SessionPrompt.loop`).
  A V2 runner (`packages/core/src/session/runner`, "opencode2") is in development.

## 2. Issue tracker evidence (github.com/anomalyco/opencode)

Repo size for context: ~212k stars, ~28k forks, ~6.1k open issues (Oct 10 2026).

| Issue | State | Signal | What it says |
|---|---|---|---|
| #12472 Native Claude Code hooks compatibility (PreToolUse, PostToolUse, Stop) | open since 2026-02-06 | 41 👍, ~19 comments | users porting Claude Code "Stop" hooks that verify the workflow (tests run etc.) before the agent stops; says session.idle workaround "can't re-activate the agent" |
| #16626 add session.stopping plugin hook to allow re-entering the agent loop | open since 2026-03-08 | 12 👍, 10 comments | explains why session.idle is insufficient (race with process teardown in `opencode run`, visible fake user message). Comments: wants `pnpm check-types` before session ends (guillempuche, 2026-06-20); "verified-claims gate" after a fabricated CLI flag incident (yg-codes, 2026-08-26) |
| #27167 Add native session goals with /goal | open since 2026-05-12 | 152 👍, 79 comments | wants the model to "mark a goal complete only after verification" |
| #27163 PR: native session goals | open since 2026-05-12 | not merged | goal is marked complete by the model itself via a tool |
| #44712 PR: session.stopping hook (V1) | closed 2026-10-10 | — | closed at the V1 freeze, told to port to V2 |
| #54487 PR: experimental.stopping hook (V2) | opened 2026-10-11 by jwitmann | — | same hook idea for V2; dogfooded with a "gate-fail → continue → rework → pass" plugin |
| #32132 Subagent terminates prematurely but reports completed | open since 2026-06-13 | — | parent agent trusts a "completed" status that isn't true |
| #39275 PreToolUse, Stop, SessionStart hook events | closed | — | another request for a Stop hook |
| #48239 Goal-mode round driver re-claims blindly after errors/cancel | open | — | someone's local goal-mode extension hits loop/cancel hazards in the core loop |
| #49433 Free tier can only be used from within OpenCode | open | 16 👍, 59 comments | (why our benchmark needs a paid key) |

Ecosystem: `opencode-goal-plugin` (added to docs ecosystem page, commit de7bb076a3), `opencode-claude-code-hooks` userland bridge (sjh9714), `oh-my-opencode`, `opencode-dev-framework`. People keep building workarounds.

Observation: almost all of this is about "keep the agent going until done", where "done" is decided by the model or by a user's custom script. Nothing built in checks the work against evidence (tests, diffs).

External research leads:
- METR's write-ups on reward hacking by frontier models (2025)
- ImpossibleBench (2025): measures how often models cheat on unit tests

## 3. Benchmark design (bench/)

- 10 small realistic tasks: 5 TypeScript (`bun test`), 5 Python (`unittest`). Each has a user-style prompt, visible tests in the repo, hidden acceptance tests, and a reference solution.
- `python3 harness.py validate` proves each task is well-formed: visible tests pass at the start, hidden tests fail at the start, the reference solution passes all.
- Grading never trusts the agent's copy of the tests: the original visible tests are restored and the hidden tests are added.
- Each task has a regression trap that the visible tests catch. Examples:
  - ts-pagination: paginating the shared `listItems()` breaks /stats and /export.
  - py-inventory: making `stock` mean "available" breaks the reports.
  - ts-lru-ttl: implementing `has()` through `get()` breaks recency.
  - ts-slugify: replacing symbols with spaces breaks "What's up" → "whats-up".
- Metrics:
  - said done
  - fully correct
  - said done but wrong
  - said done while the project's own tests were failing
  - never ran tests
  - test files modified
  - claimed success in the final message
  - cost and time
- Arms: `off` (verifier disabled, which is upstream behavior) vs `on`, with the same build and model.

## 4. What was built (branch `verify-gate`)

1. `session.stopping` plugin hook (packages/plugin/src/index.ts + session/prompt.ts):
   - Fires right before the loop would exit.
   - A plugin can return `continue` (sent to the model as a hidden synthetic user turn, and the loop keeps going) and/or `note` (shown to the user on the final assistant message).
   - Hard cap of 10 continuations per run.
   - A throwing plugin can't break the session.
   - Doesn't fire after aborted or errored turns.
2. Built-in verifier plugin (`packages/opencode/src/plugin/verify.ts`), opt-in via `"experimental": { "verify": true }` or `OPENCODE_VERIFY=1`:
   - At turn start it fingerprints the working tree (`git stash create` + untracked files). No side effects on the repo.
   - At stop it does nothing if the turn changed no files, or if this exact state already passed.
   - Detects checks: package.json `typecheck`/`test` scripts (picks pnpm/yarn/npm/bun by lockfile), Python (pytest if installed, otherwise unittest, prefers .venv), go test, cargo test, make test. Can be overridden with `commands`.
   - Weakening detection on the diff since turn start:
     - deleted test files
     - `.skip/.only/xit/@pytest.mark.skip/...`
     - net removed assertions
     - added `@ts-ignore`/`eslint-disable`/`# type: ignore`/`noqa`
     - changed `"test"` script
   - On failure it sends the failing output back to the agent, with an explicit "don't weaken tests; if it's pre-existing, say so".
   - Gives up as **Unverified** (visible to the user) when the attempt budget (default 3) is spent, or when the agent stops again **without changing anything**. That lets it push back on pre-existing failures without looping forever.
   - Only primary sessions are verified; subagents are skipped.
3. Tests: 3 loop tests (continue, cap, throwing plugin) + 10 verifier tests on real temp git repos. Full prompt + message-v2 suites still green (102 pass).

## 5. What failed or surprised (engineering log)

- **Free models can't be used from a source build.** Our first headless run got 403 "OpenCode's free tier can only be used from within OpenCode" (same as issue #49433). We didn't try to get around it, which is why a paid key is needed.
- **The first version of the user-facing note broke the next turn.** The note was stored as a text part with custom metadata on the assistant message. On the next model call, OpenCode replays assistant text-part metadata as `providerMetadata`. `{stop_hook: true}` fails the AI SDK schema: "Invalid prompt: The messages do not match the ModelMessage[] schema". The loop test caught it: the second LLM call never happened. Fix: notes from stop hooks are excluded from what's replayed to the model (message-v2.ts). The model gets its feedback through the synthetic user turn instead.
- **Plugin errors become defects.** `Plugin.trigger` wraps hooks in `Effect.promise`, so a throwing hook would kill the session. The stop-hook call is wrapped in `Effect.exit` and fails open: a test covers this.
- **Design dead end considered: a baseline test run at turn start** to tell pre-existing failures from new ones. We rejected it because the agent edits files while the baseline runs (race), and copying the repo elsewhere needs dependencies too. We chose "if the agent stops again without changes, accept and mark Unverified" instead.
- **Upstream context discovered mid-build:**
  - V1 loop changes are frozen upstream (#44712 closed 2026-10-10).
  - A V2 `experimental.stopping` hook PR (#54487) was opened 2026-10-11.
  - Our verifier only depends on the hook contract, so it can move onto V2's hook.

## 6. Benchmark results

### Baseline: stock behavior (verifier off), 10 tasks × 3 runs per model, run 2026-10-12

| | gpt-5-mini | gpt-4.1-mini | gpt-5-nano |
|---|---|---|---|
| said done | 30/30 | 29/30 | 30/30 |
| fully correct (visible + hidden tests) | 24/30 (80%) | 10/30 (33%) | 23/30 (77%) |
| said done but NOT fully correct | 6/30 (20%) | 19/30 (63%) | 7/30 (23%) |
| said done with the project's own tests failing | 0/30 | 2/30 (7%) | 1/30 (3%) |
| never ran the tests | 6/30 | 10/30 | 30/30 (never used the shell tool at all) |
| weakened existing tests | 0 | 0 | 0 (all test-file changes were the agent adding its own tests; original tests always still passed) |
| final message claimed success | 20/30 | 12/30 | 1/30 |
| claimed success but wrong | 6/30 | 7/30 | 1/30 |
| cost (30 runs) | $0.33 | $0.72 | $0.12 |

Typical false-success examples (gpt-5-mini):
- ts-slugify: the request said symbols should be dropped. The agent used Unicode NFKD, which turns "™" into "tm". Its own tests passed; it reported success.
- py-wrap: the request said long URLs go on their own line. The agent put *every* URL on its own line.
- ts-csv: CRLF inside quoted fields was normalized to LF. Caveat: our hidden test is stricter than the prompt's wording here (the prompt says "RFC 4180-style quoting" and "accept CRLF line endings"), so this task's failures are partly debatable.

What the baseline says:
- The failure a test gate catches (finishing while the project's tests fail, or weakening tests) is **rare**: 0–7% depending on the model.
- The common failure is the agent misreading a requirement that no existing test covers. It writes tests for its own interpretation, they pass, and it reports success.
- So "make the agent run the tests" is not where most false "done"s come from. Passing tests are not proof the request was done.

### Verifier on vs off (same tasks, same models, 3 runs each; total spend for everything: $2.26)

| | gpt-5-mini off → on | gpt-4.1-mini off → on | gpt-5-nano off → on |
|---|---|---|---|
| fully correct | 24 → 24 /30 | 10 → 11 /30 | 23 → 23 /30 |
| said done with project tests failing | 0 → 0 | 2 → 0 | 1 → 0 |
| claimed success but wrong | 6 → 5 | 7 → 5 | 1 → 0 |
| cost (30 runs) | $0.33 → $0.30 | $0.72 → $0.65 | $0.12 → $0.14 |

Across all 90 runs, "said done with the project's tests failing" went from 3 to 0. Overall correctness did not change in a meaningful way (differences of 0–1 runs are noise at n=30).

Every run where the verifier stepped in (9 of 90):

| model | task | what happened | end state |
|---|---|---|---|
| gpt-4.1-mini | py-bizdays r2 | tests failed → sent back → passed | tests pass, hidden fail |
| gpt-4.1-mini | py-bizdays r3 | tests failed → sent back → passed | tests pass, hidden fail |
| gpt-4.1-mini | py-wrap r2 | the agent's own new tests kept failing 3× → marked **Unverified** to the user | honest "unverified" instead of "done" |
| gpt-4.1-mini | ts-csv r2 | agent had **removed 6 assertions** from existing tests → sent back → restored them | fully correct |
| gpt-5-nano | py-bizdays r2 | tests failed → passed | fully correct |
| gpt-5-nano | py-wrap r2 | tests failed → passed | fully correct |
| gpt-5-nano | ts-csv r1 | tests failed → passed | tests pass, hidden fail |
| gpt-5-nano | ts-emitter r1 | failed twice → passed | fully correct |
| gpt-5-nano | ts-lru-ttl r2 | tests failed → passed | fully correct |

So: 9 interventions. 8 ended with the checks green and 1 was honestly labeled Unverified; 5 of 9 ended fully correct. 1 caught test weakening (6 removed assertions), which the agent then restored.

### Bugs found during the evaluation (also "what failed")

- **Harness scoring bug:** "claimed success" jumped to 100% with the verifier on, because the regex matched the verifier's own "Verified: …" note. Fixed: notes are excluded from the agent's final text, and all runs were rescored from the saved event logs.
- **Verifier false positive:** "package.json: test script changed" fired when the agent only added a dependency (the line holding `"test"` got a trailing comma). Fixed to compare the actual script value; regression test added (commit on verify-gate).
- **Harness grading bug:** the grading copy skipped `node_modules`, so a run that installed a dependency (csv-parse) was graded as failing although its tests pass. Fixed and all runs regraded from their saved final working trees (no agent re-runs).

### Honest conclusion from the data

- The verifier does what it claims: no run in the verifier arm ended with the project's tests failing (0/90 vs 3/90), and it caught and reversed one case of test weakening.
- But that failure mode is rare for these models on these tasks. The dominant failure, misread requirements that no existing test covers, is untouched: correctness was 80/33/77% with and without it.
- Cost overhead is negligible (≈ ±10%, within noise). Time overhead = running the checks (seconds here).
- Natural next step suggested by the data: check *requirement coverage* (does each explicit requirement in the request have evidence?), not just "are the existing tests green".
- Limits: 10 small synthetic tasks, 3 runs each, 3 cheap OpenAI models. Hidden tests for ts-csv are stricter than the prompt wording.
