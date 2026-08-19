'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useLayout } from '@/lib/useLayout';
import { Icon } from '@/components/Icon';
import { PAL } from '@/lib/pal';
import {
  useTransactions, useAccounts, useBudgets, useToBuy, useMoneyActions,
  useGoals, useSubs, useBudgetActions, useGoalActions, useSubActions, useBuyActions,
  peso, parseAmount, verifyPin, lockedSections,
} from '@/lib/money';
import { InlineForm, AddButton, RowActions, toCentavos, fromCentavos } from '@/components/MoneyRows';
import { toast } from '@/lib/toast';

/** Ported from Basedly.dc.html markup 2102–2183. */

const TABS = ['Overview', 'Budgets', 'Transactions', 'Goals', 'Subscriptions', 'To buy'] as const;
type Tab = (typeof TABS)[number];

const KICKER: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)' };
const CARD: React.CSSProperties = { background: 'var(--card)', borderRadius: 16, padding: '15px 16px', boxShadow: 'var(--sh)' };
const MINT = '#2FDCA6';
const CATS = ['Food', 'Transport', 'School', 'Other'];

export default function MoneyPage() {
  const [locked, setLocked] = useState<boolean | null>(null);
  useEffect(() => { lockedSections().then((s) => setLocked(s.includes('money'))); }, []);
  if (locked === null) return <div style={{ height: 200 }} />;
  if (locked) return <PinGate onPass={() => setLocked(false)} />;
  return <Money />;
}

function PinGate({ onPass }: { onPass: () => void }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState(false);
  const submit = async () => { if (await verifyPin(pin)) onPass(); else { setErr(true); setPin(''); } };

  return (
    <div className="rise" style={{ maxWidth: 320, margin: '60px auto', textAlign: 'center' }}>
      <Icon name="money" size={26} color={PAL.mint} />
      <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em', margin: '14px 0 6px' }}>Money is PIN-locked</h1>
      <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginBottom: 20 }}>Enter your PIN to unlock.</p>
      <input value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr(false); }}
        onKeyDown={(e) => e.key === 'Enter' && submit()} inputMode="numeric" autoComplete="off" placeholder="••••"
        style={{
          width: '100%', minHeight: 44, padding: '12px 14px', borderRadius: 9, textAlign: 'center',
          border: `1px solid ${err ? PAL.coral : 'var(--line2)'}`, background: 'var(--card)',
          color: 'var(--tx)', fontSize: 18, letterSpacing: '.4em',
        }} />
      {err && <p style={{ marginTop: 10, fontSize: 11.5, color: PAL.coral }}>Wrong PIN.</p>}
      <button onClick={submit} className="acc"
        style={{ marginTop: 16, width: '100%', minHeight: 44, borderRadius: 14, background: 'var(--acc)', color: '#0C0F16', fontSize: 13.5, fontWeight: 700 }}>
        Unlock
      </button>
    </div>
  );
}

function Money() {
  const { phone } = useLayout();
  const [tab, setTab] = useState<Tab>('Overview');
  const [amt, setAmt] = useState('');
  const [cat, setCat] = useState(CATS[0]);

  const { data: txns = [] } = useTransactions();
  const { data: accounts = [] } = useAccounts();
  const { data: budgets = [] } = useBudgets();
  const { data: toBuy = [] } = useToBuy();
  const A = useMoneyActions();

  const { data: goals = [] } = useGoals();
  const { data: subs = [] } = useSubs();

  // One editor at a time across the whole screen: `${tab}:${id}` for an edit,
  // `${tab}:new` for a create, null for none.
  const [editing, setEditing] = useState<string | null>(null);
  const BA = useBudgetActions();
  const GA = useGoalActions();
  const SA = useSubActions();
  const BuyA = useBuyActions();

  const month = new Date().toISOString().slice(0, 7);
  const monthTx = txns.filter((t) => t.occurred_at.startsWith(month));
  const monthOut = monthTx.reduce((s, t) => s + Math.abs(t.amount_centavos), 0);

  const balances = new Map<string, number>();
  for (const a of accounts) balances.set(a.id, 0);
  for (const t of txns) if (t.account_id) balances.set(t.account_id, (balances.get(t.account_id) ?? 0) - Math.abs(t.amount_centavos));

  const spentBy = (c: string) => monthTx.filter((t) => t.category === c).reduce((s, t) => s + Math.abs(t.amount_centavos), 0);

  return (
    <div style={{ padding: phone ? '16px 14px 26px' : '20px 24px 30px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.025em', marginRight: 6 }}>Money</div>
        <div className="hbar" style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 11, background: 'var(--card)', overflowX: 'auto' }}>
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 'none', padding: '6px 13px', borderRadius: 9, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
              background: tab === t ? 'var(--acc)' : 'transparent',
              color: tab === t ? '#0C0F16' : 'var(--tx2)', transition: 'background .24s, color .24s',
            }}>{t}</button>
          ))}
        </div>
      </div>

      {tab === 'Overview' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : 'repeat(3,1fr)', gap: 12, alignContent: 'start' }}>
            {accounts.map((a) => (
              <div key={a.id} style={CARD}>
                <div style={KICKER}>{a.name}</div>
                <div style={{ fontSize: 25, fontWeight: 800, fontVariantNumeric: 'tabular-nums', margin: '8px 0 3px' }}>
                  {peso(balances.get(a.id) ?? 0)}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>{a.kind}</div>
              </div>
            ))}
            <div style={CARD}>
              <div style={KICKER}>This month</div>
              <div style={{ display: 'flex', gap: 18, marginTop: 9 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)' }}>In</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: MINT, fontVariantNumeric: 'tabular-nums' }}>{peso(0)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)' }}>Out</div>
                  <div style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{peso(monthOut)}</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ ...CARD, marginTop: 12 }}>
            <div style={KICKER}>Quick add</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--tx3)' }}>₱</span>
              <input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" placeholder="75"
                style={{ width: 110, fontSize: 26, fontWeight: 800, color: 'var(--tx)', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid var(--line2)' }} />
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {CATS.map((c) => (
                  <button key={c} onClick={() => setCat(c)} style={{
                    padding: '6px 12px', borderRadius: 999, fontSize: 11.5, fontWeight: 600,
                    border: `1px solid ${cat === c ? 'var(--acc)' : 'var(--line2)'}`,
                    color: cat === c ? 'var(--acc)' : 'var(--tx2)',
                  }}>{c}</button>
                ))}
              </div>
              <button onClick={() => {
                A.addTxn.mutate({ id: crypto.randomUUID(), name: cat, amount_centavos: parseAmount(amt), category: cat, account_id: accounts[0]?.id ?? null });
                setAmt('');
              }} className="acc"
                style={{ marginLeft: 'auto', padding: '10px 18px', borderRadius: 11, background: 'var(--acc)', color: '#0C0F16', fontSize: 13, fontWeight: 800 }}>
                Add
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', borderRadius: 12, border: '1.5px dashed var(--line2)' }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--card2)', display: 'grid', placeItems: 'center' }}>
                <Icon name="photo" size={16} color="var(--tx3)" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>Scan a receipt</div>
                <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>Pre-fills amount, merchant and date for you to confirm</div>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'Budgets' && (
        <div style={CARD}>
          {budgets.length === 0 && editing !== 'budget:new' && (
            <div style={{ fontSize: 12.5, color: 'var(--tx3)' }}>No budgets set.</div>
          )}
          {budgets.map((b) => {
            const sp = spentBy(b.category);
            const p = Math.min(100, Math.round((sp / b.amount_centavos) * 100));
            const over = sp > b.amount_centavos;
            if (editing === `budget:${b.id}`) {
              return (
                <InlineForm key={b.id}
                  fields={[{ key: 'category', label: 'Category', kind: 'text' }, { key: 'amount', label: 'Monthly limit', kind: 'money' }]}
                  initial={{ category: b.category, amount: fromCentavos(b.amount_centavos) }}
                  submitLabel="Save"
                  onCancel={() => setEditing(null)}
                  onSubmit={(v) => {
                    BA.edit.mutate({ id: b.id, patch: { category: v.category, amount_centavos: toCentavos(v.amount) } });
                    setEditing(null);
                    toast('Budget updated');
                  }} />
              );
            }
            return (
              <div key={b.id} className="blk" style={{ padding: '11px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{b.category}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{peso(sp)}</div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>of {peso(b.amount_centavos)}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: over ? PAL.coral : 'var(--tx2)', fontVariantNumeric: 'tabular-nums' }}>{p}%</div>
                  <RowActions label={b.category} onEdit={() => setEditing(`budget:${b.id}`)}
                    onDelete={() => BA.removeWithUndo(b, b.category)} />
                </div>
                <div style={{ height: 7, borderRadius: 5, background: 'var(--line2)', overflow: 'hidden' }}>
                  <div className="k-progress" style={{ width: `${p}%`, height: '100%', background: over ? PAL.coral : '#F5B33C' }} />
                </div>
              </div>
            );
          })}

          {editing === 'budget:new' ? (
            <InlineForm
              fields={[{ key: 'category', label: 'Category', kind: 'text', placeholder: 'Food' }, { key: 'amount', label: 'Monthly limit', kind: 'money', placeholder: '6000' }]}
              submitLabel="Add budget"
              onCancel={() => setEditing(null)}
              onSubmit={(v) => {
                BA.add.mutate({ id: crypto.randomUUID(), category: v.category, amount_centavos: toCentavos(v.amount), period: 'monthly' });
                setEditing(null);
                toast(`Budget for ${v.category} added`);
              }} />
          ) : (
            <AddButton label="Add a budget" onClick={() => setEditing('budget:new')} />
          )}
        </div>
      )}

      {tab === 'Transactions' && (
        <div style={CARD}>
          {txns.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--tx3)' }}>Nothing logged yet.</div>}
          {txns.map((t) => (
            editing === `txn:${t.id}` ? (
              <InlineForm key={t.id}
                fields={[
                  { key: 'name', label: 'What for', kind: 'text' },
                  { key: 'amount', label: 'Amount', kind: 'money' },
                  { key: 'category', label: 'Category', kind: 'text' },
                ]}
                initial={{ name: t.name, amount: fromCentavos(Math.abs(t.amount_centavos)), category: t.category }}
                submitLabel="Save"
                onCancel={() => setEditing(null)}
                onSubmit={(v) => {
                  // Keep the sign: an expense stays an expense after an edit.
                  const sign = t.amount_centavos < 0 ? -1 : 1;
                  A.editTxn.mutate({ id: t.id, patch: { name: v.name, amount_centavos: sign * toCentavos(v.amount), category: v.category } });
                  setEditing(null);
                  toast('Transaction updated');
                }} />
            ) : (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
                    {t.category} · {accounts.find((a) => a.id === t.account_id)?.name ?? '—'} · {new Date(t.occurred_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{peso(Math.abs(t.amount_centavos))}</div>
                <RowActions label={t.name} onEdit={() => setEditing(`txn:${t.id}`)} onDelete={() => A.removeWithUndo(t)} />
              </div>
            )
          ))}
        </div>
      )}

      {tab === 'Goals' && (
        <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : 'repeat(3,1fr)', gap: 12 }}>
          {goals.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--tx3)' }}>No goals yet.</div>}
          {goals.map((g) => {
            const p = Math.min(100, Math.round((g.saved_centavos / Math.max(1, g.target_centavos)) * 100));
            if (editing === `goal:${g.id}`) {
              return (
                <div key={g.id} style={CARD}>
                  <InlineForm
                    fields={[
                      { key: 'name', label: 'Goal', kind: 'text' },
                      { key: 'target', label: 'Target', kind: 'money' },
                      { key: 'saved', label: 'Saved', kind: 'money' },
                    ]}
                    initial={{ name: g.name, target: fromCentavos(g.target_centavos), saved: fromCentavos(g.saved_centavos) }}
                    submitLabel="Save"
                    onCancel={() => setEditing(null)}
                    onSubmit={(v) => {
                      GA.edit.mutate({ id: g.id, patch: { name: v.name, target_centavos: toCentavos(v.target), saved_centavos: toCentavos(v.saved) } });
                      setEditing(null);
                      toast('Goal updated');
                    }} />
                </div>
              );
            }
            return (
              <div key={g.id} className="blk" style={CARD}>
                <div style={KICKER}>{g.name}</div>
                <div style={{ fontSize: 23, fontWeight: 800, fontVariantNumeric: 'tabular-nums', margin: '8px 0 4px' }}>{peso(g.saved_centavos)}</div>
                <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginBottom: 11 }}>
                  of {peso(g.target_centavos)}{g.due_on ? ` · by ${new Date(g.due_on).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : ''}
                </div>
                <div style={{ height: 7, borderRadius: 5, background: 'var(--line2)', overflow: 'hidden' }}>
                  <div className="k-progress" style={{ width: `${p}%`, height: '100%', background: p >= 70 ? MINT : PAL.indigo }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
                  <button onClick={() => GA.edit.mutate({ id: g.id, patch: { saved_centavos: g.saved_centavos + 50000 } })}
                    className="hov k-squish"
                    style={{ flex: 1, minHeight: 34, borderRadius: 9, border: '1px solid var(--line2)', fontSize: 11, fontWeight: 700, color: 'var(--tx2)' }}>
                    + ₱500
                  </button>
                  <RowActions label={g.name} onEdit={() => setEditing(`goal:${g.id}`)}
                    onDelete={() => GA.removeWithUndo(g, g.name)} />
                </div>
              </div>
            );
          })}

          {editing === 'goal:new' ? (
            <div style={CARD}>
              <InlineForm
                fields={[
                  { key: 'name', label: 'Goal', kind: 'text', placeholder: 'New laptop' },
                  { key: 'target', label: 'Target', kind: 'money', placeholder: '45000' },
                  { key: 'due', label: 'By', kind: 'date' },
                ]}
                submitLabel="Add goal"
                onCancel={() => setEditing(null)}
                onSubmit={(v) => {
                  GA.add.mutate({ id: crypto.randomUUID(), name: v.name, target_centavos: toCentavos(v.target), saved_centavos: 0, due_on: v.due || null });
                  setEditing(null);
                  toast(`Goal “${v.name}” added`);
                }} />
            </div>
          ) : (
            <div style={{ gridColumn: '1 / -1' }}>
              <AddButton label="Add a goal" onClick={() => setEditing('goal:new')} />
            </div>
          )}
        </div>
      )}

      {tab === 'Subscriptions' && (
        <div style={CARD}>
          {subs.length === 0 && editing !== 'sub:new' && <div style={{ fontSize: 12.5, color: 'var(--tx3)' }}>No subscriptions.</div>}
          {subs.map((sub, i) => (
            editing === `sub:${sub.id}` ? (
              <InlineForm key={sub.id}
                fields={[
                  { key: 'name', label: 'Service', kind: 'text' },
                  { key: 'amount', label: 'Amount', kind: 'money' },
                  { key: 'next', label: 'Next charge', kind: 'date' },
                ]}
                initial={{ name: sub.name, amount: fromCentavos(sub.amount_centavos), next: sub.next_charge?.slice(0, 10) ?? '' }}
                submitLabel="Save"
                onCancel={() => setEditing(null)}
                onSubmit={(v) => {
                  SA.edit.mutate({ id: sub.id, patch: { name: v.name, amount_centavos: toCentavos(v.amount), next_charge: v.next || null } });
                  setEditing(null);
                  toast('Subscription updated');
                }} />
            ) : (
              <div key={sub.id} className="blk" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < subs.length - 1 ? '1px solid var(--line)' : undefined }}>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{sub.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>
                  {sub.next_charge ? `next ${new Date(sub.next_charge).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : '—'}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{peso(sub.amount_centavos)}</div>
                <RowActions label={sub.name} onEdit={() => setEditing(`sub:${sub.id}`)}
                  onDelete={() => SA.removeWithUndo(sub, sub.name)} />
              </div>
            )
          ))}

          {editing === 'sub:new' ? (
            <InlineForm
              fields={[
                { key: 'name', label: 'Service', kind: 'text', placeholder: 'Spotify' },
                { key: 'amount', label: 'Amount', kind: 'money', placeholder: '149' },
                { key: 'next', label: 'Next charge', kind: 'date' },
              ]}
              submitLabel="Add subscription"
              onCancel={() => setEditing(null)}
              onSubmit={(v) => {
                SA.add.mutate({ id: crypto.randomUUID(), name: v.name, amount_centavos: toCentavos(v.amount), next_charge: v.next || null, period: 'monthly' });
                setEditing(null);
                toast(`${v.name} added`);
              }} />
          ) : (
            <AddButton label="Add a subscription" onClick={() => setEditing('sub:new')} />
          )}
        </div>
      )}

      {tab === 'To buy' && (
        <div style={CARD}>
          {toBuy.map((b) => (
            editing === `buy:${b.id}` ? (
              <InlineForm key={b.id}
                fields={[{ key: 'name', label: 'Item', kind: 'text' }, { key: 'amount', label: 'Roughly', kind: 'money' }]}
                initial={{ name: b.name, amount: fromCentavos(b.amount_centavos) }}
                submitLabel="Save"
                onCancel={() => setEditing(null)}
                onSubmit={(v) => {
                  BuyA.edit.mutate({ id: b.id, patch: { name: v.name, amount_centavos: toCentavos(v.amount) } });
                  setEditing(null);
                  toast('Item updated');
                }} />
            ) : (
              <div key={b.id} className="blk" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{b.name}</div>
                <div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{peso(b.amount_centavos)}</div>
                <button onClick={() => A.logBuy.mutate({ item: b, account_id: accounts[0]?.id ?? null })} className="acc k-squish"
                  style={{ padding: '6px 11px', borderRadius: 8, background: 'var(--acc)', color: '#0C0F16', fontSize: 11, fontWeight: 800, minHeight: 32 }}>
                  Log as expense
                </button>
                <RowActions label={b.name} onEdit={() => setEditing(`buy:${b.id}`)}
                  onDelete={() => BuyA.removeWithUndo(b, b.name)} />
              </div>
            )
          ))}
          {toBuy.length === 0 && editing !== 'buy:new' && (
            <div style={{ fontSize: 12.5, color: 'var(--tx3)', padding: '6px 0' }}>Nothing on the list — everything here has been logged.</div>
          )}

          {editing === 'buy:new' ? (
            <InlineForm
              fields={[{ key: 'name', label: 'Item', kind: 'text', placeholder: 'Notebook + pens' }, { key: 'amount', label: 'Roughly', kind: 'money', placeholder: '180' }]}
              submitLabel="Add to list"
              onCancel={() => setEditing(null)}
              onSubmit={(v) => {
                BuyA.add.mutate({ id: crypto.randomUUID(), name: v.name, amount_centavos: toCentavos(v.amount), bought_at: null });
                setEditing(null);
                toast(`${v.name} added`);
              }} />
          ) : (
            <AddButton label="Add something to buy" onClick={() => setEditing('buy:new')} />
          )}
        </div>
      )}
    </div>
  );
}
