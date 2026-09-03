'use client';

import { PAL, type PalKey } from './pal';
import type { IconName } from '@/components/Icon';

/**
 * Event categories — the labelled version of the candy palette.
 *
 * A colour on the grid meant nothing until this: "the indigo one" is how people
 * actually talk about a block on a calendar, so the swatches became categories
 * with names. The ids are stored nowhere; the *colour* stays the source of
 * truth (bd_events.color is a hex), and `resolveCategory` reads a category back
 * off any stored hex. That keeps old rows rendering correctly with no
 * migration, and a custom colour from the picker still works — it just falls
 * back to "Custom" when it is too far from every candy hue.
 */
export type EventCategory = {
  id: string;
  label: string;
  color: string;
  icon: IconName;
};

export const EVENT_CATEGORIES: EventCategory[] = [
  { id: 'class',    label: 'Class',    color: PAL.indigo, icon: 'book'   },
  { id: 'study',    label: 'Study',    color: PAL.sky,    icon: 'target' },
  { id: 'work',     label: 'Work',     color: PAL.violet, icon: 'proj'   },
  { id: 'health',   label: 'Health',   color: PAL.mint,   icon: 'gym'    },
  { id: 'personal', label: 'Personal', color: PAL.amber,  icon: 'heart'  },
  { id: 'social',   label: 'Social',   color: PAL.pink,   icon: 'people' },
  { id: 'urgent',   label: 'Urgent',   color: PAL.coral,  icon: 'flag'   },
  { id: 'errand',   label: 'Errand',   color: PAL.lime,   icon: 'walk'   },
  { id: 'other',    label: 'Other',    color: PAL.cyan,   icon: 'spark'  },
];

/** What an event whose colour matches nothing reads as. */
export const CUSTOM_CATEGORY: EventCategory = { id: 'custom', label: 'Custom', color: '', icon: 'palette' };

export type PalColour = typeof PAL[PalKey];

/**
 * Nearest category for a stored hex, by weighted sRGB distance.
 *
 * `#FF4D4D` and `#EF4444` both read as Urgent even though neither is the
 * canonical `#FF6B6B` — that is the point. This replaces the substring-sniffing
 * "is it red?" checks that missed their own border colour and classified pink
 * as red.
 */
export function resolveCategory(color: string | null | undefined): EventCategory {
  const hex = /^#?([0-9a-f]{6})$/i.exec((color ?? '').trim());
  if (!hex) return CUSTOM_CATEGORY;
  const n = parseInt(hex[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  let best: EventCategory = CUSTOM_CATEGORY;
  let bestD = Number.POSITIVE_INFINITY;
  for (const c of EVENT_CATEGORIES) {
    const m = /^#([0-9a-f]{6})$/i.exec(c.color);
    if (!m) continue;
    const cn = parseInt(m[1], 16);
    const dr = r - ((cn >> 16) & 255), dg = g - ((cn >> 8) & 255), db = b - (cn & 255);
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (d < bestD) { bestD = d; best = c; }
  }
  // Within a candy hue of it — read as that category. Far from everything is a
  // genuine custom colour.
  return bestD <= 5_400 ? best : CUSTOM_CATEGORY;
}

/** True when the event should get the alarm treatment (pulse, coral border). */
export function isUrgentEvent(color: string | null | undefined): boolean {
  return resolveCategory(color).id === 'urgent';
}

/** The one-line label a grid chip shows: the short name when there is one. */
export function chipLabel(e: { title: string; short_name?: string | null }): string {
  const short = e.short_name?.trim();
  if (short) return short;
  const title = e.title?.trim();
  return title && title !== '(No title)' ? title : 'Untitled';
}
