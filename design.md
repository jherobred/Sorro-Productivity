---
name: Basedly
description: A motivating student workspace with bold discovery and calm work.
colors:
  dark-poster-blue: "#345cff"
  dark-poster-yellow: "#f5df4d"
  dark-poster-red: "#f26047"
  poster-blue: "#3165f5"
  poster-yellow: "#f4d65d"
  poster-red: "#f16d56"
  dark-bg: "#111315"
  dark-panel: "#17191c"
  dark-card: "#1c1f22"
  dark-card2: "#25292d"
  dark-text: "#f5f4ef"
  dark-text-secondary: "#c2c5c8"
  dark-text-muted: "#959bA1"
  dark-line: "#ffffff12"
  dark-line-strong: "#ffffff26"
  dark-editor-paper: "#191c1f"
  light-bg: "#f7f7f2"
  light-panel: "#efefea"
  light-card: "#fff"
  light-card2: "#eeefea"
  light-text: "#171a1d"
  light-text-secondary: "#52595e"
  light-text-muted: "#636b71"
  light-line: "#171a1d12"
  light-line-strong: "#171a1d24"
  cover-label: "#f8f6ef"
typography:
  display:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    fontSize: "clamp(40px,4.6vw,65px)"
    fontWeight: 650
    lineHeight: 1.02
    letterSpacing: "-.04em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    fontSize: "14px"
  title:
    fontSize: "21px"
    fontWeight: 650
    letterSpacing: "-.025em"
  label:
    fontSize: "13px"
    fontWeight: 550
  mono:
    fontFamily: 'ui-monospace, "SFMono-Regular", Consolas, monospace'
  wordmark:
    fontFamily: "Familjen Grotesk, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-.03em"
rounded:
  label: "3px"
  badge: "5px"
  control: "10px"
  navigation: "11px"
  cover: "12px"
  capture: "13px"
  priority: "15px"
  dialog: "22px"
spacing:
  compact: "8px"
  control: "12px"
  related: "16px"
  phone-gutter: "18px"
  panel: "24px"
  desktop-gutter: "38px"
components:
  button-primary:
    backgroundColor: "var(--poster-blue)"
    textColor: "#fff"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-secondary:
    backgroundColor: "var(--card)"
    textColor: "var(--tx)"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  input:
    backgroundColor: "var(--card)"
    textColor: "var(--tx)"
    rounded: "{rounded.control}"
    padding: "11px 13px"
  navigation:
    textColor: "var(--tx2)"
    rounded: "{rounded.navigation}"
    padding: "10px 13px"
  page-kind:
    backgroundColor: "var(--card2)"
    textColor: "var(--tx2)"
    rounded: "{rounded.badge}"
    padding: "6px 9px"
  priority-panel:
    backgroundColor: "var(--poster-blue)"
    textColor: "#fff"
    rounded: "{rounded.priority}"
    padding: "24px 27px"
---

# Design System: Basedly

## Overview

**Creative North Star: "Bold discovery, calm work"**

A motivating student workspace: confident printed color helps people find a next step, while neutral working surfaces let their own writing and drawings lead. Native platform typography gives the app familiar reading and interaction, with the original lowercase Familjen Grotesk wordmark preserving its identity.

The user pinned this direction in a code-led redesign. It replaces the earlier Sundae, plum, candy and mascot guidance. There is no approved raster composition. This document records the implemented studio system, primarily the final overrides in app/studio.css, Shell, Today, Notebooks and CoverCapture.

**Key Characteristics:**

- Neutral near-black and soft-white themes.
- Electric blue, yellow and red printed accents.
- Geometric notebook covers and optional real-object cutouts.
- Grouped rounded navigation, direct libraries and restrained editors.

## Colors

The palette combines neutral working surfaces with clear poster colors. The unprefixed poster tokens describe light theme (and an unset theme attribute). The dark-poster tokens describe explicit dark theme: the earlier theme-qualified CSS rule has greater specificity than the later plain-root declarations. Components must read the live CSS variables to preserve this actual theme difference.

### Primary

Electric blue identifies primary actions and the next calendar priority. White text on blue is fixed in either theme.

### Secondary

Poster yellow highlights the next or overdue task with dark ink. It also appears in printed imagery and selection feedback.

### Tertiary

Poster red provides a third printed accent. It is not a universal error token: existing validation and task status treatments retain their own semantic colors.

### Neutral

The paired dark and light tokens map to the existing bg, panel, card, card2, tx, tx2, tx3, line and line2 CSS variables. The editor uses its paper surface. Cover titles sit on an opaque soft-white label to stay readable over both geometry and photos.

**The Working Surface Rule.** Keep reading and editing grounds neutral; use poster color for discovery, priority and specific actions.

## Typography

Display and body use the native system stacks in the frontmatter. The mono stack serves code and time. The lowercase basedly wordmark alone keeps Familjen Grotesk, provided by the existing font variable.

Display headings are compact and tightly spaced. Library display becomes (48px) on phones. Today has its own greeting scale, from (32px) to (54px), and (35px) on phones. Section titles use the title role. Navigation uses the label role. Note titles currently use (28px) desktop and (22px) phone at weight (800); use the editor's current styles rather than historical title sizes.

**The Native Type Rule.** Preserve the original wordmark while all application reading and headings follow the platform font stack.

## Layout

The desktop shell has a grouped sidebar (236px), a compact option (72px), a topbar (62px), and a separately scrolling main area. Main padding is (32px 38px 56px). Today has a centered maximum width (1350px). Its two priority panels use a (1.65:1) split; the capture and habits workbench uses (1.2:1).

At (1100px) and below, the sidebar narrows to (204px), main gutters become (25px), and library covers use two columns. At (760px) and below, navigation moves to four chosen labeled destinations plus More at the bottom. Main gutters become (18px), safe-area space is retained, and Today panels stack. The library retains two cover columns. At large desktop widths (1600px), the library grows to four columns; otherwise its default is three.

Notebook pages open directly from the library. Add page presents a responsive type chooser, followed by quiet full-width rows with title, preview and type. Do not insert a tools dashboard between the library and its pages. Whiteboards and PDF annotation need a navigable canvas beyond the document edges.

## Elevation & Depth

Tonal layering and fine dividers do most of the work. Small shadows belong to floating surfaces and interactions; overlays have stronger separation. Notebook covers lift on hover (5px) with a short shadow. Cutout objects get a compact drop shadow to read as objects placed on a cover.

Motion communicates hover, press, arrival or progress. The studio honors both prefers-reduced-motion and the app motion setting for its animated cover and interface transitions. Preserve that behavior when extending these components. Exact shadow and motion snippets live in the sidecar.

## Shapes

Controls have modest rounded corners, navigation slightly softer corners, and notebook covers and priority panels larger corners. Covers combine flat geometric arcs, rings, bars and halftone texture. Their title label has a tighter corner than the cover. Avoid making every element a pill.

**The Printed Color Rule.** Use solid color and geometric texture for the identity. Do not add decorative gradient fills to the shell or navigation. The transparency checkerboard in the photo preview is functional, not an identity gradient.

## Components

### Buttons

Primary buttons use blue and white; secondary buttons use the current card and text tokens with a fine border. They have a minimum height (42px), compact padding and a press scale (.97). Hover brightens slightly. Keyboard focus is a visible blue outline (2px), offset (4px). Disabled controls remain identifiable and cannot act.

### Inputs / Fields

Search and ordinary form inputs use card backgrounds, fine strong dividers and rounded control corners. Quick capture groups its border around the writing area and actions, with a blue border on focus within. Document title and writing surfaces retain their clean, borderless treatment; do not copy form chrome into the note.

### Navigation

Desktop destinations are grouped under Plan, Think and Self. The active item uses a blue tint, subtle inset outline and short left accent bar, with readable text. Mobile retains labels and a More sheet. Search, settings, theme and account controls remain utilities.

### Chips

Page-type badges use the secondary card surface, muted text and compact rounded blocks. Capture-type toggles show their selected state with a tonal fill. Preserve visible state alongside concise labels.

### Cards / Containers

Priority panels are bold, spacious and immediately actionable. Other content uses neutral surfaces or divided rows. Notebook cover titles use opaque labels over generated geometry or an applied photo. The library cover and its rename/photo utilities are distinct actions.

### Photo covers

Camera or upload leads to photo review, optional on-device cutout, a preview with the real notebook or task title, then Apply. The desktop dialog is at most (600px) wide with (22px) corners. On phones it becomes a bottom sheet with safe-area padding. Keep the model download disclosure, progress, cancel, retry and full-photo path legible. A processed preview is not yet an applied cover. See docs/PHOTO-COVERS.md for the processing, storage and validation contract.

## Do's and Don'ts

### Do:

- Do preserve the lowercase Familjen wordmark and native application fonts.
- Do keep both themes readable, including fixed ink on printed panels.
- Do use bold covers and priorities alongside calm reading and editing.
- Do preserve labeled mobile navigation, visible keyboard focus and reduced motion.
- Do keep original content and distinct page types reachable in the notebook library.

### Don't:

- Don't restore the old plum, candy, otter or buddy design contract.
- Don't add decorative gradients to navigation or shell surfaces.
- Don't gate the direct library behind a tool gallery or onboarding.
- Don't require background removal to use a photo cover.
- Don't describe camera hardware, Xiaomi stylus or authenticated cross-device sync as verified without device or session evidence.
