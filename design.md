# Basedly design.md — the Sundae system

Source of truth for the 2026 friendly-pastel rebrand. Read this before touching
any component's visuals. Repo rules in `GEMINI.md`; save-behaviour landmines in
`HANDOFF.md`; the previous (obsidian) look survives only in git history.

## Concept

**A desk covered in candy-coloured paper.** Basedly is a friendly productivity
world with otter mascots; the UI should feel like a well-made stationery shop:
cream paper, plum ink, candy spot-colours, clay-soft shadows, rounded corners
you want to poke. Everything is image-led before it is word-led: covers,
swatches and colour carry the hierarchy; labels stay short.

Two themes, one personality:

- **Paper (light, default surface for content)** — warm cream ground, off-white
  cards, plum ink, tinted plum shadows. Never clinical white-on-white.
- **Plum (dark)** — a warm plum night, not obsidian. Cards are lifted plum,
  lines are lavender alpha, shadows go soft black. Same candy accents.

## Tokens

Names never change (hundreds of components read `var(--card)` etc.); values
did. Defined in `app/globals.css` theme blocks.

| Token | Paper (light) | Plum (dark) | Role |
| --- | --- | --- | --- |
| `--bg` | `#F3F0EA` | `#141120` | App ground (warm cream / warm plum) |
| `--panel` | `#ECE8E0` | `#191527` | Rails, wells behind cards |
| `--card` | `#FDFCF9` | `#201B31` | Any raised surface |
| `--card2` | `#F5F1E9` | `#2A2440` | Inset surface, chips, tracks |
| `--line` / `--line2` | plum alpha `.10` / `.20` | lavender alpha `.13` / `.26` | Hairlines |
| `--tx` / `--tx2` / `--tx3` | `#241F33` / `#5D5875` / `#8B86A3` | `#F2EFFA` / `#B3ACD4` / `#7E7899` | Ink scale |
| `--sh` | `0 10px 30px rgba(84,58,138,.10), 0 2px 8px rgba(84,58,138,.07)` | `0 10px 30px rgba(0,0,0,.45), 0 2px 8px rgba(0,0,0,.3)` | Clay-soft card shadow, tinted plum in light |
| `--shl` | larger, same hue | same idea | Hover/overlay lift |
| `--acc` | user-settable, default `#8B7CFF` grape | same | One accent, user-owned |
| `--pal-*` | coral/indigo/cyan/mint/violet/amber/deep/pink/sky/lime (unchanged) | same | Candy spot colours |

Rules: one accent per surface (`--acc`); spot pastels are category colours, not
decor; no pure black or white anywhere; shadows always tinted, never grey-black
on cream.

## Shape

One scale, documented and reused. Buttons and pills are full-round; cards and
sheets take the big radii; chips and inputs the middle sizes.

- `--r-xs: 10` · `--r-sm: 14` · `--r-md: 18` · `--r-lg: 24` · `--r-xl: 32`
- Cards / covers / shelves: `--r-lg` (24). Sheets and modals: `--r-xl`.
- Buttons: pill (`999`). Chips, tags, inputs: `--r-sm`. Icon buttons: `--r-sm`.
- Shape lock: no square corners inside a card, no mixed square pills.

## Type

Unchanged families (self-hosted via next/font, offline-safe for the APK):
Familjen Grotesk headings, IBM Plex Sans body, IBM Plex Mono labels/numbers.
Weight and colour carry hierarchy; sizes stay from the existing scale.

## Covers — image-led notebooks

Every notebook, canvas and graph gets generated cover art
(`components/notes/NotebookCover.tsx`):

- Deterministic from the notebook `id`: hash picks 2–3 spot colours, blob
  positions and rotation. Same notebook, same art, every theme.
- Built from CSS radial gradients over a `color-mix` of the notebook colour —
  no network, no image payloads, works in the Capacitor APK offline.
- The notebook's own colour stays visible as the base tint, so recolouring a
  notebook visibly changes its cover.
- Text lives on a progressive-blur veil, never directly on the art.

### Progressive blur (`components/core/ProgBlur.tsx`)

Stacked backdrop-filter layers, blur increasing toward one edge, masked so they
blend — the iOS-style frosted edge. Used on cover veils and the shelf hero.

- Props: `edge` (bottom/top/left/right), `size`, `strength`, `tint`.
- Degrades to a tinted gradient scrim where `backdrop-filter` is unsupported.
- Purely visual: `pointer-events: none`, honours `--anim: paused` (no cost when
  motion is off since it has no animation).

## Motion (cinematic)

Vocabulary lives in `app/kinetics.css` (spring/expo/over/swift curves, squish,
stagger, ripple, glass) — extend it, never scatter one-off transitions inline.
Product-motion off switch: `.nomo` flattens every effect; new classes must be
added to the `.nomo` blocks.

Layers, cheapest first:

1. **Press feedback on everything tappable** — `.k-squish` (cards, rows) or
   `.k-chip` (chips, swatches). Non-negotiable baseline.
2. **Arrival** — `.k-stagger` with `--i` indexes on grids and lists; sections
   cascade in on tab switch. `.k-bloom` for popovers/palettes.
3. **Shared-element transitions** — `motion/react` (`motion` v13, installed):
   `layoutId` pills for active tabs and segmented controls, `AnimatePresence`
   for sheets. One `useId()` namespace per rail instance.
4. **Delight** — springy hover lifts (`whileHover`), animated counters in the
   shelf hero, `k-glass` specular sweeps on primary CTAs.

Rules: animate only `transform`/`opacity`; springs, never linear; every effect
survives `.nomo` and `prefers-reduced-motion`; motion communicates (feedback,
arrival, state), it never decorates. No perpetual loops on informational
surfaces.

## Component contracts

- **Buttons**: pill, `min-height 36` desktop / `44` phone (touch target);
  primary = `--acc` fill with `--ink` text; secondary = `--card` with hairline.
- **Cards**: `--r-lg`, `--card` fill, `--line2` hairline, `--sh`; hover raises
  shadow to `--shl` and lifts `-2px`; press squishes.
- **Covers (notebook/canvas/graph cards)**: art fills the top, name + one
  metadata line on the blur veil. Words on a card: name, count, when — nothing
  else. No bullet preview lists on covers.
- **Empty states**: otter mascot (`public/mascots`) + one sentence + one action.
- **Both layouts in every pass**: design phone and desktop together; the audit
  in `research/ux-audit.md` is the regression list (F14/F15 live in notebooks).

## Bans (AI-tell list, enforced)

No em-dashes in any UI string; no AI-purple glow; no pure `#000`/`#FFF`; no
three-equal feature cards; no div fake screenshots; no decorative status dots;
no version footers; no scroll cues; icons stay on the in-house `Icon` mask
system (2px round-cap, do not swap libraries).
