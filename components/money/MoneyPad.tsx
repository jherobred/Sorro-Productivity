'use client';

import { peso } from '@/lib/money';
import { usePrefs } from '@/lib/prefs';
import { K } from '@/lib/pal';
import { Icon } from '@/components/Icon';

/**
 * The pad, built to the shape asked for: the amount big and centred, then
 * Expense and Income, then a narrow minus and plus around a full-width field
 * (an eighth, six eighths, an eighth), then six jump chips. Under those, the
 * jars it can log into, so aiming never means scrolling away from the pad.
 *
 * Controlled: the page owns the amount and the jar so Log it knows what it is
 * logging.
 */

const CHIPS = [-50, -100, -500, 500, 100, 50];

export type PadJar = { id: string; label: string; hue: string };

export function MoneyPad({
  amount, kind, jars, jarId, onAmount, onKind, onJar, onSubmit, onNewJar,
}: {
  amount: number;
  kind: 'expense' | 'income';
  jars: PadJar[];
  jarId: string | null;
  onAmount: (n: number) => void;
  onKind: (k: 'expense' | 'income') => void;
  onJar: (id: string | null) => void;
  onSubmit: () => void;
  onNewJar: () => void;
}) {
  const { prefs } = usePrefs();
  const expense = kind === 'expense';
  const jar = jars.find((j) => j.id === jarId) ?? null;
  const bump = (d: number) => {
    if (prefs.haptics) navigator.vibrate?.(K.hapticMs);
    onAmount(Math.max(0, Math.min(999_999, amount + d)));
  };

  return (
    <div className={'mon-pad' + (expense ? ' is-expense' : ' is-income')}>
      <div className="mon-pad-amount" aria-live="polite">
        {/* Zero carries no sign: "−₱0" reads as a bug, not as an empty field. */}
        <b>{amount === 0 ? '' : expense ? '−' : '+'}{peso(amount * 100)}</b>
        <small>{amount === 0 ? 'Type or tap an amount' : `${expense ? 'Expense' : 'Income'}${jar ? ` into ${jar.label}` : ''}`}</small>
      </div>

      <div className="mon-pad-row is-kind" role="group" aria-label="Expense or income">
        <button type="button" className="is-expense" aria-pressed={expense} onClick={() => onKind('expense')}>Expense</button>
        <button type="button" className="is-income" aria-pressed={!expense} onClick={() => onKind('income')}>Income</button>
      </div>

      {/* An eighth, six eighths, an eighth. */}
      <div className="mon-pad-row is-field">
        <button type="button" onClick={() => bump(-10)} aria-label="Ten less">−</button>
        <label>
          <span aria-hidden="true">₱</span>
          <input
            value={amount === 0 ? '' : String(amount)}
            onChange={(e) => onAmount(Math.max(0, Math.min(999_999, Number(e.target.value.replace(/\D/g, '')) || 0)))}
            onKeyDown={(e) => { if (e.key === 'Enter' && amount > 0) onSubmit(); }}
            inputMode="numeric" placeholder="0" aria-label="Amount in pesos"
          />
        </label>
        <button type="button" onClick={() => bump(10)} aria-label="Ten more">+</button>
      </div>

      <div className="mon-pad-row is-chips">
        {CHIPS.map((d) => (
          <button key={d} type="button" className={d < 0 ? 'is-minus' : 'is-plus'} onClick={() => bump(d)} aria-label={`${d < 0 ? 'Minus' : 'Plus'} ${Math.abs(d)} pesos`}>
            {d < 0 ? `−${-d}` : `+${d}`}
          </button>
        ))}
      </div>

      {expense && (
        <div className="mon-pad-jars" role="group" aria-label="Log into a jar">
          {jars.map((j) => (
            <button key={j.id} type="button" aria-pressed={jarId === j.id} style={{ '--j': j.hue } as React.CSSProperties}
              onClick={() => onJar(jarId === j.id ? null : j.id)}>
              <i aria-hidden="true" />{j.label}
            </button>
          ))}
          <button type="button" className="is-new" onClick={onNewJar}><Icon name="plus" size={13} />Jar</button>
        </div>
      )}

      <button type="button" className="mon-pad-log" disabled={amount === 0}
        onClick={() => { if (prefs.haptics) navigator.vibrate?.(K.hapticMs * 2); onSubmit(); }}>
        <Icon name="check" size={17} />Log it
      </button>
    </div>
  );
}
