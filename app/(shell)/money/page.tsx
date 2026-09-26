'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { AsciiBar } from '@/components/AsciiBar';
import { MoneySkeleton } from '@/components/Skeleton';
import { ContextMenu, type CtxGroup } from '@/components/ContextMenu';
import { MoneyPad } from '@/components/money/MoneyPad';
import { Stacks, SpendTrend, MonthHeatmap, ComingUp, toUpcoming, colourOf } from '@/components/money/Instruments';
import {
  FormSheet, JarSheet, LogSheet, TxnSheet, daysLeftInMonth, fromCentavos, jarPhoto, toCentavos, type JarRow, type LogDetails,
} from '@/components/money/MoneySheets';
import { usePrefs } from '@/lib/prefs';
import { useLongPress } from '@/lib/useLongPress';
import { toast } from '@/lib/toast';
import { logDay } from '@/lib/logday';
import {
  useTransactions, useAccounts, useBudgets, useToBuy, useMoneyActions,
  useGoals, useSubs, useBudgetActions, useGoalActions, useSubActions, useBuyActions,
  peso, verifyPin, lockedSections, type Txn, type Goal, type Sub, type ToBuy,
} from '@/lib/money';
import {
  balanceOf, burnPerDay, runwayDays, runwayFill, byCategory, monthStart,
  dailySpend, monthSpend, noSpendStreak, weekDelta, localDay, outgo, incoming,
} from '@/lib/runway';
import './money.css';

const INK = '#06231a';
const PAGE = 40;

export default function MoneyPage() {
  const [locked, setLocked] = useState<boolean | null>(null);
  useEffect(() => { void lockedSections().then((s) => setLocked(s.includes('money'))); }, []);
  if (locked === null) return <div className="mon"><MoneySkeleton /></div>;
  if (locked) return <PinGate onPass={() => setLocked(false)} />;
  return <Money />;
}

/** Money is PIN-gated on the server; this only asks. */
function PinGate({ onPass }: { onPass: () => void }) {
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  const submit = async () => { if (await verifyPin(pin)) onPass(); else { setWrong(true); setPin(''); } };
  return (
    <div className="mon-lock">
      <span className="mon-lock-mark"><Icon name="lock" size={24} /></span>
      <h1>Money is locked</h1>
      <p>Enter your PIN to open it.</p>
      <input value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setWrong(false); }}
        onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }} inputMode="numeric" autoComplete="off" placeholder="••••"
        aria-label="PIN" aria-invalid={wrong} className={wrong ? 'is-wrong' : undefined} />
      {wrong && <p className="mon-lock-error" role="alert">That PIN is not right.</p>}
      <button type="button" onClick={() => void submit()} disabled={pin.length < 4}>Unlock</button>
    </div>
  );
}

type Sheet =
  | { kind: 'log' }
  | { kind: 'txn'; id: string }
  | { kind: 'jar'; id: string }
  | { kind: 'newJar' }
  | { kind: 'goal'; id: string | null }
  | { kind: 'sub'; id: string | null }
  | { kind: 'buy'; id: string | null };

function dayLabel(day: string): string {
  const today = localDay(new Date());
  const yesterday = localDay(new Date(Date.now() - 864e5));
  if (day === today) return 'Today';
  if (day === yesterday) return 'Yesterday';
  return new Date(`${day}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function Money() {
  const { prefs } = usePrefs();
  const { data: txns = [], isPending } = useTransactions();
  const { data: accounts = [] } = useAccounts();
  const { data: budgets = [] } = useBudgets();
  const { data: toBuy = [] } = useToBuy();
  const { data: goals = [] } = useGoals();
  const { data: subs = [] } = useSubs();
  const A = useMoneyActions();
  const BA = useBudgetActions();
  const GA = useGoalActions();
  const SA = useSubActions();
  const BuyA = useBuyActions();
  const lp = useLongPress();

  const [pad, setPad] = useState(0);
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [jarId, setJarId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [pickedCat, setPickedCat] = useState<string | null>(null);
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [view, setView] = useState<'categories' | 'trend' | 'calendar'>('categories');
  const [shown, setShown] = useState(PAGE);

  const month = new Date().toISOString().slice(0, 7);
  const monthTx = txns.filter((t) => t.occurred_at.startsWith(month));
  const balance = accounts.reduce((sum, a) => sum + balanceOf(a.opening_centavos ?? 0, txns.filter((t) => t.account_id === a.id)), 0);
  const burn = burnPerDay(txns, 30);
  const days = runwayDays(balance, burn);
  const spend = byCategory(txns, monthStart(), Date.now());
  const trend = useMemo(() => dailySpend(txns, 30), [txns]);
  const grid = useMemo(() => monthSpend(txns), [txns]);
  const streak = noSpendStreak(trend);
  const wow = useMemo(() => weekDelta(txns), [txns]);
  const upcoming = useMemo(() => toUpcoming(subs, goals), [subs, goals]);
  const today = logDay(new Date());
  const todaysOut = txns.filter((t) => logDay(t.occurred_at) === today).reduce((s, t) => s + outgo(t), 0);
  const monthIn = monthTx.reduce((s, t) => s + incoming(t), 0);

  const jars: JarRow[] = budgets.map((b) => ({
    id: b.id, category: b.category, budget: b.amount_centavos, photo_path: b.photo_path,
    spent: monthTx.filter((t) => t.category === b.category).reduce((s, t) => s + outgo(t), 0),
  }));
  const armed = jars.find((j) => j.id === jarId) ?? null;
  const categories = [...new Set([...jars.map((j) => j.category), ...txns.filter((t) => t.amount_centavos > 0).map((t) => t.category)])].filter((c) => c !== 'Archived');
  const daysLeft = daysLeftInMonth();

  const ledger = txns.filter((t) => (!pickedCat || t.category === pickedCat) && (!pickedDay || localDay(new Date(t.occurred_at)) === pickedDay));
  const filtered = !!(pickedCat || pickedDay);
  const byDay = useMemo(() => {
    const out: { day: string; rows: Txn[]; out: number; in: number }[] = [];
    for (const t of ledger.slice(0, shown)) {
      const day = localDay(new Date(t.occurred_at));
      const last = out[out.length - 1];
      const group = last?.day === day ? last : (out.push({ day, rows: [], out: 0, in: 0 }), out[out.length - 1]);
      group.rows.push(t);
      group.out += outgo(t);
      group.in += incoming(t);
    }
    return out;
  }, [ledger, shown]);

  const commit = (d: LogDetails | null, accountId: string | null) => {
    const cents = pad * 100;
    const category = d?.category ?? armed?.category ?? (kind === 'income' ? 'Income' : 'Other');
    const row = {
      id: crypto.randomUUID(),
      name: d?.name.trim() || category,
      // Expenses are stored positive and income negative, the convention lib/runway.ts reads.
      amount_centavos: (kind === 'expense' ? 1 : -1) * cents,
      category,
      account_id: accountId ?? accounts[0]?.id ?? null,
      place: d?.place.trim() || null,
      who: d?.who.trim() || null,
      detailed: d !== null,
    };
    A.addTxn.mutate(row);
    toast(`${peso(cents)} ${kind === 'expense' ? 'spent' : 'added'}${d ? '' : ', details later'}`, () => A.delTxn.mutate({ id: row.id }), { tone: 'success', icon: 'money' });
    setPad(0);
  };

  /* ---- right-click and hold, by what was held */
  const menu = (): { label: string; groups: CtxGroup[] } | null => {
    const c = lp.ctx;
    if (!c) return null;
    if (c.kind === 'jar') {
      const j = jars.find((x) => x.id === c.id);
      const b = budgets.find((x) => x.id === c.id);
      if (!j || !b) return null;
      return { label: j.category, groups: [
        { items: [
          { label: jarId === j.id ? 'Stop logging here' : 'Log into this jar', icon: 'target', run: () => { setKind('expense'); setJarId(jarId === j.id ? null : j.id); } },
          { label: 'Open jar', icon: 'expand', run: () => setSheet({ kind: 'jar', id: j.id }) },
          { label: 'Show only this jar', icon: 'filter', run: () => { setPickedCat(j.category); setPickedDay(null); } },
        ] },
        { items: [
          { label: 'Raise limit by ₱500', icon: 'up', run: () => { BA.edit.mutate({ id: j.id, patch: { amount_centavos: j.budget + 50000 } }); toast(`${j.category} limit raised to ${peso(j.budget + 50000)}`); } },
          { label: 'Delete jar', icon: 'trash', danger: true, run: () => BA.removeWithUndo(b, j.category) },
        ] },
      ] };
    }
    if (c.kind === 'txn') {
      const t = txns.find((x) => x.id === c.id);
      if (!t) return null;
      const income = t.amount_centavos < 0;
      return { label: t.name, groups: [
        { items: [
          { label: 'Edit', icon: 'edit', run: () => setSheet({ kind: 'txn', id: t.id }) },
          { label: 'Log it again', icon: 'copy', run: () => { A.addTxn.mutate({ id: crypto.randomUUID(), name: t.name, amount_centavos: t.amount_centavos, category: t.category, account_id: t.account_id, place: t.place, who: t.who, detailed: t.detailed }); toast(`${t.name} logged again`); } },
          { label: income ? 'Make it an expense' : 'Make it income', icon: 'refresh', run: () => A.editTxn.mutate({ id: t.id, patch: { amount_centavos: -t.amount_centavos } }) },
        ] },
        { label: 'Show only', items: [
          { label: t.category, icon: 'filter', run: () => { setPickedCat(t.category); setPickedDay(null); } },
          { label: 'This day', icon: 'day', run: () => { setPickedDay(localDay(new Date(t.occurred_at))); setPickedCat(null); } },
        ] },
        { items: [{ label: 'Delete', icon: 'trash', danger: true, run: () => A.removeWithUndo(t) }] },
      ] };
    }
    if (c.kind === 'goal') {
      const g = goals.find((x) => x.id === c.id);
      if (!g) return null;
      return { label: g.name, groups: [
        { items: [
          { label: 'Edit goal', icon: 'edit', run: () => setSheet({ kind: 'goal', id: g.id }) },
          { label: 'Add ₱1,000', icon: 'plus', run: () => GA.edit.mutate({ id: g.id, patch: { saved_centavos: g.saved_centavos + 100000 } }) },
          { label: 'Mark as reached', icon: 'check', run: () => GA.edit.mutate({ id: g.id, patch: { saved_centavos: g.target_centavos } }) },
        ] },
        { items: [{ label: 'Delete goal', icon: 'trash', danger: true, run: () => GA.removeWithUndo(g, g.name) }] },
      ] };
    }
    if (c.kind === 'sub') {
      const s = subs.find((x) => x.id === c.id);
      if (!s) return null;
      return { label: s.name, groups: [
        { items: [
          { label: 'Edit', icon: 'edit', run: () => setSheet({ kind: 'sub', id: s.id }) },
          { label: 'Log this charge', icon: 'money', run: () => logCharge(s) },
          { label: 'Push a month later', icon: 'clock', disabled: !s.next_charge, hint: s.next_charge ? undefined : 'No charge date set', run: () => pushMonth(s) },
        ] },
        { items: [{ label: 'Cancel subscription', icon: 'trash', danger: true, run: () => SA.removeWithUndo(s, s.name) }] },
      ] };
    }
    if (c.kind === 'buy') {
      const b = toBuy.find((x) => x.id === c.id);
      if (!b) return null;
      return { label: b.name, groups: [
        { items: [
          { label: 'Bought it', icon: 'check', run: () => bought(b) },
          { label: 'Edit', icon: 'edit', run: () => setSheet({ kind: 'buy', id: b.id }) },
        ] },
        { items: [{ label: 'Remove from list', icon: 'trash', danger: true, run: () => BuyA.removeWithUndo(b, b.name) }] },
      ] };
    }
    return null;
  };
  const open = menu();
  /** A hold opens the menu; the click that ends it must not also open the row. */
  const tap = (fn: () => void) => () => { if (!lp.ctx) fn(); };
  const hold = (kindName: string, id: string, label: string) => ({
    onPointerDown: (e: React.PointerEvent) => lp.start(e, kindName, id, label),
    onContextMenu: (e: React.MouseEvent) => lp.onContextMenu(e, kindName, id, label),
  });

  const logCharge = (s: Sub) => {
    const id = crypto.randomUUID();
    A.addTxn.mutate({ id, name: s.name, amount_centavos: s.amount_centavos, category: 'Bills', account_id: accounts[0]?.id ?? null, detailed: true });
    if (s.next_charge) pushMonth(s, false);
    toast(`${peso(s.amount_centavos)} logged for ${s.name}`, () => A.delTxn.mutate({ id }), { tone: 'success', icon: 'money' });
  };
  const pushMonth = (s: Sub, say = true) => {
    const d = new Date(`${s.next_charge!.slice(0, 10)}T12:00`);
    d.setMonth(d.getMonth() + 1);
    SA.edit.mutate({ id: s.id, patch: { next_charge: localDay(d) } });
    if (say) toast(`${s.name} moved to ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`);
  };
  const bought = (b: ToBuy) => {
    A.logBuy.mutate({ item: b, account_id: accounts[0]?.id ?? null });
    toast(`${b.name} logged as spent`, undefined, { tone: 'success', icon: 'check' });
  };

  if (isPending) return <div className="mon"><MoneySkeleton /></div>;

  const txnOpen = sheet?.kind === 'txn' ? txns.find((t) => t.id === sheet.id) ?? null : null;
  const jarOpen = sheet?.kind === 'jar' ? jars.find((j) => j.id === sheet.id) ?? null : null;
  const goalOpen: Goal | null = sheet?.kind === 'goal' && sheet.id ? goals.find((g) => g.id === sheet.id) ?? null : null;
  const subOpen: Sub | null = sheet?.kind === 'sub' && sheet.id ? subs.find((s) => s.id === sheet.id) ?? null : null;
  const buyOpen: ToBuy | null = sheet?.kind === 'buy' && sheet.id ? toBuy.find((b) => b.id === sheet.id) ?? null : null;
  const subsTotal = subs.reduce((s, x) => s + x.amount_centavos, 0);

  return (
    <div className="mon">
      <header className="mon-hero">
        <div className="mon-hero-copy">
          <span className="mon-kicker">Balance across {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}</span>
          <h1>{peso(balance)}</h1>
          <p>{days === null ? 'Log something and the runway starts counting.' : `${days.toLocaleString()} ${days === 1 ? 'day' : 'days'} of runway at ${peso(burn)} a day`}</p>
          <AsciiBar value={runwayFill(days) * 100} hue={INK} showValue={false} label="Runway" />
          <dl className="mon-facts">
            <div><dt>Out today</dt><dd>{peso(todaysOut)}</dd></div>
            <div><dt>This week</dt><dd>{peso(wow.current)}{wow.pct !== null && <small className={wow.pct > 0 ? 'is-up' : 'is-down'}>{wow.pct > 0 ? '+' : ''}{wow.pct}%</small>}</dd></div>
            <div><dt>In this month</dt><dd>{peso(monthIn)}</dd></div>
            <div><dt>Days with no spending logged</dt><dd>{streak} {streak === 1 ? 'day' : 'days'}<small>Based on your entries; unlogged spending is not included.</small></dd></div>
          </dl>
        </div>
        <MoneyPad
          amount={pad} kind={kind} jarId={jarId}
          jars={jars.map((j) => ({ id: j.id, label: j.category, hue: colourOf(j.category) }))}
          onAmount={setPad} onKind={(k) => { setKind(k); if (k === 'income') setJarId(null); }} onJar={setJarId}
          onSubmit={() => setSheet({ kind: 'log' })} onNewJar={() => setSheet({ kind: 'newJar' })}
        />
      </header>

      <div className="mon-grid">
        <div className="mon-main">
          <section className="mon-card" aria-label="Jars">
            <header className="mon-card-head">
              <div>
                <h2>Jars</h2>
                <p>{jars.length ? `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left in ${new Date().toLocaleDateString(undefined, { month: 'long' })}. Tap a jar to open it.` : 'A jar is a monthly limit you log straight into.'}</p>
              </div>
              <button type="button" className="mon-link" onClick={() => setSheet({ kind: 'newJar' })}><Icon name="plus" size={14} />Add jar</button>
            </header>
            {jars.length ? (
              <div className="mon-jars">
                {jars.map((j) => {
                  const over = j.spent > j.budget;
                  const photo = jarPhoto(j.category, j.photo_path);
                  return (
                    <button key={j.id} type="button" className={'mon-jar' + (over ? ' is-over' : '') + (jarId === j.id ? ' is-armed' : '')}
                      style={{ '--j': colourOf(j.category) } as React.CSSProperties} onClick={tap(() => setSheet({ kind: 'jar', id: j.id }))} {...hold('jar', j.id, j.category)}>
                      <span className="mon-jar-photo">{photo ? <img src={photo} alt="" loading="lazy" /> : <b>{j.category.charAt(0)}</b>}</span>
                      <span className="mon-jar-body">
                        <b>{j.category}</b>
                        <small>{over ? `${peso(j.spent - j.budget)} over` : `${peso(j.budget - j.spent)} left`}</small>
                        <AsciiBar value={(j.spent / Math.max(1, j.budget)) * 100} hue={over ? '#ff6b6b' : colourOf(j.category)} showValue={false} shape="slim" label={`${j.category} spent`} />
                        <small>{peso(j.spent)} of {peso(j.budget)}</small>
                      </span>
                      {jarId === j.id && <span className="mon-jar-armed">Logging here</span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <button type="button" className="mon-empty" onClick={() => setSheet({ kind: 'newJar' })}>
                <Icon name="money" size={22} /><b>Make your first jar</b><small>Food, Transport, School. Give each a monthly limit.</small>
              </button>
            )}
          </section>

          <section className="mon-card" aria-label="Activity">
            <header className="mon-card-head">
              <div>
                <h2>Activity</h2>
                <p>{txns.length ? 'Tap a row to change it. Hold for more.' : 'Nothing logged yet. The pad above is the fastest way in.'}</p>
              </div>
              {filtered && (
                <button type="button" className="mon-filter" onClick={() => { setPickedCat(null); setPickedDay(null); }} aria-label="Clear the filter">
                  {pickedCat ?? dayLabel(pickedDay!)}<Icon name="close" size={12} />
                </button>
              )}
            </header>
            {byDay.length === 0 && filtered && <p className="mon-muted">Nothing matches that filter.</p>}
            {byDay.map((g) => (
              <div key={g.day} className="mon-day">
                <h3>{dayLabel(g.day)}<small>{g.out ? `${peso(g.out)} out` : ''}{g.in ? `${g.out ? ' · ' : ''}${peso(g.in)} in` : ''}</small></h3>
                <ul className="mon-rows">
                  {g.rows.map((t) => {
                    const income = t.amount_centavos < 0;
                    const account = accounts.find((a) => a.id === t.account_id)?.name;
                    return (
                      <li key={t.id}>
                        <button type="button" className="mon-row" onClick={tap(() => setSheet({ kind: 'txn', id: t.id }))} {...hold('txn', t.id, t.name)}
                          style={{ '--c': income ? '#2fdca6' : colourOf(t.category) } as React.CSSProperties}>
                          <span className="mon-row-mark" aria-hidden="true"><Icon name={income ? 'download' : 'money'} size={15} /></span>
                          <span className="mon-row-copy">
                            <b>{t.name}{t.detailed === false && <em>Add details</em>}</b>
                            <small>{[t.category, account, t.place, new Date(t.occurred_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !prefs.time24 })].filter(Boolean).join(' · ')}</small>
                          </span>
                          <span className={'mon-row-amount' + (income ? ' is-in' : '')}>{income ? '+' : '−'}{peso(Math.abs(t.amount_centavos))}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {ledger.length > shown && <button type="button" className="mon-more" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, ledger.length - shown)} more</button>}
          </section>

          <section className="mon-card" aria-label="Patterns">
            <header className="mon-card-head">
              <div>
                <h2>{view === 'categories' ? 'Where it went' : view === 'trend' ? 'Last 30 days' : 'Spending calendar'}</h2>
                <p>{view === 'categories' ? 'This month by jar. Tap one to filter Activity.' : view === 'trend' ? `${peso(trend.reduce((s, d) => s + d.total, 0))} out in 30 days` : 'Tap a day to see what happened.'}</p>
              </div>
              <div className="mon-seg" role="radiogroup" aria-label="Chart">
                <button type="button" role="radio" aria-checked={view === 'categories'} onClick={() => setView('categories')}>Jars</button>
                <button type="button" role="radio" aria-checked={view === 'trend'} onClick={() => setView('trend')}>30 days</button>
                <button type="button" role="radio" aria-checked={view === 'calendar'} onClick={() => setView('calendar')}>Calendar</button>
              </div>
            </header>
            {view === 'categories' && (spend.length
              ? <Stacks spend={spend} active={pickedCat} onPick={(c) => { setPickedCat(c === pickedCat ? null : c); setPickedDay(null); }} />
              : <p className="mon-muted">Nothing spent this month yet.</p>)}
            {view === 'trend' && <SpendTrend series={trend} hue="#2fdca6" />}
            {view === 'calendar' && <MonthHeatmap days={grid} hue="#2fdca6" selected={pickedDay} weekStart={prefs.weekStart} onPick={(d) => { setPickedDay(d); setPickedCat(null); }} />}
          </section>
        </div>

        <aside className="mon-side">
          <section className="mon-card" aria-label="Coming up">
            <header className="mon-card-head"><div><h2>Coming up</h2><p>Charges and goals, soonest first.</p></div></header>
            <ComingUp items={upcoming} onOpen={(u) => setSheet(u.kind === 'goal' ? { kind: 'goal', id: u.id } : { kind: 'sub', id: u.id })} />
          </section>

          <section className="mon-card" aria-label="Goals">
            <header className="mon-card-head">
              <div><h2>Goals</h2><p>{goals.length ? `${peso(goals.reduce((s, g) => s + g.saved_centavos, 0))} saved so far` : 'Something you are saving toward.'}</p></div>
              <button type="button" className="mon-link" onClick={() => setSheet({ kind: 'goal', id: null })}><Icon name="plus" size={14} />Add</button>
            </header>
            <ul className="mon-list">
              {goals.map((g) => {
                const pct = Math.min(100, Math.round((g.saved_centavos / Math.max(1, g.target_centavos)) * 100));
                return (
                  <li key={g.id} className="mon-goal" {...hold('goal', g.id, g.name)}>
                    <button type="button" className="mon-goal-main" onClick={tap(() => setSheet({ kind: 'goal', id: g.id }))}>
                      <b>{g.name}</b>
                      <small>{peso(g.saved_centavos)} of {peso(g.target_centavos)}{g.due_on ? ` · by ${new Date(`${g.due_on.slice(0, 10)}T12:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : ''}</small>
                      <AsciiBar value={pct} hue={pct >= 100 ? '#2fdca6' : '#7c6cff'} showValue={false} shape="slim" label={`${g.name}, ${pct}% saved`} />
                    </button>
                    <button type="button" className="mon-pill" disabled={pct >= 100}
                      onClick={() => { GA.edit.mutate({ id: g.id, patch: { saved_centavos: g.saved_centavos + 50000 } }); toast(`₱500 added to ${g.name}`, () => GA.edit.mutate({ id: g.id, patch: { saved_centavos: g.saved_centavos } })); }}>
                      {pct >= 100 ? 'Reached' : '+₱500'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="mon-card" aria-label="Subscriptions">
            <header className="mon-card-head">
              <div><h2>Subscriptions</h2><p>{subs.length ? `${peso(subsTotal)} a month` : 'Charges that happen whether you look or not.'}</p></div>
              <button type="button" className="mon-link" onClick={() => setSheet({ kind: 'sub', id: null })}><Icon name="plus" size={14} />Add</button>
            </header>
            <ul className="mon-list">
              {subs.map((s) => (
                <li key={s.id} className="mon-line" {...hold('sub', s.id, s.name)}>
                  <button type="button" onClick={tap(() => setSheet({ kind: 'sub', id: s.id }))}>
                    <b>{s.name}</b>
                    <small>{s.next_charge ? `Next on ${new Date(`${s.next_charge.slice(0, 10)}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'No date set'}</small>
                  </button>
                  <em>{peso(s.amount_centavos)}</em>
                  <button type="button" className="mon-pill" onClick={() => logCharge(s)}>Log</button>
                </li>
              ))}
            </ul>
          </section>

          <section className="mon-card" aria-label="To buy">
            <header className="mon-card-head">
              <div><h2>To buy</h2><p>{toBuy.length ? `${peso(toBuy.reduce((s, b) => s + b.amount_centavos, 0))} planned` : 'Things to buy soon, so they are not a surprise.'}</p></div>
              <button type="button" className="mon-link" onClick={() => setSheet({ kind: 'buy', id: null })}><Icon name="plus" size={14} />Add</button>
            </header>
            <ul className="mon-list">
              {toBuy.map((b) => (
                <li key={b.id} className="mon-line" {...hold('buy', b.id, b.name)}>
                  <button type="button" onClick={tap(() => setSheet({ kind: 'buy', id: b.id }))}><b>{b.name}</b><small>Roughly {peso(b.amount_centavos)}</small></button>
                  <button type="button" className="mon-pill" onClick={() => bought(b)}>Bought</button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {sheet?.kind === 'log' && (
        <LogSheet amount={pad * 100} kind={kind} jar={armed?.category ?? null} categories={jars.map((j) => j.category)} accounts={accounts}
          onClose={() => setSheet(null)} onSave={commit} />
      )}
      {txnOpen && (
        <TxnSheet txn={txnOpen} categories={categories} accounts={accounts} onClose={() => setSheet(null)}
          onSave={(patch) => { A.editTxn.mutate({ id: txnOpen.id, patch }); toast('Saved', undefined, { tone: 'success', icon: 'check' }); }}
          onDelete={() => A.removeWithUndo(txnOpen)} />
      )}
      {jarOpen && (
        <JarSheet jar={jarOpen} txns={txns} onClose={() => setSheet(null)}
          onAim={() => { setKind('expense'); setJarId(jarOpen.id); document.querySelector('.mon-pad input')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }}
          onOpenTxn={(t) => setSheet({ kind: 'txn', id: t.id })}
          onSave={(patch) => { BA.edit.mutate({ id: jarOpen.id, patch }); toast('Jar saved', undefined, { tone: 'success', icon: 'check' }); }}
          onDelete={() => { const b = budgets.find((x) => x.id === jarOpen.id); if (b) BA.removeWithUndo(b, b.category); if (jarId === jarOpen.id) setJarId(null); }} />
      )}
      {sheet?.kind === 'newJar' && (
        <FormSheet title="New jar" sub="A monthly limit you can log straight into." submitLabel="Add jar" onClose={() => setSheet(null)}
          fields={[{ key: 'category', label: 'Name', kind: 'text', placeholder: 'Food' }, { key: 'amount', label: 'Monthly limit', kind: 'money', placeholder: '6000' }]}
          onSubmit={(v) => { const id = crypto.randomUUID(); BA.add.mutate({ id, category: v.category.trim(), amount_centavos: toCentavos(v.amount), period: 'monthly' }); setJarId(id); toast(`${v.category.trim()} jar added`, undefined, { tone: 'success', icon: 'money' }); }} />
      )}
      {sheet?.kind === 'goal' && (
        <FormSheet title={goalOpen ? 'Edit goal' : 'New goal'} submitLabel={goalOpen ? 'Save goal' : 'Add goal'} onClose={() => setSheet(null)}
          fields={[{ key: 'name', label: 'Goal', kind: 'text', placeholder: 'New laptop' }, { key: 'target', label: 'Target', kind: 'money', placeholder: '45000' }, ...(goalOpen ? [{ key: 'saved', label: 'Saved so far', kind: 'money' as const, optional: true }] : []), { key: 'due', label: 'By', kind: 'date' }]}
          initial={goalOpen ? { name: goalOpen.name, target: fromCentavos(goalOpen.target_centavos), saved: fromCentavos(goalOpen.saved_centavos), due: goalOpen.due_on?.slice(0, 10) ?? '' } : {}}
          onDelete={goalOpen ? () => GA.removeWithUndo(goalOpen, goalOpen.name) : undefined}
          onSubmit={(v) => {
            if (goalOpen) GA.edit.mutate({ id: goalOpen.id, patch: { name: v.name.trim(), target_centavos: toCentavos(v.target), saved_centavos: toCentavos(v.saved), due_on: v.due || null } });
            else GA.add.mutate({ id: crypto.randomUUID(), name: v.name.trim(), target_centavos: toCentavos(v.target), saved_centavos: 0, due_on: v.due || null });
            toast(goalOpen ? 'Goal saved' : `${v.name.trim()} added`, undefined, { tone: 'success', icon: 'target' });
          }} />
      )}
      {sheet?.kind === 'sub' && (
        <FormSheet title={subOpen ? 'Edit subscription' : 'New subscription'} submitLabel={subOpen ? 'Save' : 'Add subscription'} onClose={() => setSheet(null)}
          fields={[{ key: 'name', label: 'Service', kind: 'text', placeholder: 'Spotify' }, { key: 'amount', label: 'Amount a month', kind: 'money', placeholder: '149' }, { key: 'next', label: 'Next charge', kind: 'date' }]}
          initial={subOpen ? { name: subOpen.name, amount: fromCentavos(subOpen.amount_centavos), next: subOpen.next_charge?.slice(0, 10) ?? '' } : {}}
          onDelete={subOpen ? () => SA.removeWithUndo(subOpen, subOpen.name) : undefined}
          onSubmit={(v) => {
            if (subOpen) SA.edit.mutate({ id: subOpen.id, patch: { name: v.name.trim(), amount_centavos: toCentavos(v.amount), next_charge: v.next || null } });
            else SA.add.mutate({ id: crypto.randomUUID(), name: v.name.trim(), amount_centavos: toCentavos(v.amount), next_charge: v.next || null, period: 'monthly' });
            toast(subOpen ? 'Subscription saved' : `${v.name.trim()} added`, undefined, { tone: 'success', icon: 'refresh' });
          }} />
      )}
      {sheet?.kind === 'buy' && (
        <FormSheet title={buyOpen ? 'Edit item' : 'Add to buy'} submitLabel={buyOpen ? 'Save' : 'Add to list'} onClose={() => setSheet(null)}
          fields={[{ key: 'name', label: 'Item', kind: 'text', placeholder: 'Notebook and pens' }, { key: 'amount', label: 'Roughly', kind: 'money', placeholder: '180' }]}
          initial={buyOpen ? { name: buyOpen.name, amount: fromCentavos(buyOpen.amount_centavos) } : {}}
          onDelete={buyOpen ? () => BuyA.removeWithUndo(buyOpen, buyOpen.name) : undefined}
          onSubmit={(v) => {
            if (buyOpen) BuyA.edit.mutate({ id: buyOpen.id, patch: { name: v.name.trim(), amount_centavos: toCentavos(v.amount) } });
            else BuyA.add.mutate({ id: crypto.randomUUID(), name: v.name.trim(), amount_centavos: toCentavos(v.amount), bought_at: null });
            toast(buyOpen ? 'Item saved' : `${v.name.trim()} added`, undefined, { tone: 'success', icon: 'check' });
          }} />
      )}

      {lp.ctx && open && (
        <ContextMenu x={lp.ctx.x} y={lp.ctx.y} kind="fab" label={open.label} items={open.groups} onClose={lp.close} />
      )}
    </div>
  );
}
