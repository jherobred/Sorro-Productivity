'use client';

import { AsciiBar } from '@/components/AsciiBar';
import { useDoubleTap } from '@/hooks/useTap';
import { peso } from '@/lib/money';
import { colourOf } from '@/components/money/Instruments';

/**
 * A budget you can recognise and log straight into.
 *
 * Three things are folded into one row here, and each saves a line of screen:
 * the photograph on the left says which jar this is faster than the word does;
 * the budget lives *inside* the track as spent-on-the-left and limit-on-the-
 * right, rather than on a caption line above it; and the row is a button.
 *
 * One tap arms — a white ring, and the pad now knows where the money is going.
 * Two taps go inside. Those can coexist without the usual 300ms delay on every
 * single tap because arming is harmless and reversible: it fires immediately,
 * and a second tap simply undoes it on the way to opening the jar. Paying the
 * delay would only be worth it if the single action were expensive to undo.
 */

/** Photographs that ship for the categories most people actually use. */
const STOCK: Record<string, string> = {
  food: '/jars/food.jpg', transport: '/jars/transport.jpg', school: '/jars/school.jpg',
  fun: '/jars/fun.jpg', bills: '/jars/bills.jpg', health: '/jars/health.jpg',
};

export const jarPhoto = (category: string, photo_path?: string | null): string | null =>
  photo_path || STOCK[category.trim().toLowerCase()] || null;

export type JarRow = {
  id: string;
  category: string;
  spent: number;
  budget: number;
  photo_path?: string | null;
};

/**
 * How the jar is doing, in two words after the money.
 *
 * "₱420 left" is only half an answer — left for how long? A jar with a fifth of
 * its month still to cover is in trouble at the same number another jar is
 * comfortable at, so the days remaining are the other half, and a jar spending
 * faster than the calendar just says so.
 */
function qualifier(jar: JarRow, daysLeft: number): string {
  const spentShare = jar.spent / Math.max(1, jar.budget);
  const monthGone = 1 - daysLeft / 30;
  if (spentShare > monthGone + 0.15) return ' · tight';
  return daysLeft > 0 ? ` · ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : '';
}

/** Days left in the calendar month, which is the period a budget covers. */
function daysLeftInMonth(now = new Date()): number {
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.max(0, end - now.getDate());
}

export function Jar({
  jar, armed, onArm, onOpen,
}: {
  jar: JarRow;
  armed: boolean;
  onArm: () => void;
  onOpen: () => void;
}) {
  const daysLeft = daysLeftInMonth();
  const tap = useDoubleTap(onArm, onOpen);
  const over = jar.spent > jar.budget;
  const left = jar.budget - jar.spent;
  const hue = over ? '#FF6B6B' : jar.spent / Math.max(1, jar.budget) > 0.85 ? '#FFC24B' : colourOf(jar.category);
  const photo = jarPhoto(jar.category, jar.photo_path);

  return (
    <button
      {...tap}
      aria-label={`${jar.category}. ${over ? `${peso(-left)} over` : `${peso(left)} left`}. Tap to log here, twice to open.`}
      aria-pressed={armed}
      style={{
        display: 'flex', alignItems: 'stretch', width: '100%', padding: 0, cursor: 'pointer',
        borderRadius: 12, overflow: 'hidden', font: 'inherit', color: 'inherit',
        background: 'var(--card)',
        border: `1px solid ${armed ? '#FFFFFF' : 'var(--line)'}`,
        boxShadow: armed ? '0 0 0 1.5px #FFFFFF, 0 0 18px rgba(255,255,255,.22)' : 'none',
        transition: 'box-shadow .18s ease, border-color .18s ease',
      }}
    >
      {/* A quarter of the row, as the spec asked. */}
      <span style={{ width: '25%', flex: 'none', position: 'relative', background: 'var(--card2)', overflow: 'hidden' }}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
            background: `color-mix(in srgb, ${hue} 22%, transparent)`,
            color: hue, fontSize: 20, fontWeight: 800,
          }}>{jar.category.slice(0, 1).toUpperCase()}</span>
        )}
        <span aria-hidden style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(90deg, rgba(22,21,31,.1), rgba(22,21,31,.85))',
        }} />
      </span>

      <span style={{ flex: 1, minWidth: 0, padding: '9px 10px 9px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {jar.category}
          </span>
          <span className="num" style={{
            fontSize: 10, fontWeight: 600, flex: 'none', color: over ? '#FF9B9B' : 'var(--tx3)',
          }}>
            {over ? `${peso(-left)} over` : `${peso(left)} left${qualifier(jar, daysLeft)}`}
          </span>
        </span>
        <AsciiBar
          shape="jar"
          value={(jar.spent / Math.max(1, jar.budget)) * 100}
          hue={hue}
          text={peso(jar.spent)}
          rightText={peso(jar.budget)}
          label={`${jar.category} budget`}
        />
      </span>
    </button>
  );
}
