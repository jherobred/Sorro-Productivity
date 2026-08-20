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
  peso, verifyPin, lockedSections,
} from '@/lib/money';
import { InlineForm, AddButton, RowActions, toCentavos, fromCentavos } from '@/components/MoneyRows';
import { TabRail } from '@/components/TabRail';
import { RunwayGauge, Stacks, Jars, colourOf } from '@/components/money/Instruments';
import { QuickAdd } from '@/components/money/QuickAdd';
import { burnPerDay, runwayDays, runwayFill, byCategory, monthStart } from '@/lib/runway';
import { toast } from '@/lib/toast';

/** Ported from Basedly.dc.html markup 2102–2183. */

/**
 * Three tabs, grouped by the question being asked.
 *
 *   Overview  how long can I keep going — the runway, where it went, what is
 *             left in each jar
 *   Activity  what happened, and what is about to — transactions and the
 *             to-buy list, which is only a transaction that has not happened
 *   Plan      money already spoken for — goals and subscriptions
 *
 * Overview used to open on three account balances and a month total, which is
 * a bank statement: true, and no help. A student does not need a ledger, they
 * need to know whether they can eat out on Thursday. So it leads with days of
 * runway at their own rate of spending, then the month as stacks you can
 * compare at a glance, then budgets as jars that drain.
 *
 * Adding a transaction is a number pad and six buttons — the shape of every
 * card machine, which is where you are standing when you use it — or a
 * photograph of the receipt, read by the same scanner as the timetable and the
 * dinner plate.
 */
const TABS = ['Overview', 'Activity', 'Plan'] as const;
type Tab = (typeof TABS)[number];

const KICKER: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)' };
const CARD: React.CSSProperties = { background: 'var(--card)', borderRadius: 16, padding: '15px 16px', boxShadow: 'var(--sh)' };
const MINT = '#2FDCA6';

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
  const [adding, setAdding] = useState(false);

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
  for (const a of accounts) balances.set(a.id, a.opening_centavos ?? 0);
  for (const t of txns) if (t.account_id) balances.set(t.account_id, (balances.get(t.account_id) ?? 0) - Math.abs(t.amount_centavos));

  const spentBy = (c: string) => monthTx.filter((t) => t.category === c).reduce((s, t) => s + Math.abs(t.amount_centavos), 0);

  /* The one number the screen is for, and the two pictures under it. */
  const balance = [...balances.values()].reduce((s, v) => s + v, 0);
  const burn = burnPerDay(txns, 30);
  const days = runwayDays(balance, burn);
  const spend = byCategory(txns, monthStart(), Date.now());
  const jars = budgets.map((b) => ({ category: b.category, budget: b.amount_centavos, spent: spentBy(b.category) }));

  return (
    <div style={{ padding: phone ? '14px 14px 24px' : '20px 24px 28px', maxWidth: 820, marginInline: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 className="sronly">Money</h1>
        <TabRail tabs={TABS.map((t) => ({ id: t, label: t }))} value={tab} onChange={setTab}
          phone={phone} label="Money sections" />

        <button onClick={() => setAdding(true)} className="k-squish"
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, padding: '8px 15px',
            borderRadius: 11, background: 'var(--acc)', color: 'var(--ink)', fontSize: 12, fontWeight: 800, minHeight: 38,
          }}>
          <Icon name="plus" size={14} color="var(--ink)" />Spent
        </button>
      </div>

      {tab === 'Overview' && (
        <>
          {/* The one number the screen is for. Balance divided by your own
              rate of spending, which is a question a bank statement never
              answers however many rows it has. */}
          <div style={{ ...CARD, display: 'grid', gap: 6 }}>
            <div style={KICKER}>How long you can keep going</div>
            <RunwayGauge days={days} fill={runwayFill(days)} burn={burn} />
            <div style={{
              display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center',
              paddingTop: 6, borderTop: '1px solid var(--line)',
            }}>
              {accounts.map((a) => (
                <div key={a.id} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                    {peso(balances.get(a.id) ?? 0)}
                  </div>
                  <div style={KICKER}>{a.name}</div>
                </div>
              ))}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: PAL.coral, fontVariantNumeric: 'tabular-nums' }}>
                  {peso(monthOut)}
                </div>
                <div style={KICKER}>out this month</div>
              </div>
            </div>
          </div>

          {/* Height is money. Four stacks says in a second what four rows of
              pesos says in ten. */}
          <div style={{ ...CARD, marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 4 }}>
              <div style={KICKER}>Where it went</div>
              <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tx3)' }}>this month</div>
            </div>
            <Stacks spend={spend} />
          </div>

          {/* A budget is an envelope that drains — how much is left is the
              thing you act on, not what percentage has gone. */}
          <div style={{ ...CARD, marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 12 }}>
              <div style={KICKER}>What is left in each jar</div>
              <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tx3)' }}>
                {jars.length ? `${jars.filter((j) => j.spent < j.budget).length} of ${jars.length} still have room` : ''}
              </div>
            </div>
            <Jars jars={jars} />
          </div>

          {/* Budgets belong next to what was actually spent. On their own tab
              they were a list of numbers you had to hold in your head while
              you went to look at the other list. */}
          <div style={{ ...CARD, marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 4 }}>
              <div style={KICKER}>Budgets</div>
              <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
                this month
              </div>
            </div>
            {budgets.length === 0 && editing !== 'budget:new' && (
              <div style={{ fontSize: 12.5, color: 'var(--tx3)', padding: '8px 0' }}>No budgets set.</div>
            )}
            {budgets.map((b) => {
              const sp = spentBy(b.category);
              const pc = Math.min(100, Math.round((sp / b.amount_centavos) * 100));
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
                <div key={b.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, flex: 1 }}>{b.category}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{peso(sp)}</div>
                    <div style={{ fontSize: 11, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>of {peso(b.amount_centavos)}</div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: over ? PAL.coral : 'var(--tx2)', fontVariantNumeric: 'tabular-nums' }}>{pc}%</div>
                    <RowActions label={b.category} onEdit={() => setEditing(`budget:${b.id}`)}
                      onDelete={() => BA.removeWithUndo(b, b.category)} />
                  </div>
                  <div style={{ height: 7, borderRadius: 5, background: 'var(--line2)', overflow: 'hidden' }}>
                    <div style={{ width: `${pc}%`, height: '100%', background: over ? PAL.coral : '#F5B33C', transition: 'width .4s cubic-bezier(0.16,1,0.3,1)' }} />
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
        </>
      )}

      {/* What happened, and what is about to. The to-buy list is only a
          transaction that has not been made yet, so it belongs beside the
          ones that have rather than on a tab of its own. */}
      {tab === 'Activity' && (
        <>
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

        <div style={{ ...KICKER, margin: '18px 0 8px' }}>To buy</div>
        <div style={{ ...CARD, marginTop: 12 }}>
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
        </>
      )}

      {/* Money already spoken for: a goal is saving towards something, a
          subscription is a payment that will happen whether you look or not. */}
      {tab === 'Plan' && (
        <>
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

        <div style={{ ...KICKER, margin: '18px 0 8px' }}>Subscriptions</div>
        <div style={{ ...CARD, marginTop: 12 }}>
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
        </>
      )}
      {adding && (
        <QuickAdd onClose={() => setAdding(false)}
          onAdd={(d) => {
            A.addTxn.mutate({
              id: crypto.randomUUID(), name: d.name, amount_centavos: d.amount_centavos,
              category: d.category, account_id: accounts[0]?.id ?? null,
            });
            toast(`${peso(d.amount_centavos)} on ${d.category}`);
          }} />
      )}
    </div>
  );
}
