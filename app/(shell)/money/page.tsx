'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { SECHUE } from '@/lib/pal';
import {
  useTransactions, useAccounts, useBudgets, useToBuy, useMoneyActions,
  peso, parseAmount, verifyPin, lockedSections, type Txn,
} from '@/lib/money';

const QUOTES = [
  'Every peso has a job.',
  'Spend on what you actually use.',
  'Small leaks sink big ships.',
  'Future you is watching.',
];

export default function MoneyPage() {
  const [locked, setLocked] = useState<boolean | null>(null);

  // The gate is server-side: bd_locked_sections() decides, bd_verify_pin() opens.
  useEffect(() => {
    lockedSections().then((s) => setLocked(s.includes('money')));
  }, []);

  if (locked === null) return <div style={{ height: 200 }} />;
  if (locked) return <PinGate onPass={() => setLocked(false)} />;
  return <Money />;
}

function PinGate({ onPass }: { onPass: () => void }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState(false);

  const submit = async () => {
    if (await verifyPin(pin)) onPass();
    else { setErr(true); setPin(''); }
  };

  return (
    <div className="rise" style={{ maxWidth: 320, margin: '60px auto', textAlign: 'center' }}>
      <Icon name="money" size={26} color={SECHUE.money} />
      <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em', margin: '14px 0 6px' }}>Money is locked</h1>
      <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginBottom: 20 }}>Enter your PIN to unlock.</p>

      <input
        value={pin}
        onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr(false); }}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        inputMode="numeric"
        autoComplete="off"
        placeholder="••••"
        style={{
          width: '100%', minHeight: 44, padding: '12px 14px', borderRadius: 9, textAlign: 'center',
          border: `1px solid ${err ? 'var(--pal-coral)' : 'var(--line2)'}`,
          background: 'var(--card)', color: 'var(--tx)', fontSize: 18, letterSpacing: '.4em',
        }}
      />
      {err && <p style={{ marginTop: 10, fontSize: 11.5, color: 'var(--pal-coral)' }}>Wrong PIN.</p>}

      <button onClick={submit} className="acc"
        style={{ marginTop: 16, width: '100%', minHeight: 44, borderRadius: 14, background: 'var(--acc)', color: 'var(--ink)', fontSize: 13.5, fontWeight: 700 }}>
        Unlock
      </button>
    </div>
  );
}

function Money() {
  const { data: txns = [] } = useTransactions();
  const { data: accounts = [] } = useAccounts();
  const { data: budgets = [] } = useBudgets();
  const { data: toBuy = [] } = useToBuy();
  const A = useMoneyActions();

  const [quote, setQuote] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setQuote((q) => (q + 1) % QUOTES.length), 7000);
    return () => clearInterval(t);
  }, []);

  const month = new Date().toISOString().slice(0, 7);
  const spent = txns
    .filter((t) => t.occurred_at.startsWith(month))
    .reduce((s, t) => s + Math.abs(t.amount_centavos), 0);
  const budget = budgets.reduce((s, b) => s + b.amount_centavos, 0);
  const pct = budget > 0 ? Math.min(1, spent / budget) : 0;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.025em', marginBottom: 20 }}>Money</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'var(--cols)', gap: 14, marginBottom: 22 }}>
        <div className="rise" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 18, boxShadow: 'var(--sh)', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Ring pct={pct} />
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)' }}>This month</div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.025em', marginTop: 4 }}>{peso(spent)}</div>
            <div style={{ fontSize: 11.5, color: 'var(--tx2)', fontWeight: 600 }}>
              {budget > 0 ? `of ${peso(budget)}` : 'no budget set'}
            </div>
          </div>
        </div>

        <div className="rise" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 18, boxShadow: 'var(--sh)', display: 'flex', alignItems: 'center' }}>
          <p key={quote} className="fade" style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--tx2)', textWrap: 'pretty' }}>
            {QUOTES[quote]}
          </p>
        </div>
      </div>

      <QuickLog accounts={accounts} onLog={(name, raw, accId) =>
        A.addTxn.mutate({ id: crypto.randomUUID(), name, amount_centavos: parseAmount(raw), category: 'Quick', account_id: accId })
      } />

      {toBuy.length > 0 && (
        <Section title="To buy">
          {toBuy.map((it) => (
            <Row key={it.id}>
              <span style={{ flex: 1, fontSize: 13.5 }}>{it.name}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)' }}>{peso(it.amount_centavos)}</span>
              <button onClick={() => A.logBuy.mutate({ item: it, account_id: accounts[0]?.id ?? null })}
                style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accTx)', padding: '5px 8px', minHeight: 28 }}>
                Log
              </button>
            </Row>
          ))}
        </Section>
      )}

      <Section title="Transactions">
        {txns.length === 0 && <Row><span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>Nothing logged yet.</span></Row>}
        {txns.map((t: Txn) => (
          <Row key={t.id}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
              <div style={{ fontSize: 10.5, color: 'var(--tx3)', fontWeight: 600 }}>
                {t.category} · {new Date(t.occurred_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </div>
            </div>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--tx)', fontVariantNumeric: 'tabular-nums' }}>
              {peso(Math.abs(t.amount_centavos))}
            </span>
            <button onClick={() => A.removeWithUndo(t)} aria-label="Delete" style={{ padding: 5, minWidth: 24, minHeight: 24 }}>
              <Icon name="trash" size={13} color="var(--tx3)" />
            </button>
          </Row>
        ))}
      </Section>
    </div>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" style={{ flex: 'none' }} aria-hidden>
      <circle cx="34" cy="34" r={r} fill="none" stroke="var(--card2)" strokeWidth="7" />
      <circle
        cx="34" cy="34" r={r} fill="none"
        stroke={pct > 0.9 ? 'var(--pal-coral)' : SECHUE.money}
        strokeWidth="7" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
        transform="rotate(-90 34 34)"
        style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.22,1,.36,1)' }}
      />
    </svg>
  );
}

function QuickLog({
  accounts, onLog,
}: {
  accounts: { id: string; name: string }[];
  onLog: (name: string, raw: string, accId: string | null) => void;
}) {
  const [name, setName] = useState('');
  const [amt, setAmt] = useState('');

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    onLog(n, amt, accounts[0]?.id ?? null);
    setName('');
    setAmt('');
  };

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
      <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="What did you spend on?"
        style={{ flex: 2, minWidth: 160, minHeight: 44, padding: '12px 14px', borderRadius: 9, border: '1px solid var(--line2)', background: 'var(--card)', color: 'var(--tx)', fontSize: 13.5 }} />
      <input value={amt} onChange={(e) => setAmt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()}
        inputMode="decimal" placeholder="₱75"
        style={{ flex: 1, minWidth: 90, minHeight: 44, padding: '12px 14px', borderRadius: 9, border: '1px solid var(--line2)', background: 'var(--card)', color: 'var(--tx)', fontSize: 13.5 }} />
      <button onClick={submit} className="acc"
        style={{ minHeight: 44, padding: '0 18px', borderRadius: 14, background: 'var(--acc)', color: 'var(--ink)', fontSize: 13.5, fontWeight: 700 }}>
        Log
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 9 }}>{title}</div>
      <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: 'var(--sh)', overflow: 'hidden' }}>
        {children}
      </div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="lensrow" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderBottom: '1px solid var(--line)' }}>
      {children}
    </div>
  );
}
