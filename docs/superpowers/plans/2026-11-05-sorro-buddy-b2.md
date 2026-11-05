# Sorro AI Buddy B2 (Proactive fox) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The fox speaks first: a morning plan, overdue nudges, quick reactions, and an evening wrap-up. They show as a speech bubble on any tab and as device notifications.

**Architecture:** A pure rules file decides when the fox speaks and what the fallback text is. A Shell hook checks the rules every minute from cached tasks and events, asks the `assistant` function for a one-line wording (no tools, not saved to a chat), and shows a bubble next to the fox. Tapping the bubble opens the fox's chat with that line as context. Notifications reuse `lib/deviceNotify.ts`.

**Tech Stack:** Next.js static export, React, TanStack Query, Supabase Edge Function (Deno, Gemini), Capacitor Local Notifications, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-05-sorro-ai-buddy-design.md`, section D4. B1 is shipped (`components/FoxChat.tsx`, `components/FoxSheet.tsx`, `lib/foxMood.ts` `foxTalk`).

## Global Constraints

- Triggers and limits, verbatim from the spec:
  - Morning plan: first open of the day, or 08:00. Once a day.
  - Overdue nudge: tasks past due. 3 a day, not 22:00 to 07:00.
  - Reaction: task done, streak milestone, focus session ends. Once per event, 1 per 10 minutes.
  - Evening wrap-up: 21:00, with Move to tomorrow on unfinished tasks. Once a day.
- Wording: Gemini writes the line when online (`nudge` mode in the `assistant` function, no tools). Offline it falls back to a template. The L2 offline wording is B3's job.
- Dismissed bubbles do not return.
- Notifications: the APK schedules the morning and evening notifications as native local notifications for the next day each time the app opens, with generic text ("3 due today"). Web and Windows show browser notifications only while the app is open. No server push (S9).
- Settings: one toggle for proactive messages, one for notifications, and the morning and evening times.
- Voice: `FOX_VOICE` from `supabase/functions/assistant/voice.ts`. Playful and cheeky, never mean, no emoji.
- Test date logic also under `TZ=America/New_York` (AGENTS.md: the dev machine has no DST).
- Commits: plain message, no co-author trailer (user's CLAUDE.md overrides the harness attribution).
- Do not run `npm run build` while `npm run dev` is up.

## Review Focus

1. Two windows open (the PC app and a browser tab): both run the check, but each nudge shows once. Pinned in Task 1 (`claimNudge` re-reads storage and refuses a second claim).
2. The app stays open across midnight: the log rolls over, the morning plan fires once on the new day, and the overdue count resets. Pinned in Task 1.
3. Gemini has no key (the current state) or the device is offline: the template line shows within 6 seconds. Pinned in Task 2 (`nudgeLine` timeout test).
4. Proactive messages switched off: no bubbles, and the scheduled phone notifications are cancelled. Pinned in Task 5.
5. Nothing due and nothing overdue: the morning plan says the day is clear, no overdue nudge fires, and the evening wrap-up has no Move button. Pinned in Task 1.

---

### Task 1: Nudge rules

**Files:**
- Create: `lib/foxNudges.ts`, `lib/foxNudges.check.ts`

**Interfaces:**
- Produces:
  - `type NudgeKind = 'morning' | 'overdue' | 'reaction' | 'evening'`
  - `type Facts = { dueToday: string[]; overdue: string[]; events: { title: string; time: string }[]; doneToday: number; unfinishedToday: { id: string; title: string }[] }` (titles; `time` as `HH:MM`; ids only where Move needs them)
  - `type FoxTimes = { morning: string; evening: string }`, `HH:MM`, defaults `{ morning: '08:00', evening: '21:00' }` exported as `DEFAULT_FOX_TIMES`
  - `type NudgeLog = { day: string; morning: boolean; evening: boolean; overdue: number; lastOverdueAt: number; lastReactionAt: number; seen: string[] }`
  - `type Nudge = { key: string; kind: NudgeKind; text: string; moveIds?: string[] }`, where `text` is the template line and `key` is unique per occurrence (`morning:2026-11-05`, `overdue:2026-11-05:2`, `reaction:<event key>`)
  - `type FoxEvent = { kind: 'task_done'; id: string; title: string } | { kind: 'streak'; id: string; title: string; days: number } | { kind: 'focus_end'; minutes: number; title: string | null; at: number }`
  - `freshLog(log: NudgeLog | null, day: string): NudgeLog`: a new empty log when `day` differs
  - `nextNudge(now: Date, f: Facts, log: NudgeLog, times: FoxTimes): Nudge | null`
  - `reactionNudge(e: FoxEvent, log: NudgeLog, now: number): Nudge | null`
  - `claimNudge(store: Pick<Storage, 'getItem' | 'setItem'>, n: Nudge, now: Date): boolean`: re-reads the log from `store` key `sorro-fox-nudges`, returns false if `n.key` is already in `seen` or the limits now refuse it, else records it and returns true
  - `STREAK_MILESTONES = [3, 7, 14, 30, 50, 100]`

Rules, checked in this order, one nudge at a time:
1. Evening if `!log.evening` and the time is past `times.evening`. `moveIds` lists the unfinished tasks due today, left out when empty.
2. Morning if `!log.morning` and the time is before `times.evening`. "First open of the day, or 08:00" collapses to this: the first check of the day fires it. The 08:00 time is used for the phone notification in Task 5.
3. Overdue if `f.overdue.length > 0`, `log.overdue < 3`, the hour is not in 22:00 to 07:00, and at least 3 hours have passed since `lastOverdueAt`.

Templates: short, cheeky, built from the facts. The morning template with nothing due and no events says the day is clear. Each template names at most 3 titles, then "and N more".

- [ ] **Step 1: Write the failing tests** in `lib/foxNudges.check.ts`

```ts
const at = (h: number, m = 0) => new Date(2026, 10, 5, h, m);
const none: Facts = { dueToday: [], overdue: [], events: [], doneToday: 0, unfinishedToday: [] };
const log0 = freshLog(null, '2026-11-05');

test('the first check of the day is the morning plan, once', () => {
  const n = nextNudge(at(9), none, log0, DEFAULT_FOX_TIMES);
  assert.equal(n?.kind, 'morning');
  assert.match(n!.text, /clear/i);
  assert.equal(nextNudge(at(9), none, { ...log0, morning: true }, DEFAULT_FOX_TIMES), null);
});
test('no morning plan after the evening time; the wrap-up comes instead', () => {
  const n = nextNudge(at(21, 5), { ...none, unfinishedToday: [{ id: 't1', title: 'Essay' }] }, log0, DEFAULT_FOX_TIMES);
  assert.equal(n?.kind, 'evening');
  assert.deepEqual(n?.moveIds, ['t1']);
});
test('an evening with nothing unfinished has no move', () => {
  assert.equal(nextNudge(at(21, 5), none, log0, DEFAULT_FOX_TIMES)?.moveIds, undefined);
});
test('overdue: at most 3 a day, 3 hours apart, never 22:00 to 07:00', () => {
  const f = { ...none, overdue: ['Lab report'] };
  const day = { ...log0, morning: true };
  assert.equal(nextNudge(at(10), f, day, DEFAULT_FOX_TIMES)?.kind, 'overdue');
  assert.equal(nextNudge(at(10), f, { ...day, overdue: 3 }, DEFAULT_FOX_TIMES), null);
  assert.equal(nextNudge(at(12), f, { ...day, overdue: 1, lastOverdueAt: at(10).getTime() }, DEFAULT_FOX_TIMES), null);
  assert.equal(nextNudge(at(6, 30), f, day, DEFAULT_FOX_TIMES), null);
  assert.equal(nextNudge(at(22, 30), f, { ...day, evening: true }, DEFAULT_FOX_TIMES), null);
});
test('nothing overdue means no overdue nudge', () => {
  assert.equal(nextNudge(at(10), none, { ...log0, morning: true }, DEFAULT_FOX_TIMES), null);
});
test('a new day starts a fresh log', () => {
  const old = { ...log0, morning: true, overdue: 3 };
  assert.equal(freshLog(old, '2026-11-05'), old);
  assert.deepEqual(freshLog(old, '2026-11-06'), freshLog(null, '2026-11-06'));
});
test('reactions: once per event, one per 10 minutes', () => {
  const e: FoxEvent = { kind: 'task_done', id: 't1', title: 'Essay' };
  const n = reactionNudge(e, log0, 1_000_000);
  assert.equal(n?.kind, 'reaction');
  assert.equal(reactionNudge(e, { ...log0, seen: [n!.key] }, 2_000_000), null);
  assert.equal(reactionNudge({ ...e, id: 't2' }, { ...log0, lastReactionAt: 1_000_000 }, 1_000_000 + 599_999), null);
});
test('a claim is refused the second time, as from another window', () => {
  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  const n = nextNudge(at(9), none, log0, DEFAULT_FOX_TIMES)!;
  assert.equal(claimNudge(store, n, at(9)), true);
  assert.equal(claimNudge(store, n, at(9)), false);
});
test('templates name three titles, then the rest as a count', () => {
  const n = nextNudge(at(9), { ...none, dueToday: ['A', 'B', 'C', 'D', 'E'] }, log0, DEFAULT_FOX_TIMES)!;
  assert.match(n.text, /A.*B.*C/);
  assert.match(n.text, /2 more/);
  assert.doesNotMatch(n.text, /\bD\b/);
});
```

- [ ] **Step 2: Run** `node --test lib/foxNudges.check.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `lib/foxNudges.ts`.** No imports from React or the browser, so it runs under `node --test`. `day` keys are local `YYYY-MM-DD` (reuse `ymd` from `lib/days.ts` if it has no browser imports; else format locally). `claimNudge` updates `morning`, `evening`, `overdue` + `lastOverdueAt`, or `lastReactionAt` by kind, and appends the key to `seen` (keep the last 50).
- [ ] **Step 4: Run** `npm test` and `TZ=America/New_York node --test lib/foxNudges.check.ts`. Expected: all pass in both.
- [ ] **Step 5: Commit** `git commit -m "Add the fox's nudge rules"`

### Task 2: Nudge wording from Gemini

**Files:**
- Modify: `supabase/functions/assistant/voice.ts`, `voice.check.ts`
- Modify: `supabase/functions/assistant/index.ts`
- Modify: `lib/assistant.ts`
- Create: `lib/nudgeLine.check.ts` only if `nudgeLine` is moved to a file without browser imports (see step 3)

**Interfaces:**
- Consumes: `Nudge`, `NudgeKind` (Task 1).
- Produces:
  - `nudgePrompt(kind: NudgeKind, facts: string): string` in `voice.ts`. Keep `NudgeKind` as a string union in `voice.ts`, not imported from `lib/`, since the function cannot import app files.
  - Function body `{ mode: 'nudge', kind, facts }` → `200 { text }`. No tools, nothing saved, `maxOutputTokens: 120`, JSON only. `facts` is the template line plus the titles, under 2000 characters (400 if longer).
  - `nudgeLine(n: Nudge, fetchLine: (n: Nudge) => Promise<string>, ms = 6000): Promise<string>`: the Gemini line, or `n.text` if it fails, is empty, or takes longer than `ms`. `fetchLine` is injected so the rule can be tested without the network. The real `fetchLine` lives in `lib/assistant.ts` as `fetchNudgeLine`, using `supabase.functions.invoke('assistant', { body: { mode: 'nudge', kind, facts } })`.

- [ ] **Step 1: Write the failing tests**

```ts
// voice.check.ts
test('the nudge prompt carries the voice, the kind and the facts, and asks for one line', () => {
  const p = nudgePrompt('morning', 'Due today: Essay');
  assert.ok(p.includes(FOX_VOICE));
  assert.match(p, /morning/);
  assert.ok(p.includes('Due today: Essay'));
  assert.match(p, /one (short )?line|one sentence/i);
});
// nudgeLine tests (in whichever check file holds it)
const n = { key: 'k', kind: 'morning', text: 'Template' } as const;
test('the Gemini line wins when it comes in time', async () => assert.equal(await nudgeLine(n, async () => 'Fresh'), 'Fresh'));
test('a failure falls back to the template', async () => assert.equal(await nudgeLine(n, async () => { throw new Error('no_key'); }), 'Template'));
test('a slow answer falls back to the template', async () => assert.equal(await nudgeLine(n, () => new Promise(r => setTimeout(() => r('Late'), 50)), 10), 'Template'));
test('an empty answer falls back to the template', async () => assert.equal(await nudgeLine(n, async () => '  '), 'Template'));
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL on the missing exports.
- [ ] **Step 3: Implement.** `nudgeLine` goes in `lib/foxNudges.ts` (pure, testable). In `index.ts`, branch on `body.mode === 'nudge'` right after the `no_key` check, before the chat logic. Validate `kind` against the four values (400 otherwise). It calls `gemini` without `tools`, so the existing helper takes an optional `withTools = true` parameter.
- [ ] **Step 4: Run** `npm test`. Expected: all pass. Deploy with `npx supabase functions deploy assistant --project-ref jdkbnsjczanvmmpsovhm --yes`.
- [ ] **Step 5: Commit** `git commit -m "Let Gemini word the fox's nudges"`

### Task 3: Reaction events

**Files:**
- Modify: `lib/foxNudges.ts` (an event emitter, browser-safe), `lib/tasks.ts` (`complete.onMutate`, around line 583), `components/widgets/Widgets.tsx` (`Focus`, around line 72)

**Interfaces:**
- Consumes: `FoxEvent`, `STREAK_MILESTONES` (Task 1), `streak` from `lib/taskStreak.ts`.
- Produces: `foxReact(e: FoxEvent): void` (dispatches `window` event `sorro-fox-react` with `detail: e`; no-op when `window` is undefined) and `onFoxReact(f: (e: FoxEvent) => void): () => void`.

- [ ] **Step 1: Wire `task_done`.** In `complete.onMutate`, when `v.done`, emit `task_done` with the task's id and title from `previous`.
- [ ] **Step 2: Wire `streak`.** In the same place, if the task repeats, compute `streak()` over the cached tasks with the same trimmed lowercase title (as `components/tasks/TaskItem.tsx:102` does), counting this completion. If the result is in `STREAK_MILESTONES`, emit `streak` instead of `task_done`.
- [ ] **Step 3: Wire `focus_end`.** In `Focus`, where `takeFinished()` returns a session, emit `focus_end` with the minutes, the task title or null, and `Date.now()` as `at` (the event key uses `at`, so two sessions are two events).
- [ ] **Step 4: Run** `npx tsc --noEmit` and `npm test`. Expected: clean. These are one-line calls into code with no unit tests of its own. Task 4's browser check exercises them.
- [ ] **Step 5: Commit** `git commit -m "Tell the fox when you finish things"`

### Task 4: Bubble on every tab

**Files:**
- Create: `lib/useFoxNudges.ts`, `components/FoxBubble.tsx`
- Modify: `components/Wordmark.tsx`, `components/Shell.tsx`, `components/shell.css`, `components/FoxChat.tsx`, `lib/assistant.ts`, `lib/prefs.ts`, `lib/parts.ts`

**Interfaces:**
- Consumes: Task 1 rules, `nudgeLine` + `fetchNudgeLine` (Task 2), `onFoxReact` (Task 3), `foxTalk` (B1).
- Produces:
  - `Prefs.fox?: { proactive?: boolean; notify?: boolean; morning?: string; evening?: string }`. Missing means proactive on, notify off, times from `DEFAULT_FOX_TIMES`.
  - `useFoxNudges(): { nudge: (Nudge & { line: string }) | null; dismiss(): void }` in `lib/useFoxNudges.ts`. It builds `Facts` from `useTasks()` and today's `useEvents`, runs `nextNudge` on mount, every 60 s and on `visibilitychange` to visible, and runs `reactionNudge` on `onFoxReact`. It calls `claimNudge(localStorage, …)` before showing, fetches the line with `nudgeLine`, and calls `foxTalk(true)` while a bubble shows. A newer nudge replaces an unread one. Does nothing when `prefs.fox?.proactive === false`.
  - `setFoxOpener(text: string | null)` and `useFoxOpener(): string | null` in `lib/assistant.ts` (same module-store pattern as `useCurrentChat`).
  - `FoxBubble({ nudge, onOpen, onDismiss, onMove }: { nudge: Nudge & { line: string }; onOpen(): void; onDismiss(): void; onMove?(): void })`: `role="status"`, the line, a Close button, and "Move N to tomorrow" when `moveIds` is set. `data-part="S.foxbubble"` (`'Fox speech bubble'` in `lib/parts.ts`).
  - `Wordmark` gains `bubble?: React.ReactNode`, rendered after the fox inside `.sx-mark`, which becomes `position: relative`.

- [ ] **Step 1: Implement the opener.** With an opener set, `FoxChat` starts a new chat (`setChatId(null)`), shows the opener as a local assistant message, and passes `Sorro just said: "<opener>"` into the context of the next send, then clears the opener.
- [ ] **Step 2: Implement `useFoxNudges` and `FoxBubble`.** Bubble tap: `setFoxOpener(nudge.line)`, then the same path as tapping the fox (Home focuses the composer, other tabs open the sheet), then dismiss. Move: `update.mutate` each id with `due_on` set to tomorrow, `toast('Moved N to tomorrow')`, then dismiss. Close: dismiss. Dismissing calls `foxTalk(false)`. The bubble sits under the fox (desktop sidebar and phone top strip), at most 280px wide, inside the viewport at 375px.
- [ ] **Step 3: Verify in the browser pane** with preview data (`NEXT_PUBLIC_DEV_FIXTURES=1` is in `.env.local`): clear `sorro-fox-nudges` in localStorage and reload. Expected: a morning bubble within a few seconds (the template, since there is no Gemini key), the fox in `talk` (`data-mood` on `.sx-mark`). Tap it: the sheet opens on Tasks with the line as the first message. Reload: no bubble. Tick a task: a reaction bubble. Set `fox.evening` to a past time with tasks due today: the evening bubble with Move, and Move changes their due day. At 375px the bubble stays on screen with no sideways scroll.
- [ ] **Step 4: Run** `npx tsc --noEmit` and `npm test`. Expected: clean.
- [ ] **Step 5: Commit** `git commit -m "Let the fox speak first"`

### Task 5: Notifications and settings

**Files:**
- Modify: `lib/useFoxNudges.ts`, `components/SettingsModal.tsx` (General section, next to `<OfflineAssistant />`, around line 466)

**Interfaces:**
- Consumes: `replaceScheduled`, `showAlerts`, `askAlertPermission` from `lib/deviceNotify.ts`; `notificationId` from `lib/canvasFeed.ts`; `Prefs.fox` (Task 4).
- Produces: `foxSchedule(now: Date, f: { dueTomorrow: number }, times: FoxTimes): DeviceAlert[]` in `lib/foxNudges.ts`. It returns the next morning alert (tomorrow at `times.morning`, body `"<n> due today"` or `"Nothing due. Rare."`) and the evening alert (today at `times.evening` if that is still ahead, else tomorrow, body `"Time to wrap up the day."`). Ids are `notificationId('fox:morning')` and `notificationId('fox:evening')`.

- [ ] **Step 1: Write the failing test** in `lib/foxNudges.check.ts`

```ts
test('the phone gets tomorrow morning and the next evening', () => {
  const a = foxSchedule(new Date(2026, 10, 5, 22, 0), { dueTomorrow: 3 }, DEFAULT_FOX_TIMES);
  assert.equal(a.length, 2);
  assert.deepEqual(a.map(x => x.at!.getDate()), [6, 6]);
  assert.equal(a[0].at!.getHours(), 8);
  assert.match(a[0].body, /3 due today/);
  const b = foxSchedule(new Date(2026, 10, 5, 9, 0), { dueTomorrow: 0 }, DEFAULT_FOX_TIMES);
  assert.equal(b[1].at!.getDate(), 5);
  assert.equal(b[1].at!.getHours(), 21);
});
```

`notificationId` must be importable under node; if `lib/canvasFeed.ts` pulls in browser code, copy its 6-line FNV hash into `foxNudges.ts` instead and ledger the ruling.

- [ ] **Step 2: Run** `npm test`. Expected: FAIL. Then implement `foxSchedule`. Run it again, and under `TZ=America/New_York`. Expected: pass.
- [ ] **Step 3: Wire it.** In `useFoxNudges`, on mount and whenever `prefs.fox` changes: if proactive is on and `notify` is on, `replaceScheduled([both ids], foxSchedule(...))`. Otherwise `replaceScheduled([both ids], [])`. This is a no-op off the phone app. When a bubble appears while `document.visibilityState === 'hidden'` and `notify` is on, `showAlerts([{ id: notificationId(key), title: 'Sorro', body: line }])`.
- [ ] **Step 4: Settings rows.** `ToggleRow` "Fox speaks first" (proactive), `ToggleRow` "Fox notifications" (asks permission with `askAlertPermission` when switched on, and stays off if refused), and two `<input type="time">` fields for the morning and evening times, shown only when proactive is on.
- [ ] **Step 5: Verify in the browser pane:** proactive off, then clear `sorro-fox-nudges` and reload. Expected: no bubble. Proactive on: a bubble.
- [ ] **Step 6: Run** `npx tsc --noEmit` and `npm test`. Expected: clean.
- [ ] **Step 7: Commit** `git commit -m "Fox notifications and settings"`

### Task 6: Ship

- [ ] **Step 1:** Whole-branch review (fresh reviewer), fix Critical and Important findings with a failing test first.
- [ ] **Step 2:** Stop the dev server, `npm run build`. Expected: success.
- [ ] **Step 3:** Commit only this plan's files (leave Grok's uncommitted `app/layout.tsx` change alone), push the branch, fast-forward master, push. Confirm the Vercel status on the commit is success (`gh api repos/jherobred/sorro/commits/<sha>/statuses`).
- [ ] **Step 4:** Append a dated entry to `C:\Users\J30N\dev-context\projects\sorro.md` `## Change log`, then pull --rebase, add, commit, push dev-context.
