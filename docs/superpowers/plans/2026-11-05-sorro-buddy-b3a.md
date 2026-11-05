# Sorro AI Buddy B3a (Training the offline council) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the training data, eval sets and one Colab notebook that fine-tune, check and publish the three local models (L1 Router, L2 Actor, L3 Checker) as transformers.js-ready q4 ONNX.

**Architecture:** A stdlib-only Python generator builds every example from templates and the real tool schemas, exported from `tools.ts` by a small Node script. A Node validator runs the app's own `validateArgs` over the generated calls. The notebook takes an uploaded zip, LoRA-trains each model, exports and quantises it, scores it on the held-out eval, loads it in transformers.js as a smoke test, and pushes it to Hugging Face only if it passes its bar. B3b (wiring the models into the app) is a separate plan.

**Tech Stack:** Python 3 stdlib (generator), Node 22+ (schema export, validator), Colab T4 with `transformers`, `peft`, `trl`, `optimum[onnxruntime]`, `onnxruntime` MatMulNBits q4, `huggingface_hub`, `@huggingface/transformers` (smoke test).

**Spec:** `docs/superpowers/specs/2026-11-05-sorro-ai-buddy-design.md`, sections D2 and D5.

## Global Constraints

- Synthetic data only. No personal chats (spec decision R1). Gemini paraphrasing is optional and runs only when `GEMINI_API_KEY` is set in the environment.
- Models, bases and bars, verbatim from the spec:

| Model | Base | Size (q4) | Pass bar on eval |
|---|---|---|---|
| L1 Router | SmolLM2-135M-Instruct | ~100 MB | 95% correct route |
| L2 Actor | Qwen2.5-0.5B-Instruct | ~400 MB | 85% exact tool name and valid args |
| L3 Checker | SmolLM2-360M-Instruct | ~250 MB | Flags 80% of wrong writes, under 10% false flags |

- Targets: ~3,000 L1 examples (label plus quip), ~4,000 L2 multi-turn tool-call traces, ~3,000 L3 pairs (request, proposed write, verdict, reason) with about 40% deliberately wrong writes (wrong date, wrong id, wrong list, missing time zone). ~200 held-out eval cases per model.
- A model that misses its bar is not published.
- Hugging Face repos are public, `{HF_USER}/sorro-router`, `{HF_USER}/sorro-actor`, `{HF_USER}/sorro-checker`. `HF_USER` is a notebook setting. The user has no account yet.
- The 10 tools and `validateArgs` come from `supabase/functions/assistant/tools.ts`, and the voice from `FOX_VOICE` in `voice.ts`. Never re-type them.
- Task and note ids in examples are UUIDs (`validateArgs` requires them).
- `training/` is not shipped with the app. Generated data (`training/data/`, `training/upload.zip`) is git-ignored.
- Commits: plain message, no co-author trailer (user's CLAUDE.md).

## Model I/O contracts (B3b depends on these exactly)

- **L1 Router.** System: `ROUTER_SYSTEM`. User: the message. Output: `read`, `write`, or `chat: <quip>`. Nothing else.
- **L2 Actor.** Qwen2.5's own chat template with `tools=` (the 10 schemas). System: `ACTOR_SYSTEM` with today's date and time zone filled in. A tool call is Qwen's `<tool_call>{"name": ..., "arguments": {...}}</tool_call>`. Tool results go back as role `tool`. The final turn is a short reply in the fox voice.
- **L3 Checker.** System: `CHECKER_SYSTEM`. User: `Today: <YYYY-MM-DD> (<tz>)\nRequest: <message>\nKnown ids: <id: title, ...>\nCall: <name> <json args>`. Output: `ok` or `wrong: <reason>`.
- All three system prompts live in `training/prompts.json`, written by the generator. B3b loads the same file's strings.

## Review Focus

1. Relative dates near month and year ends ("tomorrow" on Dec 31, "on the 3rd" said on the 20th): the label is the correct real day. Pinned in Task 1 (`resolve_day` tests).
2. Eval cases that share a sentence with training data, which would inflate scores. Pinned in Task 3 (no-overlap check).
3. A generated L2 call or an `ok` L3 call that the app's `validateArgs` rejects: training on it teaches calls the app refuses. Pinned in Task 3 (`validate.mjs` must report 0 failures).
4. An exported model that transformers.js cannot load (wrong file name or layout): it would pass the eval and break the app. Pinned in Task 4 (the Node smoke cell).
5. A model below its bar getting pushed anyway. Pinned in Task 4 (the push cell refuses).

---

### Task 1: Schema export and date phrases

**Files:**
- Create: `training/export.mjs`, `training/dates.py`, `training/generate_check.py`
- Modify: `.gitignore` (add `training/data/`, `training/upload.zip`, `training/tools.json`, `training/voice.json`)

**Interfaces:**
- Produces:
  - `node training/export.mjs` writes `training/tools.json` (the `TOOLS` array) and `training/voice.json` (`{ "FOX_VOICE": "..." }`), importing `../supabase/functions/assistant/tools.ts` and `voice.ts`.
  - `training/dates.py`: `PHRASES: list[str]` (templates such as `today`, `tomorrow`, `in {n} days`, `next {weekday}`, `on {weekday}`, `on the {nth}`, `{month} {day}`), `resolve_day(phrase: str, today: date) -> date`, and `render(template: str, today: date, rng: random.Random) -> tuple[str, date]` (fills a template and returns the phrase with its real day). "on {weekday}" means the next such day, today excluded. "on the {nth}" means this month if that day is still ahead, else next month.

- [ ] **Step 1: Write the failing checks** in `training/generate_check.py` (plain `assert`, run as a script, prints `ok` at the end):

```python
from datetime import date
from dates import resolve_day
assert resolve_day('tomorrow', date(2026, 12, 31)) == date(2027, 1, 1)
assert resolve_day('in 3 days', date(2026, 2, 27)) == date(2026, 3, 2)
assert resolve_day('on friday', date(2026, 11, 6)) == date(2026, 11, 13)   # a Friday: the next one
assert resolve_day('next monday', date(2026, 11, 5)) == date(2026, 11, 9)
assert resolve_day('on the 3rd', date(2026, 11, 20)) == date(2026, 12, 3)
assert resolve_day('on the 25th', date(2026, 11, 20)) == date(2026, 11, 25)
assert resolve_day('november 30', date(2026, 12, 1)) == date(2027, 11, 30)   # a past date means next year
```

- [ ] **Step 2: Run** `python training/generate_check.py`. Expected: `ModuleNotFoundError: No module named 'dates'` (run from `training/`; the script inserts its own directory on `sys.path`).
- [ ] **Step 3: Implement** `dates.py` and `export.mjs`.
- [ ] **Step 4: Run** `node training/export.mjs && python training/generate_check.py`. Expected: `tools.json` holds 10 tools, and the check prints `ok`.
- [ ] **Step 5: Commit** `git commit -m "Training: export the tool schemas and resolve date phrases"`

### Task 2: Router and actor data

**Files:**
- Create: `training/generate.py`
- Modify: `training/generate_check.py`

**Interfaces:**
- Consumes: `tools.json`, `voice.json`, `dates.render` (Task 1).
- Produces: `python training/generate.py [--seed 7] [--paraphrase]` writes `training/data/{router,actor,checker}.{train,eval}.jsonl` and `training/prompts.json` (`ROUTER_SYSTEM`, `ACTOR_SYSTEM`, `CHECKER_SYSTEM`). Each line is `{"messages": [...]}` in chat format, plus for actor and checker an `"expect"` object the eval scores against:
  - actor: `{"name": str, "arguments": dict}` for the first call
  - checker: `{"verdict": "ok" | "wrong", "kind": "date" | "id" | "list" | "tz" | null}`
  - router: `{"route": "chat" | "read" | "write"}`

Generation rules:
- Each model has two disjoint template pools, train and eval (about 80/20 by template, not by example). Eval files use only eval templates and seed + 1000.
- Today varies per example across 2026 to 2027 (dates in December, February and around month ends included). The time zone is drawn from `Asia/Manila`, `Asia/Singapore`, `America/New_York`.
- Router: ~1,000 each of `read` (questions about tasks, events, notes, news), `write` (requests that create, complete or append), `chat` (greetings, thanks, banter; the target is `chat: ` plus a short line in the fox voice from a pool of at least 60).
- Actor: for each tool, user phrasings × slot values (titles, lists, notebooks, times, durations). Reads get a fake tool result (UUID ids, plausible titles), then a reply. `complete_task` and `append_note` traces first call `list_tasks` / `search_notes`, then use an id from that fake result. Events: `starts_at` / `ends_at` ISO with the time zone's offset for that date (`zoneinfo`), and a 60-minute default length.
- `--paraphrase`: if `GEMINI_API_KEY` is set, rewrite up to 30% of user messages via the Gemini REST API (urllib, `gemini-3.6-flash`), keeping the slot values. Without the key it prints one line and skips.

- [ ] **Step 1: Add the failing checks** to `generate_check.py` (generate with `--seed 7` into a temp dir first):

```python
rows = load('router.train')
routes = Counter(r['expect']['route'] for r in rows)
assert min(routes.values()) / len(rows) > 0.28, routes
assert all(r['messages'][-1]['content'].startswith('chat: ') for r in rows if r['expect']['route'] == 'chat')
actor = load('actor.train')
assert len(actor) >= 3500
assert {r['expect']['name'] for r in actor} == {t['name'] for t in TOOLS}
assert all(re.fullmatch(r'[0-9a-f-]{36}', r['expect']['arguments']['id']) for r in actor if r['expect']['name'] == 'complete_task')
```

- [ ] **Step 2: Run** `python training/generate_check.py`. Expected: FAIL, `generate.py` missing.
- [ ] **Step 3: Implement** the router and actor parts of `generate.py`.
- [ ] **Step 4: Run** the check. Expected: `ok`.
- [ ] **Step 5: Commit** `git commit -m "Training: router and actor data"`

### Task 3: Checker data, eval guard and validator

**Files:**
- Modify: `training/generate.py`, `training/generate_check.py`
- Create: `training/validate.mjs`

**Interfaces:**
- Consumes: `generate.py` (Task 2), `validateArgs` and `WRITES` from `tools.ts`.
- Produces: `checker.{train,eval}.jsonl`. `node training/validate.mjs` reads every actor tool call (all turns) and every checker example with verdict `ok`, runs `validateArgs`, prints `checked N, failed 0`, and exits 1 on any failure.

Checker rules: built from actor write traces (`WRITES` only). 60% `ok` with the correct call. 40% `wrong`, split evenly across:
- **date:** off by one day, or the wrong weekday for "on friday".
- **id:** an id not in the known list, or another known task's id.
- **list:** a list or notebook the user did not name.
- **tz:** `starts_at` without an offset, or with the wrong zone's offset.

The reason is one short sentence naming the problem.

- [ ] **Step 1: Add the failing checks:**

```python
chk = load('checker.train')
wrong = [r for r in chk if r['expect']['verdict'] == 'wrong']
assert 0.36 < len(wrong) / len(chk) < 0.44
assert {r['expect']['kind'] for r in wrong} == {'date', 'id', 'list', 'tz'}
assert all(r['messages'][-1]['content'].startswith('wrong: ') for r in wrong)
for name in ('router', 'actor', 'checker'):
    train_users = {m['content'] for r in load(f'{name}.train') for m in r['messages'] if m['role'] == 'user'}
    ev = load(f'{name}.eval')
    assert 150 <= len(ev) <= 300
    assert not any(m['content'] in train_users for r in ev for m in r['messages'] if m['role'] == 'user'), name
```

- [ ] **Step 2: Run** `python training/generate_check.py`. Expected: FAIL on the checker asserts.
- [ ] **Step 3: Implement** the checker generation and `validate.mjs`.
- [ ] **Step 4: Run** `python training/generate.py && python training/generate_check.py && node training/validate.mjs`. Expected: `ok`, then `checked N, failed 0`. Read 20 random lines of each eval file and confirm the labels by eye. Record in the ledger how many were wrong; more than 1 in 20 means fix the generator first.
- [ ] **Step 5: Commit** `git commit -m "Training: checker data, held-out evals and the schema validator"`

### Task 4: The Colab notebook

**Files:**
- Create: `training/sorro_buddy.ipynb`, `training/pack.py`

**Interfaces:**
- Consumes: the data files, `prompts.json`, `tools.json` (Tasks 1–3).
- Produces: `python training/pack.py` writes `training/upload.zip` (data, `prompts.json`, `tools.json`). The notebook publishes three repos with this layout, which B3b loads with transformers.js `dtype: 'q4'`: `config.json`, `generation_config.json`, the tokenizer files, `onnx/model_q4.onnx` (plus `onnx/model_q4.onnx_data` when over 2 GB), and `sorro_eval.json` with the scores.

Cells, in order:
1. Markdown: what to do (Runtime → T4 GPU; add `HF_TOKEN` in Colab secrets; set `HF_USER`; Run all; upload `upload.zip` when asked).
2. Settings: `HF_USER = ''`, `PUSH = True`, and per-model `EPOCHS`, `LR`, `LORA_R`. Defaults: router 3 epochs, lr 2e-4, r 16; actor 2 epochs, lr 1e-4, r 32; checker 3 epochs, lr 2e-4, r 16. If `HF_USER` is empty, stop with a clear message.
3. Install pinned versions (`pip install -q transformers==… peft==… trl==… optimum[onnxruntime]==… onnxruntime==… huggingface_hub==…`; pin the versions current on the day this is built and note them in the cell).
4. Upload and unzip.
5. `train(name, base, epochs, lr, r)`: SFT with LoRA on the assistant turns only (`assistant_only_loss` / completion-only collator), bf16 off and fp16 on (T4), batch size adjusted per model to fit 16 GB. Merge LoRA into the base and save to `out/<name>/merged`.
6. `export(name)`: `optimum-cli export onnx --task text-generation-with-past`, then q4 with onnxruntime `MatMulNBitsQuantizer` (block 32, symmetric), saved as `out/<name>/onnx/model_q4.onnx`. Copy the tokenizer and configs alongside.
7. `evaluate(name)`: load the q4 model with `optimum.onnxruntime.ORTModelForCausalLM`, greedy decoding, score the eval file:
   - router: exact route.
   - actor: parse the first `<tool_call>` JSON; pass if the name matches and the arguments equal `expect.arguments` after dropping empty optional keys.
   - checker: catch rate over `wrong` cases and false-flag rate over `ok` cases.
   
   Write `sorro_eval.json` and print the score against the bar.
8. Smoke test: `npm i @huggingface/transformers@<pinned>`, then a Node script loads `out/<name>` with `env.allowLocalModels = true`, `dtype: 'q4'`, `device: 'cpu'`, generates for one eval case, and prints the output. Fails the cell on an exception.
9. `publish(name)`: refuses unless the bar passed and the smoke test passed. Then `create_repo(f'{HF_USER}/sorro-{name}', exist_ok=True)` and `upload_folder` with the README (base model, data note "synthetic, no personal data", the scores).
10. Run router, checker, then actor (the largest last, so a session timeout loses the least).

- [ ] **Step 1: Write `pack.py`** and run `python training/generate.py && python training/pack.py`. Expected: `training/upload.zip` exists with the 6 data files and 2 JSON files.
- [ ] **Step 2: Write the notebook** as JSON (nbformat 4). Check it parses: `python -c "import json;json.load(open('training/sorro_buddy.ipynb'))"`.
- [ ] **Step 3: Lint the code cells**: extract them to a temp `.py` and run `python -m py_compile` on it, skipping `!`/`%` lines. Expected: no syntax errors.
- [ ] **Step 4: Commit** `git commit -m "Training: the Colab notebook"`. The real run is on Colab (the user's GPU session), so this task's evidence is the parse and compile checks. The run itself is the user's step in Task 5.

### Task 5: Hand over

- [ ] **Step 1:** Whole-branch review (fresh reviewer). Fix Critical and Important findings with a failing check first.
- [ ] **Step 2:** Push the branch, fast-forward master (nothing in `training/` ships in the app bundle; confirm `npm run build` still passes first, with the dev server stopped).
- [ ] **Step 3:** Append a dated entry to `C:\Users\J30N\dev-context\projects\sorro.md` `## Change log` naming the user's remaining steps: make a Hugging Face account and write token, run the notebook on a T4, and send back the three repo names and their `sorro_eval.json` scores. B3b starts from those.
