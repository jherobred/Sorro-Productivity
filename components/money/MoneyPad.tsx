'use client';

import { motion, AnimatePresence } from 'motion/react';
import { peso } from '@/lib/money';
import { usePrefs } from '@/lib/prefs';
import { K } from '@/lib/pal';
import { Icon } from '@/components/Icon';

/**
 * The pad, built to the shape asked for.
 *
 * Amount in the middle, big enough to read at arm's length. Expense and Income
 * above it. Then a narrow minus and plus around a full-width field — the minus
 * and plus are an eighth each, which is `1fr 6fr 1fr`. Then six jump chips.
 * That layout is the spec and has not changed.
 *
 * What changed is where it sits. At 820px the `1fr 6fr 1fr` row put two 90px
 * buttons at opposite ends of a 600px empty field, which is a phone control
 * enlarged rather than a desktop control. In a 320px rail the same three
 * proportions are the right three proportions, so the fix was the column it
 * lives in, not the grid.
 *
 * It stays on the screen rather than behind a button because Money is opened to
 * log far more often than it is opened to look, and a sheet between you and the
 * keypad is one tap charged on every single expense.
 *
 * Controlled: the page owns the amount so a jar can be armed alongside it, and
 * so Log it knows what it is logging.
 */

const CHIPS = [-50, -100, -500, 500, 100, 50];
const SPRING = { type: 'spring' as const, stiffness: 320, damping: 22, mass: 0.6 };

export function MoneyPad({
  amount, kind, jar, jarHue, onAmount, onKind, onSubmit,
}: {
  amount: number;
  kind: 'expense' | 'income';
  /** The armed jar, or null. Shown under the amount so it is never a surprise. */
  jar: string | null;
  /** The armed jar's colour, so the pad agrees with the jar it is pointed at. */
  jarHue?: string;
  onAmount: (n: number) => void;
  onKind: (k: 'expense' | 'income') => void;
  onSubmit: () => void;
}) {
  const { prefs } = usePrefs();
  const expense = kind === 'expense';
  const tint = expense ? '#FF6B6B' : '#34D9A0';
  const bump = (d: number) => {
    if (prefs.haptics) navigator.vibrate?.(K.hapticMs);
    onAmount(Math.max(0, Math.min(999_999, amount + d)));
  };

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16,
      padding: 13, display: 'flex', flexDirection: 'column', gap: 7,
      boxShadow: amount > 0 ? `0 0 0 1px color-mix(in srgb, ${tint} 26%, transparent)` : 'none',
      transition: 'box-shadow .3s ease',
    }}>
      {/* The amount, and the two things it is about to become. */}
      <div style={{ textAlign: 'center', padding: '8px 0 4px', position: 'relative' }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={`${amount}:${kind}`}
            className="num"
            initial={prefs.motion ? { opacity: 0, y: 8, scale: 0.94 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefs.motion ? { opacity: 0, y: -8, scale: 0.94, position: 'absolute', left: 0, right: 0 } : undefined}
            transition={SPRING}
            style={{
              display: 'block', fontSize: 40, fontWeight: 700, letterSpacing: '-.045em',
              lineHeight: 1, color: tint,
              textShadow: amount > 0 ? `0 0 28px color-mix(in srgb, ${tint} 45%, transparent)` : 'none',
            }}
          >
            {/* Zero carries no sign — "−₱0" reads as a bug, not as an empty field. */}
            {amount === 0 ? '' : expense ? '−' : '+'}{peso(amount * 100)}
          </motion.span>
        </AnimatePresence>

        <motion.span
          layout={prefs.motion}
          transition={SPRING}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 9,
            padding: '3px 9px', borderRadius: 999,
            background: jar ? `color-mix(in srgb, ${jarHue ?? tint} 15%, transparent)` : 'var(--card2)',
            border: `1px solid ${jar ? `color-mix(in srgb, ${jarHue ?? tint} 40%, transparent)` : 'var(--line2)'}`,
          }}
        >
          <span aria-hidden style={{
            width: 5, height: 5, borderRadius: 999, flex: 'none',
            background: jar ? (jarHue ?? tint) : 'var(--tx3)',
          }} />
          <span className="num" style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '.13em', textTransform: 'uppercase',
            color: jar ? (jarHue ?? tint) : 'var(--tx3)',
          }}>
            {kind} · {jar ?? 'no jar picked'}
          </span>
        </motion.span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
        <Btn on={expense} tint="#FF6B6B" onClick={() => onKind('expense')}>Expense</Btn>
        <Btn on={!expense} tint="#34D9A0" onClick={() => onKind('income')}>Income</Btn>
      </div>

      {/* An eighth, six eighths, an eighth. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 6fr 1fr', gap: 7 }}>
        <Btn onClick={() => bump(-10)} aria-label="Ten less" style={{ fontSize: 20, fontWeight: 500 }}>−</Btn>
        <label style={{
          border: '1px solid var(--line2)', background: 'var(--bg)', borderRadius: 9, minHeight: 38,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'text',
        }}>
          <span style={{ color: 'var(--tx3)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>₱</span>
          <input
            value={amount === 0 ? '' : String(amount)}
            onChange={(e) => onAmount(Math.max(0, Math.min(999_999, Number(e.target.value.replace(/\D/g, '')) || 0)))}
            onKeyDown={(e) => { if (e.key === 'Enter' && amount > 0) onSubmit(); }}
            inputMode="numeric"
            placeholder="0"
            aria-label="Amount in pesos"
            style={{
              width: '100%', border: 'none', outline: 'none', background: 'transparent',
              color: 'var(--tx)', fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 700,
              fontVariantNumeric: 'tabular-nums', textAlign: 'center', minWidth: 0, padding: 0,
            }}
          />
        </label>
        <Btn onClick={() => bump(10)} aria-label="Ten more" style={{ fontSize: 20, fontWeight: 500 }}>+</Btn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5 }}>
        {CHIPS.map((d) => (
          <Btn
            key={d}
            onClick={() => bump(d)}
            style={{
              minHeight: 30, fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600,
              color: d < 0 ? '#FF9B9B' : '#7BE8C4',
            }}
          >
            {d < 0 ? `−${-d}` : d}
          </Btn>
        ))}
      </div>

      {/* Money's own mint, not the user's accent: this button is the one
          green thing on a screen where red means spending. */}
      <motion.button
        onClick={() => { if (prefs.haptics) navigator.vibrate?.(K.hapticMs * 2); onSubmit(); }}
        disabled={amount === 0}
        whileHover={prefs.motion && amount > 0 ? { scale: 1.015 } : undefined}
        whileTap={prefs.motion && amount > 0 ? { scale: 0.97 } : undefined}
        transition={SPRING}
        style={{
          width: '100%', minHeight: 46, borderRadius: 12, border: 'none', marginTop: 2,
          background: amount === 0 ? 'var(--card2)' : '#34D9A0',
          color: amount === 0 ? 'var(--tx3)' : '#08130E',
          fontSize: 13.5, fontWeight: 800, cursor: amount === 0 ? 'not-allowed' : 'pointer',
          boxShadow: amount === 0 ? 'none' : '0 0 26px color-mix(in srgb, #34D9A0 34%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        }}
      >
        <Icon name="check" size={15} color={amount === 0 ? 'var(--tx3)' : '#08130E'} />
        Log it
      </motion.button>

      <p style={{ fontSize: 9.5, color: 'var(--tx3)', textAlign: 'center', margin: 0 }}>
        Enter logs it · tap a jar to aim it
      </p>
    </div>
  );
}

function Btn({
  children, onClick, on, tint, style, ...rest
}: {
  children: React.ReactNode; onClick: () => void; on?: boolean; tint?: string;
  style?: React.CSSProperties; 'aria-label'?: string;
}) {
  const { prefs } = usePrefs();
  return (
    <motion.button
      onClick={onClick}
      {...rest}
      whileHover={prefs.motion ? { y: -1 } : undefined}
      whileTap={prefs.motion ? { scale: 0.93 } : undefined}
      transition={SPRING}
      style={{
        border: `1px solid ${on && tint ? tint : 'var(--line2)'}`,
        background: on && tint ? `color-mix(in srgb, ${tint} 20%, transparent)` : 'var(--card2)',
        color: on && tint ? tint : 'var(--tx2)',
        borderRadius: 9, minHeight: 38, fontSize: 12, fontWeight: 700, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        transition: 'background-color .18s ease, border-color .18s ease, color .18s ease',
        fontFamily: 'inherit', ...style,
      }}
    >{children}</motion.button>
  );
}
