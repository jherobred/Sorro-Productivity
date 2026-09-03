'use client';

import { motion } from 'motion/react';
import { AsciiBar } from '@/components/AsciiBar';
import { Icon } from '@/components/Icon';
import { useDoubleTap } from '@/hooks/useTap';
import { peso } from '@/lib/money';
import { usePrefs } from '@/lib/prefs';
import { K } from '@/lib/pal';
import { colourOf } from '@/components/money/Instruments';

/**
 * A budget you can recognise and log straight into.
 *
 * It was a full-width row with the photograph squeezed into a 25% strip on the
 * left. At 820px that strip was 200px of picture and 600px of two short lines,
 * which is a card that has been rolled flat. As a card in a grid the photograph
 * gets to be the thing you recognise it by, the numbers sit on top of it, and
 * three jars occupy the space one row used to.
 *
 * One tap arms — a white ring, and the pad now knows where the money is going.
 * Two taps go inside. Those can coexist without the usual 300ms delay on every
 * single tap because arming is harmless and reversible: it fires immediately,
 * and a second tap simply undoes it on the way to opening the jar. Paying the
 * delay would only be worth it if the single action were expensive to undo.
 *
 * Right-click or hold opens the jar's menu — same gesture as every other row in
 * the app, which Money was the only tab not to answer.
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

const SPRING = { type: 'spring' as const, stiffness: 260, damping: 24, mass: 0.7 };

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
  if (spentShare > monthGone + 0.15) return 'tight';
  return daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : 'last day';
}

/** Days left in the calendar month, which is the period a budget covers. */
function daysLeftInMonth(now = new Date()): number {
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.max(0, end - now.getDate());
}

export function Jar({
  jar, armed, onArm, onOpen, onHold, onMenu, index = 0,
}: {
  jar: JarRow;
  armed: boolean;
  onArm: () => void;
  onOpen: () => void;
  /**
   * Hold-to-menu. The page owns one `useLongPress()` and passes its `start`
   * down, so the whole app shares one tuned 420ms / 7px gesture rather than
   * each row growing a timer of its own.
   */
  onHold?: (e: React.PointerEvent) => void;
  /** Right-click. Opens the same menu without waiting out the hold. */
  onMenu?: (e: React.MouseEvent) => void;
  /** Stagger position in the grid. */
  index?: number;
}) {
  const { prefs } = usePrefs();
  const daysLeft = daysLeftInMonth();
  // 400ms, just under useLongPress's 420ms: a press held long enough to open
  // the menu must not also arm the jar on release.
  const tap = useDoubleTap(onArm, onOpen, 300, { limitMs: K.longPressMs - 20 });
  const over = jar.spent > jar.budget;
  const share = jar.spent / Math.max(1, jar.budget);
  const left = jar.budget - jar.spent;
  const hue = over ? '#FF6B6B' : share > 0.85 ? '#FFC24B' : colourOf(jar.category);
  const photo = jarPhoto(jar.category, jar.photo_path);

  return (
    <motion.button
      {...tap}
      // Both gestures read the same pointerdown and neither swallows it:
      // useTap drops anything past 700ms, useLongPress fires at 420ms and
      // cancels on a 7px drag.
      onPointerDown={(e) => { tap.onPointerDown(e); onHold?.(e); }}
      onContextMenu={onMenu}
      initial={prefs.motion ? { opacity: 0, y: 14, scale: 0.97 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...SPRING, delay: index * 0.05 }}
      whileHover={prefs.motion ? { y: -4 } : undefined}
      whileTap={prefs.motion ? { scale: 0.985 } : undefined}
      aria-label={`${jar.category}. ${over ? `${peso(-left)} over` : `${peso(left)} left`}. Tap to log here, twice to open.`}
      aria-pressed={armed}
      style={{
        display: 'flex', flexDirection: 'column', width: '100%', padding: 0, cursor: 'pointer',
        borderRadius: 14, overflow: 'hidden', font: 'inherit', color: 'inherit', textAlign: 'left',
        background: 'var(--card)', position: 'relative',
        border: `1px solid ${armed ? '#FFFFFF' : 'var(--line)'}`,
        boxShadow: armed
          ? '0 0 0 1.5px #FFFFFF, 0 0 22px rgba(255,255,255,.24)'
          : '0 1px 2px rgba(0,0,0,.18)',
        transition: 'box-shadow .2s ease, border-color .2s ease',
      }}
    >
      {/* The picture is the label. A photograph of food says "Food" faster than
          the word does, and it is the one thing on this tab that is not a
          number. */}
      <span style={{ position: 'relative', display: 'block', height: 92, background: 'var(--card2)', overflow: 'hidden' }}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <motion.img src={photo} alt=""
            animate={prefs.motion ? { scale: armed ? 1.07 : 1 } : undefined}
            transition={SPRING}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
            background: `color-mix(in srgb, ${hue} 22%, transparent)`,
            color: hue, fontSize: 30, fontWeight: 800,
          }}>{jar.category.slice(0, 1).toUpperCase()}</span>
        )}
        <span aria-hidden style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(12,11,20,.15) 0%, rgba(12,11,20,.55) 55%, rgba(12,11,20,.92) 100%)',
        }} />

        {/* Armed says so in words as well as in the ring — a white outline on a
            photograph is not a reliable signal at every photograph. */}
        {armed && (
          <motion.span
            initial={prefs.motion ? { opacity: 0, scale: 0.8 } : false}
            animate={{ opacity: 1, scale: 1 }}
            transition={SPRING}
            className="num"
            style={{
              position: 'absolute', top: 7, right: 7, display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 7px', borderRadius: 999, background: '#FFFFFF', color: '#0C0F16',
              fontSize: 8, fontWeight: 800, letterSpacing: '.1em',
            }}>
            <Icon name="target" size={9} color="#0C0F16" />AIMED
          </motion.span>
        )}

        {over && (
          <span className="num" style={{
            position: 'absolute', top: 7, left: 7, padding: '3px 7px', borderRadius: 999,
            background: 'color-mix(in srgb, #FF6B6B 88%, transparent)', color: '#1A0808',
            fontSize: 8, fontWeight: 800, letterSpacing: '.1em',
          }}>OVER</span>
        )}

        <span style={{ position: 'absolute', left: 10, right: 10, bottom: 8 }}>
          <span style={{
            display: 'block', fontSize: 14, fontWeight: 800, letterSpacing: '-.02em', color: '#FFFFFF',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {jar.category}
          </span>
          <span className="num" style={{
            display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 1,
            fontSize: 10, fontWeight: 600, color: over ? '#FF9B9B' : 'rgba(255,255,255,.72)',
          }}>
            {over ? `${peso(-left)} over` : `${peso(left)} left`}
            <span style={{ opacity: 0.65 }}>· {qualifier(jar, daysLeft)}</span>
          </span>
        </span>
      </span>

      <span style={{ display: 'block', padding: '9px 10px 10px' }}>
        <AsciiBar
          shape="jar"
          value={share * 100}
          hue={hue}
          text={peso(jar.spent)}
          rightText={peso(jar.budget)}
          label={`${jar.category} budget`}
        />
      </span>
    </motion.button>
  );
}
