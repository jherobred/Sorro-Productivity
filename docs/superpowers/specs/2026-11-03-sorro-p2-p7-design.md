# Sorro P2–P7: frame, Home chat, side panel, Notes, Calendar, Tasks, News

Date: 2026-11-03. Status: awaiting Jhems's review. Builds on S1 (shell) and S1b (rename).
Design rules applied: Hallmark (app-screen scope), tasteskill app-screens, antislop-ui,
antislop-layoutmobile. Where they conflict with Jhems's own words, his words win, and the
conflict is written down here (W1–W3).

## Waivers from the design skills

- **W1. Motion.** The skills say app motion is state only. Jhems asked for more motion, animation
  and visuals, so Sorro gets a fuller motion layer (P2.4). Every move still uses transform and
  opacity only.
- **W2. Reduced motion.** Hallmark wants a `prefers-reduced-motion` fallback. Jhems's PC reports
  reduced motion while he wants motion, so the switch stays the in-app Motion setting (`.nomo`),
  as in Basedly and LodiSave. Motion off removes all travel.
- **W3. The logo.** Tracked capitals are banned for labels. The SORRO wordmark is a logo, not a
  label: it keeps the Grok lockup's tracked capitals.

## Part codes added

Every new region gets a `data-part` code, listed in `lib/parts.ts`:
`S.panel` (right panel), `S.fox` (moving fox), `H.chat`, `H.widgets`, `H.threads`, `H.composer`,
`N.shelf`, `N.book`, `N.editor`, `N.types`, `C.grid`, `C.agenda`, `C.quick`, `T.list`, `T.board`,
`T.table`, `T.quick`, `W.today`, `W.segments`, `W.archive`, `W.setup` (W = News).

## P2. Frame, brand, phone, motion

**P2.1 Brand.** The lockup is the Grok one: the fox head, then `SORRO` in Space Grotesk 500 with
tracked capitals (self-hosted, used for the wordmark only; Geist stays for everything else).
It is recoloured by theme: graphite on paper, paper on graphite, through CSS masks.
- **The moving fox (`S.fox`).** Top left, beside the wordmark. It sits by default (sit pose). It
  runs (the run animation) while a sync or save is in flight, and on every tab change. It sleeps
  when you have been idle for 5 minutes, and is glad for a moment after a task is completed.
  `fox-run.gif` gets converted to a transparent animated WebP so it can be recoloured. With
  Motion off it stays on the sit pose.

**P2.2 The title strip.** Desktop (Windows app): the 40px strip holds the window buttons at the
right, LodiSave `.caption` style. It has the same colour as the page and no rule under it. The
whole strip drags the window, and double-click maximizes. The tab title and actions sit in the
row under it, as in the LodiSave Gallery's `--strip` plus header. I verify this in the built
Windows app, not in a browser.

**P2.3 Phone and tablet (three states, not two).**
- **Phone (under 600px).** A 48px top strip shows the fox and the wordmark (small), the tab's
  actions, search and the avatar. The bottom bar is solid, not glass and not floating. It holds
  Home, Notes, Calendar, Tasks and More, each with an icon and an 11px label. The active item gets
  ink and a soft pill behind its icon. More opens a sheet with Vault, News and Settings. The right
  panel opens as a pull-up sheet from a strip button. Content gets padding for the bar plus the
  safe area, so nothing hides under it. Every tap target is 44px or more.
- **Tablet (600–1024px, the Xiaomi Pad).** A 64px icon rail with labels in tooltips, plus the
  content. The right panel is an overlay sheet.
- **Desktop (over 1024px).** Sidebar, content, and the right panel.

**P2.4 Motion layer.** Spring tokens are LodiSave's Float, Drift and Snap.
- Tab changes use view transitions: content cross-fades and rises 12px.
- Lists stagger on first load: 40ms per row, the first 8 rows only.
- Panels fold with Drift.
- Buttons press to 0.96 with Snap.
- The fox runs, sleeps and is glad (P2.1).
- Opening a notebook swings its cover open, a 3D rotate on the Y axis (P5).
- Chat messages rise in, and a tool result card unfolds (P3).
- Widgets spring when you rearrange them (P4).
- A dropped calendar event settles with Float (P6).
- A completed task gets a check draw and a strike (P6).
- No endless loops, apart from the fox while work is genuinely in flight.

## P3. Home: the assistant

**Layout.** There is no right panel on Home.
- **`H.widgets`:** a strip of compact widgets at the top, the same set as P4.
- **`H.chat`:** the conversation, centred, with a 760px measure.
- **`H.composer`:** pinned at the bottom.
- **`H.threads`:** past chats in a drawer, opened from the strip.

**Composer.** A text box that grows with what you type, attach-from-Vault (after P5's Vault
lands), and send. Suggestions appear only on an empty chat and come from your real data, for
example "Plan tomorrow", "What's due this week", "Summarize my CS 191 notes".

**What it can do (tool calls).**
- Tasks: create a task, list tasks, complete a task.
- Calendar: create an event, list events, find free time.
- Notes: search notes, create a note, append to a note.
- News: read today's segments.

Every write shows as a result card with Undo, for example the created task, with its fields. Reads
are cited by linking the notes or tasks they came from.

**Model.** The strongest of the three free options is **Gemini**. Its newest Flash model on the
free tier has the best tool calling and long context of the three, and the key is already in
Supabase (the `gemini-bot` function). I check the exact model name at build time.
- It runs through a new Edge Function, `assistant`, so the key never reaches the browser.
- The function streams the reply back.
- History is stored in `sorro_chats` and `sorro_chat_messages`.

**Offline fallback.** A "Download offline assistant" button in Settings fetches a small model
(Qwen2.5 0.5B Instruct, about 350 MB) with `@huggingface/transformers`, which is already a
dependency. While offline it answers from cached notes and tasks, without tools. Writes are
queued through the offline queue.

**States.**
- Loading: a typing row with the running fox.
- Error: says which call failed, with Retry.
- Rate-limited: says when you can try again.
- Empty first run: three suggestions.

## P4. Right side panel (`S.panel`)

Shown on every tab except Home. It follows the LodiSave Gallery's `.peek`: 336px wide, folding to
a 60px rail with a Drift transition, and it remembers its state.

**Top: widgets you choose and order.** Drag to reorder, and "Edit widgets" toggles each one on or
off. The set, each using only real data:
- **Agenda:** today's next three events.
- **Due:** tasks due today and overdue, each with a tick box.
- **Focus:** a 25 or 50 minute timer, optionally tied to a task.
- **Month:** a mini month view with busy-day density, where clicking a day opens it in Calendar.
- **Pinned note:** the first lines of a pinned note.
- **News:** today's top headline per segment.
- **Weather:** from Open-Meteo, which needs no key, for a city you set.
- **Capture:** a one-line add for a task or note.

**Bottom: Ask Sorro.** A one-line chat box. Sending opens Home with the message and the current
context attached: "about this note", "about this week".

**Middle: context for the current tab.**
- Notes: backlinks and the outline of the open note.
- Calendar: the selected event's details.
- Tasks: the selected task's subtasks and notes.
- News: the segment sources.

## P5. Notes

**The shelf (`N.shelf`).** Notebooks look like real notebooks, drawn in CSS from their colour or
cover photo:
- a spine on the left with a darker band and stitching;
- a page-edge stack on the right and bottom;
- an elastic band down the right side;
- a ribbon bookmark;
- the title on a paper label;
- the page count and last-edit time underneath.

A density control with three steps (small, medium, large covers) replaces the fixed 3 per row.
The grid uses `repeat(auto-fill, minmax(var(--cover), 1fr))`. Opening a notebook swings its cover
open.

**Note types (`N.types`).** The Google Docs-style page with a ribbon is retired as the default.
Sorro's own types:
1. **Page.** Write in place: formatting appears as you type (markdown shortcuts), a `/` menu, no
   ribbon and no separate edit/read mode. It takes the Grok Sorro editor's idea, rebuilt on the
   existing Tiptap.
2. **Map.** Boxes and arrows you place freely, a concept map whose boxes can be links to other
   notes.
3. **Recall.** Every heading is a question with the content hidden. "Test me" walks through them,
   and the ones you miss come back on a spaced schedule. This replaces flashcards.
4. **Cornell.** Kept, restyled.
5. **Fieldbook.** Dated entries with photos, the existing journal restyled to read like a field
   notebook.
6. **Board.** The existing free canvas and whiteboard with ink, for the stylus on the tablet.
7. **Code.** The existing Java Lab, renamed and kept runnable.

Existing notes keep their type: old document pages open in Page through a converter. Nothing is
lost, and the conversion runs only when you edit.

**The editor (`N.editor`).**
- Undo and redo live in the strip, as in the Grok app.
- Formatting that doesn't fit drops to a bottom bar with headings, lists, quote, code, link, photo
  and divider.
- The status line shows Saved, the word count and the reading time.

## P6. Calendar and Tasks

**Calendar keeps** its views (Month, Week, Day, Agenda, Countdown), Google sync and edit, Canvas
deadlines, study plans, the free-gap labels, timers and Focus.
- **New look.**
  - Event tiles are flat, filled with the calendar's colour, the title in ink, square-ish at a
    6px radius.
  - The today column gets a one-step tint, and the now-line is in the accent.
  - Weekends are one tone darker.
  - The header shrinks to one 44px row.
- **New features.**
  - `C.quick`: natural-language add, for example "CS 150 every Mon 9–10:30 at Eng 214" becomes a
    repeating event, with a preview before it saves.
  - Drag a task from the right panel's Due widget onto the grid to time-block it.
  - A week load bar shows booked hours per day.
  - Next to each event, the travel or free time before the next one.
  - Event templates.
  - Keyboard: N for new, T for today, arrows to step, 1–5 to switch views.

**Tasks keeps** lists, priorities, stars, repeats, subtasks, photos, Canvas tasks and the weekly
planner.
- **New.** Projects become task groups, colour-coded, with their own progress line. Three views:
  - **List** (`T.list`);
  - **Board** (`T.board`): Backlog, Todo, Doing, Done, with the Basedly board's drag feel;
  - **Table** (`T.table`).

  Also:
  - `T.quick`: natural-language add ("Lab report fri 5pm !high #CS150"), using the existing
    `taskParse`.
  - A streak on repeating tasks.
  - Focus started from a task logs time against it.
  - Smart lists: Today, Upcoming, Someday, Overdue.
  - Undo on complete and delete.

## P7. News (new tab)

**Nav.** News is a 6th destination. On desktop it sits in the sidebar; on phone it's in More.

**Data.** A `sorro_news` table: id, user_id, kind, edition date, title, body (markdown),
items (jsonb: headline, one-line summary, link, source), created_at, read_at.

**Kinds.**
- `ai-digest`;
- `dev-stack` (releases and advisories for your stacks);
- `trending` (GitHub);
- `hackathons` (events, scholarships);
- `jobs` (internships);
- `research` (paper digest);
- `gaming` (Unreal and games);
- `ph-brief` (Metro Manila: suspensions, weather, transport);
- `weekly` (your repos plus Sorro's due tasks).

`weekly` is the one Sorro can also fill itself from its own data.

**The watched page.** Grok's scheduled task visits a URL with a GET request. A new Edge Function,
`news-drop`, receives:

```
https://jdkbnsjczanvmmpsovhm.supabase.co/functions/v1/news-drop?k=<your drop key>&kind=ai-digest&part=1&of=3&d=<url-encoded text>
```

- Long digests come in parts (`part` of `of`), about 1,500 characters each, joined by edition and
  kind.
- The function answers with a plain page that says "Saved part 1 of 3", so Grok can confirm.
- The drop key is random and per user, stored hashed. You create it and rotate it under
  News → Setup.

**Spike first.** It isn't confirmed that Grok's task browser will request a URL this long. Before
building the tab, I deploy `news-drop` alone and you run one Grok task against it. If Grok can't
do it, the fallback is the "Share link paste" route from Q9.

**Screen.**
- **`W.today`:** today's edition. Each segment (`W.segments`) is a section with its own heading;
  items are headline, summary and source link; unread items are marked.
- **`W.archive`:** past editions by date.
- **`W.setup`:** per kind, a ready-to-paste Grok task prompt with your drop URL filled in, a
  schedule suggestion, and "last received".

## Order and testing

Build order: P2, P3, P4, P5, P6, P7 (the spike runs during P2), then P8, the release.

Each part ends with:
- `npm test`, `tsc` and the build;
- browser checks at 1440, 1024 and 390 in light and dark;
- the Hallmark `sloplint --scope app` and the tasteskill `inspect.mjs --app` on the main screen of
  that part, fixing every FAIL;
- a review of the screenshots.

The Windows strip is checked in the built app. The phone layout is checked at 390 in the browser
pane, and on your phone through the APK at P8.

## Out of scope

The tracker app (S6), S2 auth (TOTP plus biometrics), S8 home-screen widgets, S9 notifications,
and Vault's file explorer (S5 Vault) beyond the widget data it already has.
