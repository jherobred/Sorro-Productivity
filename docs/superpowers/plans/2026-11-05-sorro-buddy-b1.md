# Sorro AI Buddy B1 (Fox everywhere) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The fox is the assistant on every tab, talks in a playful, cheeky voice, and its replies stream in as they are written.

**Architecture:** The `assistant` Supabase function streams server-sent events when the client asks for them, and keeps its JSON reply for older clients. The Home chat moves into one `FoxChat` component used by both Home and a new `FoxSheet` that opens from the fox in the shell. A small module store keeps one current chat across tabs.

**Tech Stack:** Next.js static export, React, TanStack Query, Supabase Edge Functions (Deno), Gemini REST `streamGenerateContent?alt=sse`, `node --test` for `*.check.ts`.

**Spec:** `docs/superpowers/specs/2026-11-05-sorro-ai-buddy-design.md` (sections D1 and D3; B2 and B3 get their own plans).

## Global Constraints

- One cloud model: Gemini via `GEMINI_MODEL` or `gemini-3.6-flash`. No new provider or secret.
- Voice: playful and cheeky. The fox is "he". The prompt must still say: use the tools, never invent data, confirm changes in one short sentence.
- Replies must start fast: text events are forwarded the moment Gemini sends them.
- Backward compatible: a request without `Accept: text/event-stream` gets today's JSON reply unchanged. The APK and Windows app load the live site, but cached old pages may still call the function.
- Writes keep their Undo records exactly as today.
- Gemini returns `thoughtSignature` on parts in function-calling rounds. Echo every part of a model turn back exactly as received.
- Every new region gets a `data-part` code added to `lib/parts.ts`.
- Tests are `*.check.ts` files run by `npm test` (`node --test`).
- Commits: plain message, no co-author trailer (user's CLAUDE.md).
- Do not run `npm run build` while `npm run dev` is running.

## Review Focus

1. Stream drops after a write ran (network cut, tab closed): the write is saved server-side and the chat shows it after a refetch. Pinned in Task 3 (server saves on every exit path) and Task 4 (client treats a stream with no `done` as `model_failed` and invalidates queries).
2. An SSE event split across two network reads, or sent with `\r\n` line endings, is parsed once and whole. Pinned in Task 2.
3. Old cached clients that call without the Accept header still get JSON. Pinned in Task 3, step 4.
4. The sheet is closed mid-reply: the reply still lands in the shared chat and the fox shows `talk` until the sheet opens. Pinned in Task 6.
5. Tapping the fox on Home does not open a sheet over Home's own chat: it focuses the composer. Pinned in Task 6.

---

### Task 1: Fox voice and system prompt

**Files:**
- Create: `supabase/functions/assistant/voice.ts`
- Create: `supabase/functions/assistant/voice.check.ts`
- Modify: `supabase/functions/assistant/index.ts` (the `system` string near line 85)

**Interfaces:**
- Produces: `export const FOX_VOICE: string` and `export function systemPrompt(o: { name?: string | null; now: string; tz: string }): string`. B3's training data imports `FOX_VOICE`.

- [ ] **Step 1: Write the failing test** `voice.check.ts`

```ts
test('the prompt carries the voice, the user, the time and the rules', () => {
  const p = systemPrompt({ name: 'Jhems', now: 'Thursday, 5 November 2026 at 9:00 AM', tz: 'Asia/Manila' });
  assert.ok(p.includes(FOX_VOICE));
  assert.ok(p.includes("Jhems's"));
  assert.ok(p.includes('Asia/Manila'));
  assert.match(p, /never invent/i);
  assert.match(p, /one short sentence/i);
});
test('no name falls back to the user', () => assert.ok(systemPrompt({ now: 'x', tz: 'UTC' }).includes("the user's")));
test('the voice says he is a playful, cheeky fox', () => { assert.match(FOX_VOICE, /fox/i); assert.match(FOX_VOICE, /cheeky/i); });
```

- [ ] **Step 2: Run** `node --test supabase/functions/assistant/voice.check.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `voice.ts`.** `FOX_VOICE` describes Sorro as a fox (he/him), playful and cheeky: short replies, light teasing about overdue work, never mean, never about how the user compares to others, no emoji. `systemPrompt` keeps today's rules from `index.ts` (tools, never invent, prefer doing over asking, one question when a date or title is missing, confirm in one short sentence) and appends `FOX_VOICE`. Replace the inline `system` string in `index.ts` with `systemPrompt({ name: profile?.name, now, tz })`.

- [ ] **Step 4: Run** `npm test`. Expected: all pass.

- [ ] **Step 5: Commit** `git commit -m "Give the assistant the fox's voice"`

### Task 2: SSE parser and stream fold

**Files:**
- Create: `supabase/functions/assistant/sse.ts`
- Create: `supabase/functions/assistant/sse.check.ts`
- Modify: `lib/assistantLogic.ts`, `lib/assistantLogic.check.ts`
- Modify: `lib/assistant.ts` (move the `ToolDone` type out, re-export it)

**Interfaces:**
- Produces in `sse.ts` (no imports, so Deno and Next both load it): `export type SseEvent = { event: string; data: string }` and `export function splitSse(buf: string): { events: SseEvent[]; rest: string }`. Event name defaults to `message`. Multiple `data:` lines join with `\n`.
- Produces in `lib/assistantLogic.ts`: `export type ToolDone` (moved from `lib/assistant.ts`, which re-exports it), `export type StreamState = { text: string; done?: { chat_id: string; tools: ToolDone[] }; error?: { error: string; retry: string | null; chat_id?: string; tools: ToolDone[] } }`, and `export function foldStream(s: StreamState, ev: SseEvent): StreamState`. `text` events carry a JSON string chunk that is appended; `done` and `error` carry JSON objects. Unknown events leave the state unchanged.

- [ ] **Step 1: Write the failing tests**

```ts
// sse.check.ts
test('an event split across reads waits for its blank line', () => {
  const a = splitSse('event: text\ndata: "Hel');
  assert.deepEqual(a.events, []);
  const b = splitSse(a.rest + 'lo"\n\nevent: done\n');
  assert.deepEqual(b.events, [{ event: 'text', data: '"Hello"' }]);
  assert.equal(b.rest, 'event: done\n');
});
test('CRLF line endings parse the same', () => {
  assert.deepEqual(splitSse('data: {"a":1}\r\n\r\n').events, [{ event: 'message', data: '{"a":1}' }]);
});
// assistantLogic.check.ts
test('text chunks append, done ends the stream', () => {
  let s: StreamState = { text: '' };
  s = foldStream(s, { event: 'text', data: '"Added "' });
  s = foldStream(s, { event: 'text', data: '"it."' });
  s = foldStream(s, { event: 'done', data: '{"chat_id":"c1","tools":[]}' });
  assert.equal(s.text, 'Added it.');
  assert.deepEqual(s.done, { chat_id: 'c1', tools: [] });
});
test('an error event keeps the text and the tools that already ran', () => {
  const s = foldStream({ text: 'Part' }, { event: 'error', data: '{"error":"model_failed","retry":null,"chat_id":"c1","tools":[{"name":"create_task","label":"Added"}]}' });
  assert.equal(s.text, 'Part');
  assert.equal(s.error?.tools.length, 1);
});
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL on missing exports.
- [ ] **Step 3: Implement** `splitSse` (split on blank lines after normalising `\r\n` to `\n`; the text after the last blank line is `rest`) and `foldStream`.
- [ ] **Step 4: Run** `npm test`. Expected: all pass, `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `git commit -m "Parse the assistant's event stream"`

### Task 3: Streaming in the assistant function

**Files:**
- Modify: `supabase/functions/assistant/index.ts`

**Interfaces:**
- Consumes: `splitSse` (Task 2), `systemPrompt` (Task 1).
- Produces: with `Accept: text/event-stream`, the response is `200 text/event-stream` with events `text` (JSON string chunk), then exactly one of `done` `{ chat_id, tools }` or `error` `{ error, retry, chat_id, tools }`. Errors found before streaming starts (`signed_out` 401, `no_key` 503, `bad_request` 400, `save_failed` 500) stay JSON with their status codes, as today.

- [ ] **Step 1: Add `geminiStream(key, system, contents, onText: (t: string) => void): Promise<Part[]>`.** Calls `:streamGenerateContent?alt=sse`, reads the body with `splitSse`, calls `onText` for every text part, and returns all parts of the turn in order as received (thought signatures included). Same 429 and non-OK handling as `gemini`. Keep `gemini` for the JSON path.
- [ ] **Step 2: Move the round loop into `answer(emit?: (t: string) => void)`** shared by both paths. With `emit`, it uses `geminiStream`; without, `gemini`. Saved assistant `content` is all text emitted across rounds, joined, trimmed. On the JSON path it stays the last round's text, as today.
- [ ] **Step 3: Stream path.** Return a `ReadableStream` that runs `answer`, writes `event: text` per chunk, then saves the two messages and updates `sorro_chats.updated_at` before writing `done`. On a thrown error it saves exactly as the current catch block does, then writes `error`. If the client disconnects (enqueue throws), keep running to the save; never lose a write's message.
- [ ] **Step 4: Check both paths against the hosted function.** Deploy with `npx supabase functions deploy assistant --yes`. From the browser pane signed in on the dev server, run in the console:
  `await (await supabase.functions.invoke('assistant', { body: { message: 'what is due today?' } })).data` — expected: JSON `{ chat_id, text, tools }` as before.
  Then a `fetch` to `${SUPABASE_URL}/functions/v1/assistant` with `Accept: text/event-stream` and the session token — expected: several `event: text` blocks, then `event: done`.
- [ ] **Step 5: Commit** `git commit -m "Stream the assistant's replies"`

### Task 4: Streaming client and shared chat

**Files:**
- Modify: `lib/supabase.ts` (export `SUPABASE_URL`, `SUPABASE_KEY`)
- Modify: `lib/assistant.ts`

**Interfaces:**
- Consumes: `splitSse`, `foldStream`, `StreamState` (Task 2).
- Produces:
  - `sendToAssistant(chatId: string | null, message: string, context?: string, onText?: (full: string) => void): Promise<SendResult>`. Same `AssistantError` codes and messages as today. Uses `fetch` with the session's access token, `apikey`, and `Accept: text/event-stream`. `onText` gets the whole text so far after each chunk. A body that ends with no `done` or `error` throws `AssistantError('model_failed', …)`. Query invalidation for `tasks`, `events`, `notes`, `chats` runs on every exit, success or error.
  - `useCurrentChat(): [string | null, (id: string | null) => void]`, a module-level store (`useSyncExternalStore`) so Home and the sheet share one chat. Not persisted.

- [ ] **Step 1: Implement both.** The network and React parts have no unit test; the parsing they rely on is tested in Task 2.
- [ ] **Step 2: Run** `npx tsc --noEmit` and `npm test`. Expected: clean.
- [ ] **Step 3: Commit** `git commit -m "Read the assistant's stream in the app"`

### Task 5: FoxChat component, used by Home

**Files:**
- Create: `components/FoxChat.tsx`
- Modify: `app/(shell)/home/page.tsx`
- Modify: the stylesheet holding `.hm-*` rules (find with `grep -rl "hm-composer" app components`)
- Modify: `lib/parts.ts`

**Interfaces:**
- Consumes: `sendToAssistant`, `useCurrentChat` (Task 4).
- Produces: `export function FoxChat({ variant, context, initial }: { variant: 'page' | 'sheet'; context?: string; initial?: { text: string; context?: string } }): JSX.Element` with an exported `focusFoxComposer(): void` (focuses the composer textarea if mounted). `initial` is sent once on mount.

- [ ] **Step 1: Move** everything chat-related from `HomePage` (the bar, messages, ToolCard, Text, send, retry, undo, composer, past chats sheet, offline fallback, suggestions) into `FoxChat`, swapping `useState` chat id for `useCurrentChat()`. Home keeps the widgets and the `?ask` parsing, passing it as `initial`.
- [ ] **Step 2: Stream into the view.** While busy, the pending assistant bubble shows the streamed text through `onText`; the "Working on it" row shows only until the first chunk.
- [ ] **Step 3: Variant `sheet`** drops the suggestions block and uses a compact start line. Add `'F.chat': 'Fox chat'` to `lib/parts.ts`.
- [ ] **Step 4: Verify in the browser pane** (dev server, preview data or signed in): Home looks as before; a message streams in; Undo on a write receipt works; Past chats switches chats.
- [ ] **Step 5: Commit** `git commit -m "Move the chat into FoxChat"`

### Task 6: Fox sheet on every tab

**Files:**
- Create: `components/FoxSheet.tsx`
- Modify: `components/Shell.tsx`, `components/Wordmark.tsx`
- Modify: `lib/foxMood.ts`, `lib/foxMood.check.ts`
- Modify: `lib/assistantLogic.ts`, `lib/assistantLogic.check.ts`
- Modify: `lib/parts.ts`

**Interfaces:**
- Consumes: `FoxChat`, `focusFoxComposer` (Task 5).
- Produces:
  - `chatContext(tab: string, search: string): string` in `lib/assistantLogic.ts`. Reads `note`, `open`, `detail`, `plan`, `project` from the query string.
  - `foxMood` input gains `talking: boolean`; mood type gains `'talk'`. Order: `glad` > `talk` > `run` > `sleep` > `sit`. `foxTalk(on: boolean)` sets it. Wordmark maps `talk` to the `alert` pose.
  - `Wordmark` gains `onFox?: () => void`. When set, the fox renders as its own `<button aria-label="Talk to Sorro">`, and Shell places the wordmark text in the Home link beside it, so no button sits inside a link.

- [ ] **Step 1: Write the failing tests**

```ts
// assistantLogic.check.ts
test('context names the tab and the open item', () => {
  assert.equal(chatContext('Notes', '?note=n1'), 'The user is on the Notes tab with note n1 open.');
  assert.equal(chatContext('Tasks', ''), 'The user is on the Tasks tab.');
});
// foxMood.check.ts
test('talk shows over running and sleep, glad still wins', () => {
  assert.equal(foxMood({ ...base, talking: true, busy: 1 }), 'talk');
  assert.equal(foxMood({ ...base, talking: true, now: base.lastInputAt + 400_000 }), 'talk');
  assert.equal(foxMood({ ...base, talking: true, gladUntil: base.now + 500 }), 'glad');
});
```
Add `talking: false` to `base` in `foxMood.check.ts`.

- [ ] **Step 2: Run** `npm test`. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement** `chatContext`, the `talk` mood and `foxTalk`.
- [ ] **Step 4: Build `FoxSheet({ open, onClose })`** with the existing `sx-sheet-back` / `sx-sheet` classes (bottom sheet on phone; on desktop the same sheet styled as a right-side panel under `[data-phone=false]`), `role="dialog"`, `aria-modal`, Escape closes, `data-part="S.foxsheet"` (add to `lib/parts.ts` as `'Fox chat sheet'`). It renders `FoxChat variant="sheet"` with `context={chatContext(current.name, location.search)}`.
- [ ] **Step 5: Wire Shell.** Fox tap: on Home call `focusFoxComposer()`, elsewhere open the sheet. When a send finishes while the sheet is closed, call `foxTalk(true)`; opening the sheet calls `foxTalk(false)`. `FoxChat` gets this through an `onReply?: () => void` prop that Shell passes.
- [ ] **Step 6: Verify in the browser pane** at desktop and `mobile` sizes: the fox opens the sheet on Tasks and Notes; a note's id reaches the context (check the request body in `read_network_requests`); closing the sheet mid-reply leaves the fox in `talk` (check `data-mood` on `.sx-mark`); the same chat shows on Home afterwards; on Home the fox focuses the composer. Use synthetic events per the browser pane gotcha.
- [ ] **Step 7: Run** `npm test` and `npx tsc --noEmit`. Expected: clean.
- [ ] **Step 8: Commit** `git commit -m "Open the fox's chat from any tab"`

### Task 7: Ship

- [ ] **Step 1:** Stop the dev server, run `npm run build`. Expected: success.
- [ ] **Step 2:** Confirm the function from Task 3 is deployed (`npx supabase functions list`). Merge to master and push (the user's rule: ship every session; the APK and Windows app load the live site).
- [ ] **Step 3:** Check the live site at `https://sorro-jhemsini.vercel.app` once Vercel finishes: a Home message streams, and the fox sheet opens on Tasks.
- [ ] **Step 4:** Append a dated entry to `C:\Users\J30N\dev-context\projects\sorro.md` under `## Change log` (format `### YYYY-MM-DD HH:MM PHT - Claude Code`, What and Why lines), then `git -C C:\Users\J30N\dev-context pull --rebase`, `add -A`, commit, `push`.
