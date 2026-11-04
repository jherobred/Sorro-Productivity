# Sorro AI Buddy

The fox becomes Sorro's assistant on every tab, speaks first when it has
something useful to say, and keeps working offline through three small trained
models. Approved in chat on 2026-11-05.

## Decisions from the brainstorm

- One cloud model: Gemini (`assistant` function, `GEMINI_MODEL`). No second
  provider for now.
- Three local models with fixed roles: L1 Router, L2 Actor, L3 Checker.
- Replies must start fast. Checks never block a reply.
- Voice: playful and cheeky. The fox is "he".
- Training on Colab or Kaggle (free T4). This PC (GTX 1650, 4 GB) is not used
  for training.
- Training data is synthetic only. The user's chats are not used, because the
  weights are hosted publicly on Hugging Face so the app can download them
  without a login.
- Proactive messages show in the app and as device notifications.

## Sub-projects and order

| Code | Name | Covers |
|---|---|---|
| B1 | Fox everywhere | D1 streaming, D3 |
| B2 | Proactive fox | D4 |
| B3 | Trained offline council | D2, D5, L3 checks in D1 |

Each ships to master on its own. B3 replaces the current offline fallback
(`lib/localModel.ts`, Qwen2.5-0.5B-Instruct untuned, no tools).

## D1 Online path

- `supabase/functions/assistant/index.ts` switches Gemini to
  `streamGenerateContent` and returns server-sent events: `text` chunks as they
  arrive, then one `done` event with `chat_id` and the tool receipts.
  `lib/assistant.ts` reads the stream with `fetch` (the Supabase client's
  `functions.invoke` does not stream).
- Tool rounds work as today: writes run on the server immediately and come back
  with an Undo record.
- After B3, each write receipt is passed to L3 on the device in the background.
  If L3 flags it, the receipt shows "Fox thinks this is off" with the reason and
  Undo highlighted. Nothing is undone automatically. If L3 is not downloaded,
  the check is skipped silently.
- The system prompt moves to one shared constant, `FOX_VOICE`, in
  `supabase/functions/assistant/voice.ts`. Training data imports the same text.

## D2 Offline path

Runs in the existing worker (`lib/localModel.worker.ts`), which loads up to
three pipelines lazily.

1. L1 classifies the message as `chat`, `read` or `write`.
2. `chat`: L1 answers with a short quip. Done.
3. `read` / `write`: L2 produces one JSON tool call at a time, using the same
   10 tool schemas as `tools.ts`. Calls run on the device:
   - reads answer from the TanStack Query cache (tasks, events, notes, news
     already loaded on this device);
   - writes go through the existing offline queue, so they replay when online,
     and keep Undo.
   Max 4 rounds, then L2 writes the reply.
4. Each write goes to L3 in the background, same flag as D1.

`validateArgs` from `tools.ts` is shared with the client so bad L2 arguments are
rejected before they reach the queue.

## D3 Fox everywhere

- Tapping the fox in the shell opens a chat sheet on any tab (bottom sheet on
  phone, side sheet on desktop). It uses the same chat as Home
  (`sorro_chats`), so a conversation continues across tabs.
- The current tab and any open item (task, event, note id) go in the request
  `context`, so "move this to Friday" works.
- Home keeps its full-page chat.
- `useFoxMood` gains a `talk` state for when the fox has an unread message.

## D4 Proactive fox

`lib/foxNudges.ts` decides when to speak from data already on the device:

| Trigger | When | Limit |
|---|---|---|
| Morning plan | First open of the day, or 08:00 | Once a day |
| Overdue nudge | Tasks past due | 3 a day, not 22:00 to 07:00 |
| Reaction | Task done, streak milestone, focus session ends | Once per event, 1 per 10 minutes |
| Evening wrap-up | 21:00, with Move to tomorrow on unfinished tasks | Once a day |

- Wording: Gemini writes the line when online (a short `nudge` mode in the
  `assistant` function, no tools). Offline, L2 writes it. If neither is
  ready, a template from `lib/foxNudges.ts` is used.
- Shown as a speech bubble next to the fox on any tab. Tap opens the D3 sheet
  with the message as the fox's first turn. Dismissed bubbles do not return.
- Notifications through `lib/deviceNotify.ts`:
  - APK: morning plan and evening wrap-up are scheduled as native local
    notifications for the next day each time the app opens, so they arrive with
    the app closed. Their text is generic ("3 due today") and the full plan is
    written when opened.
  - Web and Windows: browser notifications while the app is open.
  - Server push with the app closed on web and Windows stays in S9.
- Settings: one toggle for proactive messages, one for notifications, and the
  morning and evening times.

## D5 Training

Folder `training/` (not shipped with the app):

- `generate.py`: calls Gemini to produce examples from the tool schemas and
  `FOX_VOICE`. Targets: ~3,000 L1 examples (label plus quip), ~4,000 L2
  multi-turn tool-call traces, ~3,000 L3 pairs (request, proposed write,
  verdict, reason) with about 40% deliberately wrong writes (wrong date, wrong
  id, wrong list, missing time zone). Output is JSONL.
- `eval/`: ~200 hand-checked cases held out from training.
- `sorro_buddy.ipynb`: Colab notebook, Run All. LoRA fine-tunes each model,
  merges, exports q4 ONNX with Optimum, runs the eval, and uploads to public
  Hugging Face repos under the user's account.

| Model | Base | Size (q4) | Pass bar on eval |
|---|---|---|---|
| L1 Router | SmolLM2-135M-Instruct | ~100 MB | 95% correct route |
| L2 Actor | Qwen2.5-0.5B-Instruct | ~400 MB | 85% exact tool name and valid args |
| L3 Checker | SmolLM2-360M-Instruct | ~250 MB | Flags 80% of wrong writes, under 10% false flags |

A model that misses its bar is not published. The app pins model repo
revisions in code, so a new upload never reaches users without a commit.

Download: Settings keeps the existing download button, now fetching all three
in the background (~750 MB once). L1 first, since it is smallest and makes
small talk work soonest.

## Error handling

- Gemini 503 `no_key` or network failure mid-stream: the partial text stays,
  and the app retries once through the offline path if models are present.
- Worker load failure (low memory on phone): fall back to L1 only, then to
  templates, and say so in the chat.
- L2 invalid JSON or invalid args: one retry with the error in context, then
  the fox says it could not do it offline and queues nothing.

## Testing

- `tools.check.ts` style checks for the SSE parser, `lib/foxNudges.ts` rules
  (limits, quiet hours, `TZ=America/New_York`), and the offline tool runner
  against a fake cache.
- The eval set in D5 is the test for the models.
- Browser pane checks for the sheet and bubble use synthetic events (see the
  browser pane gotcha in `AGENTS.md`).

## Out of scope

Second cloud model, training on personal chats, server push with the app
closed on web and Windows (S9), voice input, and the tracker app (S6).
