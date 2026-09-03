'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Icon, type IconName } from './Icon';

/**
 * The parts Habits and Fuel both draw: a section heading, a meter, a stat
 * pill, a number that rolls, and an empty state.
 *
 * Both tabs had their own near-copies of all five, which is how the same
 * "label above a bar" ended up 6px tall on one page and 18px with a dot
 * matrix on the other. One file, so a change to the shape is one edit.
 */

export function SectionLabel({
  icon, hue, title, note, action,
}: {
  icon: IconName;
  hue: string;
  title: string;
  note?: string;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
      <Icon name={icon} size={13} color={hue} />
      <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--tx)', letterSpacing: '-.01em' }}>
        {title}
      </span>
      {note && <span className="metaline" style={{ marginLeft: action ? 0 : 'auto', fontSize: 11 }}>{note}</span>}
      {action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
    </div>
  );
}

export function Meter({
  label, right, pct, hue, animate, thick,
}: {
  label: string;
  right?: string;
  pct: number;
  hue: string;
  animate: boolean;
  thick?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div>
      {(label || right) && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          marginBottom: 5, gap: 8,
        }}>
          <span className="kicker">{label}</span>
          {right && <span className="num metaline" style={{ fontSize: 10.5 }}>{right}</span>}
        </div>
      )}
      <div style={{
        height: thick ? 9 : 6, borderRadius: 5, background: 'var(--card2)',
        border: '1px solid var(--line2)', overflow: 'hidden', position: 'relative',
      }}>
        <motion.span
          initial={animate ? { width: 0 } : false}
          animate={{ width: `${clamped}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 24 }}
          style={{
            position: 'absolute', inset: '0 auto 0 0', borderRadius: 5,
            background: `linear-gradient(90deg, color-mix(in srgb, ${hue} 55%, transparent), ${hue})`,
            boxShadow: `0 0 12px color-mix(in srgb, ${hue} 45%, transparent)`,
          }}
        />
      </div>
    </div>
  );
}

export function StatPill({
  icon, hue, value, label,
}: { icon: IconName; hue: string; value: string; label: string }) {
  return (
    <div
      title={label}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 11,
        background: 'var(--card2)', border: '1px solid var(--line2)',
      }}
    >
      <Icon name={icon} size={13} color={hue} />
      <span className="num" style={{ fontSize: 12, fontWeight: 800, color: hue }}>{value}</span>
      <span className="metaline" style={{ fontSize: 10.5 }}>{label}</span>
    </div>
  );
}

/** Rolls to a new number instead of swapping it. */
export function CountUp({
  value, animate, format,
}: {
  value: number;
  animate: boolean;
  format?: (n: number) => string;
}) {
  const [shown, setShown] = useState(value);
  const raf = useRef<number | null>(null);
  const from = useRef(value);

  useEffect(() => {
    if (!animate) { setShown(value); return; }
    const start = performance.now();
    const origin = from.current;
    if (origin === value) return;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 480);
      const eased = 1 - Math.pow(1 - k, 3);
      const next = origin + (value - origin) * eased;
      setShown(Math.round(next));
      if (k < 1) raf.current = requestAnimationFrame(step);
      else from.current = value;
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, animate]);

  useEffect(() => { if (!animate) from.current = value; }, [value, animate]);

  return <>{format ? format(shown) : shown.toLocaleString()}</>;
}

/**
 * A tile that says one number, how far it is from its goal, and offers the
 * quickest way to move it. The row of these is what stops a fresh day from
 * looking like a broken page.
 */
export function VitalTile({
  icon, hue, label, value, unit, goal, pct, animate, sub, actions, onClick,
}: {
  icon: IconName;
  hue: string;
  label: string;
  value: number;
  unit?: string;
  goal?: string;
  pct: number;
  animate: boolean;
  sub?: string;
  actions?: { label: string; run: () => void }[];
  onClick?: () => void;
}) {
  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      whileHover={animate ? { y: -3 } : undefined}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      onClick={onClick}
      style={{
        position: 'relative', overflow: 'hidden', minWidth: 0,
        background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16,
        padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 9,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, ${hue} 13%, transparent) 0%, transparent 62%)`,
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
        <Icon name={icon} size={12} color={hue} />
        <span className="kicker" style={{ color: hue }}>{label}</span>
        {goal && <span className="num metaline" style={{ marginLeft: 'auto', fontSize: 10.5 }}>{goal}</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, position: 'relative' }}>
        <span className="num" style={{
          fontSize: 24, fontWeight: 800, letterSpacing: '-.035em', lineHeight: 1, color: 'var(--tx)',
        }}>
          <CountUp value={value} animate={animate} />
        </span>
        {unit && <span className="metaline" style={{ fontSize: 11.5, fontWeight: 700 }}>{unit}</span>}
      </div>

      <div style={{ position: 'relative' }}>
        <Meter label="" pct={pct} hue={hue} animate={animate} />
      </div>

      {sub && <div className="metaline" style={{ fontSize: 10.5, position: 'relative' }}>{sub}</div>}

      {actions && actions.length > 0 && (
        <div style={{ display: 'flex', gap: 5, position: 'relative', flexWrap: 'wrap' }}>
          {actions.map((a) => (
            <motion.button
              key={a.label}
              onClick={(e) => { e.stopPropagation(); a.run(); }}
              whileTap={animate ? { scale: 0.92 } : undefined}
              whileHover={animate ? { scale: 1.06 } : undefined}
              style={{
                padding: '4px 9px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid color-mix(in srgb, ${hue} 32%, var(--line2))`,
                background: `color-mix(in srgb, ${hue} 10%, transparent)`,
                color: hue, fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 800,
              }}
            >
              {a.label}
            </motion.button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export function EmptyBlock({
  icon, hue, title, body, action,
}: {
  icon: IconName;
  hue: string;
  title: string;
  body: string;
  action?: { label: string; run: () => void };
}) {
  return (
    <div style={{
      border: '1px dashed var(--line2)', borderRadius: 14, padding: '26px 18px',
      textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
    }}>
      <span style={{
        width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center',
        background: `color-mix(in srgb, ${hue} 14%, transparent)`,
      }}>
        <Icon name={icon} size={17} color={hue} />
      </span>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx)' }}>{title}</div>
      <div className="metaline" style={{ maxWidth: 320, lineHeight: 1.45 }}>{body}</div>
      {action && (
        <button
          onClick={action.run}
          className="k-squish"
          style={{
            marginTop: 2, padding: '7px 14px', borderRadius: 10, cursor: 'pointer',
            border: `1px solid color-mix(in srgb, ${hue} 38%, transparent)`,
            background: `color-mix(in srgb, ${hue} 13%, transparent)`,
            color: hue, fontSize: 11.5, fontWeight: 800,
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
