# Change brief — note editor redesign

Shared context file. Claude Code and Antigravity both read `AGENTS.md`, so this
is the one copy. Repo rules stay in `GEMINI.md`; long-lived architecture notes
stay in `HANDOFF.md`.

Covers commit `4375597` (2026-08-27), the last change on `master`.

## What changed

- **Title and body inputs lost every border, outline, ring and focus shadow.**
  A `.note-editor-clean-input` class in `app/globals.css` kills
  `outline`/`box-shadow`/`border` in all states, including `:focus-visible`,
  because the browser default focus ring came back on click otherwise.
- **Editorial type scale.** Title 29/23px (desktop/phone), body 15.5/14.5px at
  1.76 line height, wider page padding, `maxWidth` 740. The body was 13.5px,
  which read as a form field, not a document.
- **Write/Read is a segmented switch,** not a single toggle button. Two
  buttons in a `var(--card2)` track, the active one raised with `var(--sh)`.
  The old button showed the mode you were leaving, which people misread.
- **Chips flattened.** Tags and backlinks moved from pill outlines to square
  `color-mix` tinted blocks. Fewer competing outlines around the text.
- **Selected note in the list** is now a 3px left accent bar plus a tinted
  background instead of a full accent outline.
- **Hardcoded dark hex values replaced with theme tokens** in
  `MathEquationEditor` (`#0E1017`, `#EAEBED`) and the sketch image background.
  They were invisible in light theme.

## Why

The editor was styled like a form. Every element the writer looks at (title
field, body field, tag pills, math blocks, backlink chips) had its own outline,
so the note itself never became the focus. The redesign removes the chrome and
lets typography carry the hierarchy.

## What did not change

Save behaviour. `SAVE_DEBOUNCE_MS` is still 600, `SAVE_NOTE` in `lib/notes.ts`
still upserts with no `onError` rollback, and delete still routes through
`deleteWithUndo` into `deleted_at` trash. This was a presentation-only commit.
Read `HANDOFF.md` before touching any of that.
