'use client';

import { peso } from '@/lib/money';

/**
 * The pad, built to the shape asked for.
 *
 * Amount in the middle, big enough to read at arm's length. Expense and Income
 * above it. Then a narrow minus and plus around a full-width field — the minus
 * and plus are an eighth each, which is `1fr 6fr 1fr`. Then six jump chips.
 *
 * It lives on the screen rather than behind a button because Money is opened to
 * log far more often than it is opened to look, and a sheet between you and the
 * keypad is one tap charged on every single expense.
 *
 * Controlled: the page owns the amount so a jar can be armed alongside it, and
 * so Log it knows what it is logging.
 */

const CHIPS = [-50, -100, -500, 500, 100, 50];

export function MoneyPad({
  amount, kind, jar, onAmount, onKind, onSubmit,
}: {
  amount: number;
  kind: 'expense' | 'income';
  /** The armed jar, or null. Shown under the amount so it is never a surprise. */
  jar: string | null;
  onAmount: (n: number) => void;
  onKind: (k: 'expense' | 'income') => void;
  onSubmit: () => void;
}) {
  const expense = kind === 'expense';
  const tint = expense ? '#FF6B6B' : '#34D9A0';
  const bump = (d: number) => onAmount(Math.max(0, Math.min(999_999, amount + d)));

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 15,
      padding: 12, display: 'flex', flexDirection: 'column', gap: 7,
    }}>
      <div style={{ textAlign: 'center', padding: '6px 0 2px' }}>
        <span className="num" style={{
          display: 'block', fontSize: 38, fontWeight: 700, letterSpacing: '-.045em',
          lineHeight: 1, color: tint, transition: 'color .3s ease',
        }}>
          {/* Zero carries no sign — "−₱0" reads as a bug, not as an empty field. */}
          {amount === 0 ? '' : expense ? '−' : '+'}{peso(amount * 100)}
        </span>
        <span style={{
          display: 'block', marginTop: 7, fontFamily: 'var(--font-mono)', fontSize: 9,
          fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase',
          color: jar ? tint : 'var(--tx3)',
        }}>
          {kind} · {jar ?? 'no jar picked'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
        <Btn on={expense} tint={tint} onClick={() => onKind('expense')}>Expense</Btn>
        <Btn on={!expense} tint={tint} onClick={() => onKind('income')}>Income</Btn>
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
      <button
        onClick={onSubmit}
        disabled={amount === 0}
        className="k-squish"
        style={{
          width: '100%', minHeight: 44, borderRadius: 11, border: 'none', marginTop: 2,
          background: amount === 0 ? 'var(--card2)' : '#34D9A0',
          color: amount === 0 ? 'var(--tx3)' : '#08130E',
          fontSize: 13.5, fontWeight: 800, cursor: amount === 0 ? 'not-allowed' : 'pointer',
          boxShadow: amount === 0 ? 'none' : '0 0 22px color-mix(in srgb, #34D9A0 30%, transparent)',
        }}
      >
        Log it
      </button>
    </div>
  );
}

function Btn({
  children, onClick, on, tint, style, ...rest
}: {
  children: React.ReactNode; onClick: () => void; on?: boolean; tint?: string;
  style?: React.CSSProperties; 'aria-label'?: string;
}) {
  return (
    <button
      onClick={onClick}
      {...rest}
      style={{
        border: `1px solid ${on && tint ? tint : 'var(--line2)'}`,
        background: on && tint ? `color-mix(in srgb, ${tint} 20%, transparent)` : 'var(--card2)',
        color: on && tint ? tint : 'var(--tx2)',
        borderRadius: 9, minHeight: 38, fontSize: 12, fontWeight: 700, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        transition: 'all .18s ease', fontFamily: 'inherit', ...style,
      }}
    >{children}</button>
  );
}
