'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { AsciiBar } from '@/components/AsciiBar';
import { useOverlayBack } from '@/lib/nav';
import { peso, type Account, type Txn } from '@/lib/money';
import { colourOf } from '@/components/money/Instruments';

/** Photographs that ship for the categories most people actually use. */
const STOCK: Record<string, string> = {
  food: '/jars/food.jpg', transport: '/jars/transport.jpg', school: '/jars/school.jpg',
  fun: '/jars/fun.jpg', bills: '/jars/bills.jpg', health: '/jars/health.jpg',
};
export const jarPhoto = (category: string, photo_path?: string | null): string | null =>
  photo_path || STOCK[category.trim().toLowerCase()] || null;

export type JarRow = { id: string; category: string; spent: number; budget: number; photo_path?: string | null };

/** Days left in the calendar month, the period a jar covers. */
export function daysLeftInMonth(now = new Date()): number {
  return Math.max(0, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate());
}

const toCentavos = (s: string) => Math.round((parseFloat(s.replace(/[^0-9.]/g, '')) || 0) * 100);
const fromCentavos = (c: number) => (c ? String(c / 100) : '');

function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  useOverlayBack(true, onClose);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="ms-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ms-sheet" role="dialog" aria-modal="true" aria-label={label}>{children}</div>
    </div>,
    document.body,
  );
}

function Head({ title, sub, onClose }: { title: string; sub?: string; onClose: () => void }) {
  return (
    <header className="ms-head">
      <div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
      <button type="button" className="ms-icon" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
    </header>
  );
}

export type FieldSpec = { key: string; label: string; kind: 'text' | 'money' | 'date'; placeholder?: string; optional?: boolean };

/** Goals, subscriptions, the to-buy list and new jars all ask for a few fields and a save. */
export function FormSheet({ title, sub, fields, initial = {}, submitLabel, onClose, onSubmit, onDelete }: {
  title: string;
  sub?: string;
  fields: FieldSpec[];
  initial?: Record<string, string>;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => void;
  onDelete?: () => void;
}) {
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, initial[f.key] ?? ''])));
  const ready = fields.every((f) => f.optional || f.kind === 'date' || v[f.key].trim());
  const submit = () => { if (ready) { onSubmit(v); onClose(); } };
  return (
    <Sheet label={title} onClose={onClose}>
      <Head title={title} sub={sub} onClose={onClose} />
      <form className="ms-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {fields.map((f, i) => (
          <label key={f.key} className="ms-field">
            <span>{f.label}{(f.optional || f.kind === 'date') && <em>optional</em>}</span>
            <span className={f.kind === 'money' ? 'ms-money' : undefined}>
              {f.kind === 'money' && <i aria-hidden="true">₱</i>}
              <input className="ms-input" autoFocus={i === 0} value={v[f.key]} placeholder={f.placeholder}
                type={f.kind === 'date' ? 'date' : 'text'} inputMode={f.kind === 'money' ? 'decimal' : undefined}
                onChange={(e) => setV({ ...v, [f.key]: f.kind === 'money' ? e.target.value.replace(/[^0-9.]/g, '') : e.target.value })} />
            </span>
          </label>
        ))}
        <div className="ms-actions">
          {onDelete && <button type="button" className="ms-ghost is-danger" onClick={() => { onDelete(); onClose(); }}><Icon name="trash" size={16} />Delete</button>}
          <button type="submit" className="ms-save" disabled={!ready}>{submitLabel}</button>
        </div>
      </form>
    </Sheet>
  );
}

export { toCentavos, fromCentavos };

export type LogDetails = { name: string; place: string; who: string; category: string; accountId: string | null };

/**
 * What the pad is about to log, and a way out of saying more.
 *
 * "₱120" means nothing in a month; "₱120, lunch, canteen, with the barkada"
 * means everything. But a form is also why people stop logging, so saving
 * with only the amount is the first button, and the row is marked to finish later.
 */
export function LogSheet({ amount, kind, jar, categories, accounts, onClose, onSave }: {
  amount: number;
  kind: 'expense' | 'income';
  jar: string | null;
  categories: string[];
  accounts: Account[];
  onClose: () => void;
  /** Null is the quick path: the amount and the jar only. */
  onSave: (d: LogDetails | null, accountId: string | null) => void;
}) {
  const expense = kind === 'expense';
  const [v, setV] = useState<LogDetails>({
    name: '', place: '', who: '',
    category: jar ?? (expense ? 'Other' : 'Income'),
    accountId: accounts[0]?.id ?? null,
  });
  const choices = expense ? [...new Set([...categories, 'Other'])] : ['Income', 'Allowance', 'Salary', 'Gift'];
  return (
    <Sheet label="Log details" onClose={onClose}>
      <Head title={`${expense ? 'Log' : 'Add'} ${peso(amount)}`} sub={expense ? `Expense${v.category ? ` · ${v.category}` : ''}` : 'Income'} onClose={onClose} />
      <button type="button" className="ms-quick" onClick={() => { onSave(null, v.accountId); onClose(); }}>
        <Icon name="check" size={16} />Save the amount now<small>Add the details later</small>
      </button>
      <form className="ms-form" onSubmit={(e) => { e.preventDefault(); onSave(v, v.accountId); onClose(); }}>
        <label className="ms-field">
          <span>What for</span>
          <input className="ms-input" autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder={expense ? 'Lunch, load, tricycle' : 'Allowance, freelance'} />
        </label>
        <div className="ms-field">
          <span>{expense ? 'Jar' : 'Kind'}</span>
          <div className="ms-chips" role="radiogroup" aria-label={expense ? 'Jar' : 'Kind'}>
            {choices.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={v.category === c} style={{ '--c': expense ? colourOf(c) : '#2fdca6' } as React.CSSProperties}
                onClick={() => setV({ ...v, category: c })}><i aria-hidden="true" />{c}</button>
            ))}
          </div>
        </div>
        {accounts.length > 1 && (
          <div className="ms-field">
            <span>{expense ? 'Paid from' : 'Into'}</span>
            <div className="ms-chips" role="radiogroup" aria-label="Account">
              {accounts.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={v.accountId === a.id} style={{ '--c': a.color } as React.CSSProperties}
                  onClick={() => setV({ ...v, accountId: a.id })}><i aria-hidden="true" />{a.name}</button>
              ))}
            </div>
          </div>
        )}
        <div className="ms-pair">
          <label className="ms-field"><span>Where <em>optional</em></span>
            <input className="ms-input" value={v.place} onChange={(e) => setV({ ...v, place: e.target.value })} placeholder="Canteen, the stall by the gate" /></label>
          <label className="ms-field"><span>Who with <em>optional</em></span>
            <input className="ms-input" value={v.who} onChange={(e) => setV({ ...v, who: e.target.value })} placeholder="Alone, barkada, family" /></label>
        </div>
        <button type="submit" className="ms-save">Save with details</button>
      </form>
    </Sheet>
  );
}

/** Changing a logged row. The sign stays with the kind, so an expense cannot turn into income by accident. */
export function TxnSheet({ txn, categories, accounts, onClose, onSave, onDelete }: {
  txn: Txn;
  categories: string[];
  accounts: Account[];
  onClose: () => void;
  onSave: (patch: Partial<Txn>) => void;
  onDelete: () => void;
}) {
  const [income, setIncome] = useState(txn.amount_centavos < 0);
  const [name, setName] = useState(txn.name);
  const [amount, setAmount] = useState(fromCentavos(Math.abs(txn.amount_centavos)));
  const [category, setCategory] = useState(txn.category);
  const [place, setPlace] = useState(txn.place ?? '');
  const [who, setWho] = useState(txn.who ?? '');
  const [accountId, setAccountId] = useState(txn.account_id);
  const choices = [...new Set([...categories, txn.category, 'Other'])];
  const cents = toCentavos(amount);
  return (
    <Sheet label="Edit transaction" onClose={onClose}>
      <Head title="Edit transaction" sub={new Date(txn.occurred_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} onClose={onClose} />
      <form className="ms-form" onSubmit={(e) => {
        e.preventDefault();
        if (!cents) return;
        onSave({ name: name.trim() || txn.name, amount_centavos: (income ? -1 : 1) * cents, category, place: place.trim() || null, who: who.trim() || null, account_id: accountId, detailed: true });
        onClose();
      }}>
        <div className="ms-seg" role="radiogroup" aria-label="Expense or income">
          <button type="button" role="radio" aria-checked={!income} onClick={() => setIncome(false)}>Expense</button>
          <button type="button" role="radio" aria-checked={income} onClick={() => setIncome(true)}>Income</button>
        </div>
        <div className="ms-pair">
          <label className="ms-field"><span>What for</span>
            <input className="ms-input" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="ms-field"><span>Amount</span>
            <span className="ms-money"><i aria-hidden="true">₱</i><input className="ms-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} /></span></label>
        </div>
        <div className="ms-field">
          <span>Category</span>
          <div className="ms-chips" role="radiogroup" aria-label="Category">
            {choices.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={category === c} style={{ '--c': colourOf(c) } as React.CSSProperties} onClick={() => setCategory(c)}><i aria-hidden="true" />{c}</button>
            ))}
          </div>
        </div>
        {accounts.length > 1 && (
          <div className="ms-field">
            <span>Account</span>
            <div className="ms-chips" role="radiogroup" aria-label="Account">
              {accounts.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={accountId === a.id} style={{ '--c': a.color } as React.CSSProperties} onClick={() => setAccountId(a.id)}><i aria-hidden="true" />{a.name}</button>
              ))}
            </div>
          </div>
        )}
        <div className="ms-pair">
          <label className="ms-field"><span>Where <em>optional</em></span><input className="ms-input" value={place} onChange={(e) => setPlace(e.target.value)} /></label>
          <label className="ms-field"><span>Who with <em>optional</em></span><input className="ms-input" value={who} onChange={(e) => setWho(e.target.value)} /></label>
        </div>
        <div className="ms-actions">
          <button type="button" className="ms-ghost is-danger" onClick={() => { onDelete(); onClose(); }}><Icon name="trash" size={16} />Delete</button>
          <button type="submit" className="ms-save" disabled={!cents}>Save changes</button>
        </div>
      </form>
    </Sheet>
  );
}

/** One jar opened: how it is doing, what went into it this month, and its settings. */
export function JarSheet({ jar, txns, onClose, onAim, onOpenTxn, onSave, onDelete }: {
  jar: JarRow;
  txns: Txn[];
  onClose: () => void;
  onAim: () => void;
  onOpenTxn: (t: Txn) => void;
  onSave: (patch: { category: string; amount_centavos: number }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(jar.category);
  const [limit, setLimit] = useState(fromCentavos(jar.budget));
  const over = jar.spent > jar.budget;
  const left = jar.budget - jar.spent;
  const days = daysLeftInMonth();
  const hue = colourOf(jar.category);
  const photo = jarPhoto(jar.category, jar.photo_path);
  const month = new Date().toISOString().slice(0, 7);
  const rows = txns.filter((t) => t.category === jar.category && t.occurred_at.startsWith(month));
  const changed = name.trim() !== jar.category || toCentavos(limit) !== jar.budget;
  return (
    <Sheet label={`${jar.category} jar`} onClose={onClose}>
      <header className="ms-jar-head" style={{ '--c': hue } as React.CSSProperties}>
        <span className="ms-jar-photo">{photo ? <img src={photo} alt="" /> : <b>{jar.category.charAt(0)}</b>}</span>
        <div>
          <h2>{jar.category}</h2>
          <p>{over ? `${peso(-left)} over the limit` : `${peso(left)} left for ${days} ${days === 1 ? 'day' : 'days'}`}</p>
        </div>
        <button type="button" className="ms-icon" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
      </header>
      <div className="ms-jar-meter">
        <b>{peso(jar.spent)}</b><span>of {peso(jar.budget)} this month</span>
        <AsciiBar value={(jar.spent / Math.max(1, jar.budget)) * 100} hue={over ? '#ff6b6b' : hue} showValue={false} label={`${jar.category} spent`} />
        {!over && days > 0 && <small>About {peso(Math.floor(left / Math.max(1, days)))} a day keeps it inside the limit.</small>}
      </div>
      <button type="button" className="ms-save" onClick={() => { onAim(); onClose(); }}><Icon name="target" size={16} />Log into this jar</button>

      <div className="ms-section">
        <h3>This month<small>{rows.length} {rows.length === 1 ? 'entry' : 'entries'}</small></h3>
        {rows.length ? (
          <ul className="ms-list">
            {rows.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => onOpenTxn(t)}>
                  <span><b>{t.name}</b><small>{new Date(t.occurred_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{t.place ? ` · ${t.place}` : ''}</small></span>
                  <em>{peso(Math.abs(t.amount_centavos))}</em>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="ms-muted">Nothing in this jar yet this month.</p>}
      </div>

      <form className="ms-form ms-section" onSubmit={(e) => { e.preventDefault(); if (changed && name.trim()) onSave({ category: name.trim(), amount_centavos: toCentavos(limit) }); }}>
        <h3>Settings</h3>
        <div className="ms-pair">
          <label className="ms-field"><span>Name</span><input className="ms-input" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="ms-field"><span>Monthly limit</span><span className="ms-money"><i aria-hidden="true">₱</i><input className="ms-input" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^0-9.]/g, ''))} /></span></label>
        </div>
        <div className="ms-actions">
          <button type="button" className="ms-ghost is-danger" onClick={() => { onDelete(); onClose(); }}><Icon name="trash" size={16} />Delete jar</button>
          <button type="submit" className="ms-ghost" disabled={!changed || !name.trim()}>Save settings</button>
        </div>
      </form>
    </Sheet>
  );
}
