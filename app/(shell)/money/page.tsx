'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useLayout } from '@/lib/useLayout';
import { Icon } from '@/components/Icon';
import { PAL } from '@/lib/pal';
import {
  useTransactions, useAccounts, useBudgets, useToBuy, useMoneyActions,
  peso, parseAmount, verifyPin, lockedSections,
} from '@/lib/money';

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

  const { data: goals = [] } = useQuery({
    queryKey: ['goals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('bd_goals').select('id,name,target_centavos,saved_centavos,due_on');
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: subs = [] } = useQuery({
    queryKey: ['subs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('bd_subscriptions')
        .select('id,name,amount_centavos,next_charge,active').eq('active', true).order('next_charge');
      if (error) throw error;
      return data ?? [];
    },
  });

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
          {budgets.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--tx3)' }}>No budgets set.</div>}
          {budgets.map((b) => {
            const sp = spentBy(b.category);
            const p = Math.min(100, Math.round((sp / b.amount_centavos) * 100));
            const over = sp > b.amount_centavos;
            return (
              <div key={b.id} style={{ padding: '11px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{b.category}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{peso(sp)}</div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>of {peso(b.amount_centavos)}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: over ? PAL.coral : 'var(--tx2)', fontVariantNumeric: 'tabular-nums' }}>{p}%</div>
                </div>
                <div style={{ height: 7, borderRadius: 5, background: 'var(--line2)', overflow: 'hidden' }}>
                  <div style={{ width: `${p}%`, height: '100%', background: over ? PAL.coral : '#F5B33C', transition: 'width .4s cubic-bezier(0.16,1,0.3,1)' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'Transactions' && (
        <div style={CARD}>
          {txns.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--tx3)' }}>Nothing logged yet.</div>}
          {txns.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
                  {t.category} · {accounts.find((a) => a.id === t.account_id)?.name ?? '—'} · {new Date(t.occurred_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{peso(Math.abs(t.amount_centavos))}</div>
              <button onClick={() => A.removeWithUndo(t)} className="hov" aria-label="Delete"
                style={{ width: 24, height: 24, borderRadius: 7, display: 'grid', placeItems: 'center' }}>
                <Icon name="trash" size={13} color="var(--tx3)" />
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'Goals' && (
        <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : 'repeat(3,1fr)', gap: 12 }}>
          {goals.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--tx3)' }}>No goals yet.</div>}
          {goals.map((g) => {
            const p = Math.min(100, Math.round((g.saved_centavos / g.target_centavos) * 100));
            return (
              <div key={g.id} style={CARD}>
                <div style={KICKER}>{g.name}</div>
                <div style={{ fontSize: 23, fontWeight: 800, fontVariantNumeric: 'tabular-nums', margin: '8px 0 4px' }}>{peso(g.saved_centavos)}</div>
                <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginBottom: 11 }}>
                  of {peso(g.target_centavos)}{g.due_on ? ` · by ${new Date(g.due_on).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : ''}
                </div>
                <div style={{ height: 7, borderRadius: 5, background: 'var(--line2)', overflow: 'hidden' }}>
                  <div style={{ width: `${p}%`, height: '100%', background: p >= 70 ? MINT : PAL.indigo }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'Subscriptions' && (
        <div style={CARD}>
          {subs.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--tx3)' }}>No subscriptions.</div>}
          {subs.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < subs.length - 1 ? '1px solid var(--line)' : undefined }}>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{s.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>
                {s.next_charge ? `next ${new Date(s.next_charge).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : '—'}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{peso(s.amount_centavos)}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'To buy' && (
        <div style={CARD}>
          {toBuy.map((b) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{b.name}</div>
              <div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{peso(b.amount_centavos)}</div>
              <button onClick={() => A.logBuy.mutate({ item: b, account_id: accounts[0]?.id ?? null })} className="acc"
                style={{ padding: '5px 11px', borderRadius: 8, background: 'var(--acc)', color: '#0C0F16', fontSize: 11, fontWeight: 800 }}>
                Log as expense
              </button>
            </div>
          ))}
          {toBuy.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--tx3)', padding: '6px 0' }}>Nothing on the list — everything here has been logged.</div>
          )}
        </div>
      )}
    </div>
  );
}
