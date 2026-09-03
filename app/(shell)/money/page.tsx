'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useLayout } from '@/lib/useLayout';
import { Icon } from '@/components/Icon';
import { MoneySkeleton } from '@/components/Skeleton';
import { PAL } from '@/lib/pal';
import { usePrefs } from '@/lib/prefs';
import {
  useTransactions, useAccounts, useBudgets, useToBuy, useMoneyActions,
  useGoals, useSubs, useBudgetActions, useGoalActions, useSubActions, useBuyActions,
  peso, verifyPin, lockedSections, type Txn,
} from '@/lib/money';
import { InlineForm, AddButton, RowActions, toCentavos, fromCentavos } from '@/components/MoneyRows';
import { ContextMenu, type CtxGroup } from '@/components/ContextMenu';
import { useLongPress } from '@/lib/useLongPress';
import {
  Stacks, SpendTrend, MonthHeatmap, ComingUp, toUpcoming, Insight, Empty, colourOf,
} from '@/components/money/Instruments';
import { Jar, type JarRow } from '@/components/money/Jars';
const JarPage = dynamic(() => import('@/components/money/JarPage').then((m) => m.JarPage), { ssr: false });
import { MoneyPad } from '@/components/money/MoneyPad';
const LogSheet = dynamic(() => import('@/components/money/LogSheet').then((m) => m.LogSheet), { ssr: false });
import { logDay } from '@/lib/logday';
import {
  balanceOf, burnPerDay, runwayDays, runwayFill, byCategory, monthStart,
  dailySpend, monthSpend, noSpendStreak, weekDelta, localDay, outgo, incoming,
} from '@/lib/runway';

import { toast } from '@/lib/toast';
import { AsciiBar } from '@/components/AsciiBar';

/**
 * Money, as a dashboard rather than a scroll.
 *
 * Everything on this tab used to sit in one 820px column down the middle of a
 * 1400px screen: a keypad stretched to twice its natural width, a runway bar
 * the height of a caption, a category chart with two shapes in it, and five
 * hundred pixels of nothing on either side. On a phone that column is right —
 * it is the whole screen. On a desktop it was a phone screenshot with margins.
 *
 * Three columns, by the question each one answers:
 *
 *   left    what have I got, and log something — the runway, the pad, and the
 *           three comparisons that need no chart. Sticky, because logging is
 *           what the tab is opened for and it should never scroll away.
 *   centre  where is it going — jars you can aim the pad at, the month by
 *           category, thirty days of shape, and the month as a grid of days.
 *   right   what happened and what is about to — the ledger, what is already
 *           spoken for, and the list of things not yet bought.
 *
 * A phone gets the same blocks in one column, in that order, because the order
 * is the priority.
 */

const KICKER: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em',
  textTransform: 'uppercase', color: 'var(--tx3)',
};
const CARD: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--line)',
  borderRadius: 16, padding: '14px 15px',
};
const MINT = '#2FDCA6';
const SPRING = { type: 'spring' as const, stiffness: 220, damping: 25, mass: 0.7 };

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

/**
 * A titled block. Every section on the tab is one of these, which is how the
 * ledger and the goals grid stopped being the two lists with no heading over
 * them while To buy and Subscriptions had one.
 */
function Section({
  title, note, children, delay = 0,
}: {
  title: string;
  /** The right-hand caption: a count, a period, a filter, a state. */
  note?: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
}) {
  const { prefs } = usePrefs();
  return (
    <motion.section
      initial={prefs.motion ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay }}
      style={CARD}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <h2 style={{ ...KICKER, margin: 0 }}>{title}</h2>
        {note && <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--tx3)' }}>{note}</span>}
      </div>
      {children}
    </motion.section>
  );
}

function Money() {
  const { phone } = useLayout();
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

  // One editor at a time across the whole screen: `${kind}:${id}` for an edit,
  // `${kind}:new` for a create, null for none.
  const [editing, setEditing] = useState<string | null>(null);

  // The pad, and where its money is going. `armed` is the jar a single tap
  // picked; `inside` is the jar a double tap opened.
  const [pad, setPad] = useState(0);
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [armed, setArmed] = useState<string | null>(null);
  const [inside, setInside] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);

  /** The ledger's two filters. Both are set by clicking a picture, not a form. */
  const [pickedCat, setPickedCat] = useState<string | null>(null);
  const [pickedDay, setPickedDay] = useState<string | null>(null);

  /** One gesture for every row on the tab — see lib/useLongPress.ts. */
  const lp = useLongPress();

  const month = new Date().toISOString().slice(0, 7);
  const monthTx = txns.filter((t) => t.occurred_at.startsWith(month));
  const spentBy = (c: string) => monthTx.filter((t) => t.category === c).reduce((s, t) => s + outgo(t), 0);

  /* The one number the screen is for, and the pictures under it. */
  const balance = accounts.reduce(
    (sum, a) => sum + balanceOf(a.opening_centavos ?? 0, txns.filter((t) => t.account_id === a.id)),
    0,
  );
  const burn = burnPerDay(txns, 30);
  const days = runwayDays(balance, burn);
  const spend = byCategory(txns, monthStart(), Date.now());

  const trend = useMemo(() => dailySpend(txns, 30), [txns]);
  const grid = useMemo(() => monthSpend(txns), [txns]);
  const streak = noSpendStreak(trend);
  const wow = useMemo(() => weekDelta(txns), [txns]);
  const upcoming = useMemo(() => toUpcoming(subs, goals), [subs, goals]);

  const jars: JarRow[] = budgets.map((b) => ({
    id: b.id, category: b.category, budget: b.amount_centavos,
    spent: spentBy(b.category), photo_path: b.photo_path,
  }));

  /** Today by the lived day, not the calendar one — see lib/logday.ts. */
  const today = logDay(new Date());
  const todaysOut = txns.filter((t) => logDay(t.occurred_at) === today).reduce((s, t) => s + outgo(t), 0);
  const monthIn = monthTx.reduce((s, t) => s + incoming(t), 0);

  const armedJar = jars.find((j) => j.id === armed) ?? null;
  const openJar = jars.find((j) => j.id === inside) ?? null;

  /** The ledger, after whatever the charts have been asked to filter it to. */
  const ledger = txns.filter((t) =>
    (!pickedCat || t.category === pickedCat) &&
    (!pickedDay || localDay(new Date(t.occurred_at)) === pickedDay));
  const filtered = !!(pickedCat || pickedDay);

  /**
   * One place both the pad and the jar page write through.
   *
   * Expenses are stored positive and income negative — the convention the seed
   * data, the to-buy converter and lib/runway.ts all use. This wrote them the
   * other way round, so every ₱5,000 of allowance came *off* the balance and
   * *onto* the burn rate: logging income made the runway shorter.
   */
  const commit = (details: { name: string; where: string; who: string } | null) => {
    A.addTxn.mutate({
      id: crypto.randomUUID(),
      name: details?.name?.trim() || armedJar?.category || (kind === 'income' ? 'Income' : 'Expense'),
      amount_centavos: (kind === 'expense' ? 1 : -1) * pad * 100,
      category: armedJar?.category ?? (kind === 'income' ? 'Income' : 'Other'),
      account_id: accounts[0]?.id ?? null,
      place: details?.where?.trim() || null,
      who: details?.who?.trim() || null,
      detailed: details !== null,
    });
    toast(details ? `${peso(pad * 100)} logged` : `${peso(pad * 100)} logged — details later`);
    setPad(0);
  };

  /* ------------------------------------------------------------ the menus */

  /**
   * What right-click and hold offer, by what was held.
   *
   * Money was the only tab in the app with no context menu at all — every row
   * carried a pair of 28px icons that appear on hover, which is no help on a
   * phone and no discovery anywhere. Tasks, Calendar, Projects, People and
   * Notes all answer the same two gestures through this component; now so does
   * this one.
   */
  const menu = (): { label: string; groups: CtxGroup[] } | null => {
    const c = lp.ctx;
    if (!c) return null;

    if (c.kind === 'jar') {
      const j = jars.find((x) => x.id === c.id);
      if (!j) return null;
      return {
        label: j.category,
        groups: [
          { items: [
            { label: armed === j.id ? 'Stop logging here' : 'Log into this jar', icon: 'target',
              run: () => setArmed((cur) => (cur === j.id ? null : j.id)) },
            { label: 'Open jar', icon: 'expand', run: () => { setArmed(null); setInside(j.id); } },
            { label: 'Show only this category', icon: 'filter',
              run: () => { setPickedCat(j.category); setPickedDay(null); } },
          ] },
          { label: 'Jar', items: [
            { label: 'Edit name and limit', icon: 'edit', run: () => { setInside(j.id); } },
            { label: 'Raise limit by ₱500', icon: 'up',
              run: () => { BA.edit.mutate({ id: j.id, patch: { amount_centavos: j.budget + 50000 } }); toast(`${j.category} limit raised`); } },
            { label: 'Delete jar', icon: 'trash', danger: true,
              run: () => BA.removeWithUndo(budgets.find((b) => b.id === j.id)!, j.category) },
          ] },
        ],
      };
    }

    if (c.kind === 'txn') {
      const t = txns.find((x) => x.id === c.id);
      if (!t) return null;
      const income = t.amount_centavos < 0;
      return {
        label: t.name,
        groups: [
          { items: [
            { label: 'Edit', icon: 'edit', run: () => setEditing(`txn:${t.id}`) },
            { label: 'Duplicate', icon: 'copy',
              run: () => {
                A.addTxn.mutate({
                  id: crypto.randomUUID(), name: t.name, amount_centavos: t.amount_centavos,
                  category: t.category, account_id: t.account_id, detailed: t.detailed,
                });
                toast(`Copied “${t.name}”`);
              } },
            { label: income ? 'Make it an expense' : 'Make it income', icon: 'refresh',
              run: () => { A.editTxn.mutate({ id: t.id, patch: { amount_centavos: -t.amount_centavos } }); toast(income ? 'Now an expense' : 'Now income'); } },
          ] },
          { label: 'Filter', items: [
            { label: `Only ${t.category}`, icon: 'filter', run: () => { setPickedCat(t.category); setPickedDay(null); } },
            { label: 'Only this day', icon: 'day', run: () => { setPickedDay(localDay(new Date(t.occurred_at))); setPickedCat(null); } },
          ] },
          { items: [
            { label: 'Move to Archived', icon: 'archive',
              run: () => { A.editTxn.mutate({ id: t.id, patch: { category: 'Archived' } }); toast('Moved to Archived'); } },
            { label: 'Delete', icon: 'trash', danger: true, run: () => A.removeWithUndo(t) },
          ] },
        ],
      };
    }

    if (c.kind === 'goal') {
      const g = goals.find((x) => x.id === c.id);
      if (!g) return null;
      const done = g.saved_centavos >= g.target_centavos;
      return {
        label: g.name,
        groups: [
          { items: [
            { label: 'Edit goal', icon: 'edit', run: () => setEditing(`goal:${g.id}`) },
            { label: 'Add ₱500', icon: 'plus', disabled: done, hint: done ? 'Already reached' : undefined,
              run: () => GA.edit.mutate({ id: g.id, patch: { saved_centavos: g.saved_centavos + 50000 } }) },
            { label: 'Add ₱1,000', icon: 'plus', disabled: done, hint: done ? 'Already reached' : undefined,
              run: () => GA.edit.mutate({ id: g.id, patch: { saved_centavos: g.saved_centavos + 100000 } }) },
            { label: 'Mark as reached', icon: 'check', checked: done,
              run: () => GA.edit.mutate({ id: g.id, patch: { saved_centavos: g.target_centavos } }) },
          ] },
          { items: [{ label: 'Delete goal', icon: 'trash', danger: true, run: () => GA.removeWithUndo(g, g.name) }] },
        ],
      };
    }

    if (c.kind === 'sub') {
      const s = subs.find((x) => x.id === c.id);
      if (!s) return null;
      return {
        label: s.name,
        groups: [
          { items: [
            { label: 'Edit subscription', icon: 'edit', run: () => setEditing(`sub:${s.id}`) },
            { label: 'Log this month’s charge', icon: 'money',
              run: () => {
                A.addTxn.mutate({
                  id: crypto.randomUUID(), name: s.name, amount_centavos: s.amount_centavos,
                  category: 'Bills', account_id: accounts[0]?.id ?? null, detailed: true,
                });
                toast(`${peso(s.amount_centavos)} logged for ${s.name}`);
              } },
            { label: 'Push a month later', icon: 'clock', disabled: !s.next_charge,
              hint: s.next_charge ? undefined : 'No charge date set',
              run: () => {
                const d = new Date(s.next_charge!);
                d.setMonth(d.getMonth() + 1);
                SA.edit.mutate({ id: s.id, patch: { next_charge: d.toISOString().slice(0, 10) } });
                toast(`${s.name} pushed a month`);
              } },
          ] },
          { items: [{ label: 'Cancel subscription', icon: 'trash', danger: true, run: () => SA.removeWithUndo(s, s.name) }] },
        ],
      };
    }

    if (c.kind === 'buy') {
      const b = toBuy.find((x) => x.id === c.id);
      if (!b) return null;
      return {
        label: b.name,
        groups: [
          { items: [
            { label: 'Log as expense', icon: 'money', run: () => A.logBuy.mutate({ item: b, account_id: accounts[0]?.id ?? null }) },
            { label: 'Edit', icon: 'edit', run: () => setEditing(`buy:${b.id}`) },
          ] },
          { items: [{ label: 'Remove from list', icon: 'trash', danger: true, run: () => BuyA.removeWithUndo(b, b.name) }] },
        ],
      };
    }

    return null;
  };
  const open = menu();

  /** The gesture props every row on this tab spreads. */
  const rowMenu = (kindName: string, id: string, label: string) => ({
    onPointerDown: (e: React.PointerEvent) => lp.start(e, kindName, id, label),
    onContextMenu: (e: React.MouseEvent) => lp.onContextMenu(e, kindName, id, label),
  });

  /* ------------------------------------------------------------- the page */

  if (isPending) {
    return (
      <div style={{ padding: phone ? '14px 14px 24px' : '20px 24px 28px', maxWidth: 1480, marginInline: 'auto' }}>
        <MoneySkeleton />
      </div>
    );
  }

  /* A jar opened full-screen replaces the dashboard rather than sitting under
     it — it is the same tab zoomed in, not another panel to scroll past. */
  if (inside && openJar) {
    return (
      <div style={{ padding: phone ? '14px 14px 24px' : '20px 24px 28px', maxWidth: 860, marginInline: 'auto' }}>
        <JarPage
          jar={openJar}
          txns={txns}
          onBack={() => setInside(null)}
          onEdit={(patch) => { BA.edit.mutate({ id: openJar.id, patch }); toast('Jar updated'); }}
          onDelete={(t) => A.removeWithUndo(t)}
          onArchive={(t) => { A.editTxn.mutate({ id: t.id, patch: { category: 'Archived' } }); toast('Moved to Archived'); }}
          onAdd={() => { setArmed(openJar.id); setInside(null); }}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: phone ? '14px 14px 24px' : '20px 24px 28px', maxWidth: 1480, marginInline: 'auto' }}>
      <Header
        phone={phone}
        balance={balance}
        accounts={accounts.length}
        todaysOut={todaysOut}
        monthIn={monthIn}
      />

      {/* Three columns on a desktop, one on a phone. The proportions put the
          pad in a rail it fits rather than one it has to be stretched across. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: phone ? '1fr' : 'minmax(280px, 320px) minmax(0, 1.25fr) minmax(300px, 0.95fr)',
        gap: 14, alignItems: 'start', marginTop: 14,
      }}>

        {/* ------------------------------------------------- left: got & log */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 14,
          position: phone ? undefined : 'sticky', top: phone ? undefined : 14,
        }}>
          <Section title="Runway" note={burn > 0 ? `${peso(burn)} a day` : 'no burn yet'} delay={0}>
            <div data-tour="money-budget-ring">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 9 }}>
                <motion.span
                  key={days ?? 'none'}
                  initial={prefs.motion ? { opacity: 0, y: 6 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={SPRING}
                  className="num"
                  style={{
                    fontSize: 34, fontWeight: 800, letterSpacing: '-.04em', lineHeight: 1,
                    color: days !== null && days < 7 ? PAL.coral : MINT,
                  }}
                >
                  {days === null ? '—' : days}
                </motion.span>
                <span style={{ fontSize: 11, color: 'var(--tx3)' }}>
                  {days === null ? 'nothing spent yet' : `day${days === 1 ? '' : 's'} at this rate`}
                </span>
              </div>
              <AsciiBar
                value={runwayFill(days) * 100}
                hue={days !== null && days < 7 ? PAL.coral : MINT}
                text={days === null ? 'Log something to start the clock' : `${peso(balance)} left`}
                label="Runway"
              />
            </div>
          </Section>

          <motion.div
            initial={prefs.motion ? { opacity: 0, y: 12 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.05 }}
          >
            <MoneyPad
              amount={pad}
              kind={kind}
              jar={armedJar?.category ?? null}
              jarHue={armedJar ? colourOf(armedJar.category) : undefined}
              onAmount={setPad}
              onKind={setKind}
              onSubmit={() => setSheet(true)}
            />
          </motion.div>

          {/* Three comparisons. A total is already on the page; a comparison
              is the thing you cannot get by looking at one number. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            <Insight
              label="This week" icon="up" delay={0.1}
              hue={wow.pct === null ? 'var(--tx2)' : wow.pct > 0 ? PAL.coral : MINT}
              value={peso(wow.current)}
              sub={wow.pct === null ? 'no week before it' : `${wow.pct > 0 ? '+' : ''}${wow.pct}% on last week`}
            />
            <Insight
              label="No-spend" icon="flame" delay={0.14}
              hue={streak > 0 ? PAL.amber : 'var(--tx2)'}
              value={`${streak}d`}
              sub={streak === 0 ? 'spent something today' : 'days in a row'}
            />
            <Insight
              label="Biggest jar" icon="target" delay={0.18}
              hue={spend[0] ? colourOf(spend[0].category) : 'var(--tx2)'}
              value={spend[0] ? peso(spend[0].total) : '—'}
              sub={spend[0]?.category ?? 'nothing this month'}
            />
          </div>
        </div>

        {/* --------------------------------------------- centre: where it goes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Section
            title="Jars"
            note={
              <span style={{ color: armedJar ? MINT : 'var(--tx3)', fontWeight: armedJar ? 700 : 400 }}>
                {armedJar ? `Logging into ${armedJar.category}` : 'Tap to aim · twice to open'}
              </span>
            }
            delay={0.04}
          >
            {jars.length === 0 && editing !== 'budget:new' ? (
              <Empty icon="money" line="No jars yet." sub="A jar is a monthly limit you can log straight into." />
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: phone ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 10,
              }}>
                {jars.map((j, i) => (
                  <Jar
                    key={j.id}
                    jar={j}
                    index={i}
                    armed={armed === j.id}
                    onArm={() => setArmed((cur) => (cur === j.id ? null : j.id))}
                    onOpen={() => { setArmed(null); setInside(j.id); }}
                    onHold={(e) => lp.start(e, 'jar', j.id, j.category)}
                    onMenu={(e) => lp.onContextMenu(e, 'jar', j.id, j.category)}
                  />
                ))}
              </div>
            )}

            {editing === 'budget:new' ? (
              <div style={{ marginTop: 11 }}>
                <InlineForm
                  fields={[
                    { key: 'category', label: 'Name', kind: 'text', placeholder: 'Food' },
                    { key: 'amount', label: 'Monthly limit', kind: 'money', placeholder: '6000' },
                  ]}
                  submitLabel="Add jar"
                  onCancel={() => setEditing(null)}
                  onSubmit={(v) => {
                    BA.add.mutate({
                      id: crypto.randomUUID(), category: v.category,
                      amount_centavos: toCentavos(v.amount), period: 'monthly',
                    });
                    setEditing(null);
                    toast(`${v.category} jar added`);
                  }} />
              </div>
            ) : (
              <AddButton label="Add a jar" onClick={() => setEditing('budget:new')} />
            )}
          </Section>

          <Section
            title="Where it went"
            note={pickedCat ? <FilterPill label={pickedCat} onClear={() => setPickedCat(null)} /> : 'this month'}
            delay={0.08}
          >
            <Stacks spend={spend} active={pickedCat} onPick={(c) => { setPickedCat(c === pickedCat ? null : c); setPickedDay(null); }} />
          </Section>

          <Section title="Last 30 days" note={`${peso(trend.reduce((s, d) => s + d.total, 0))} out`} delay={0.12}>
            <SpendTrend series={trend} hue={MINT} />
          </Section>

          <Section
            title="Spending calendar"
            note={pickedDay
              ? <FilterPill label={new Date(pickedDay + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} onClear={() => setPickedDay(null)} />
              : new Date().toLocaleDateString(undefined, { month: 'long' })}
            delay={0.16}
          >
            <MonthHeatmap
              days={grid}
              hue={MINT}
              selected={pickedDay}
              weekStart={prefs.weekStart}
              onPick={(d) => { setPickedDay(d); setPickedCat(null); }}
            />
          </Section>
        </div>

        {/* ------------------------------------- right: happened & about to */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Section
            title="Activity"
            note={filtered
              ? <FilterPill label={`${ledger.length} shown`} onClear={() => { setPickedCat(null); setPickedDay(null); }} />
              : `${txns.length} logged`}
            delay={0.06}
          >
            {ledger.length === 0 && (
              <Empty
                icon="money"
                line={filtered ? 'Nothing matches that filter.' : 'Nothing logged yet.'}
                sub={filtered ? 'Clear it to see everything.' : 'The pad on the left is the fastest way in.'} />
            )}

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <AnimatePresence initial={false}>
                {ledger.slice(0, 40).map((t, i) => (
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
                    <TxnRow key={t.id} t={t} index={i}
                      account={accounts.find((a) => a.id === t.account_id)?.name}
                      gestures={rowMenu('txn', t.id, t.name)}
                      onEdit={() => setEditing(`txn:${t.id}`)}
                      onDelete={() => A.removeWithUndo(t)} />
                  )
                ))}
              </AnimatePresence>
            </div>

            {ledger.length > 40 && (
              <p style={{ fontSize: 10.5, color: 'var(--tx3)', margin: '10px 0 0', textAlign: 'center' }}>
                Showing the newest 40 of {ledger.length}.
              </p>
            )}
          </Section>

          <Section title="Coming up" note={`${upcoming.length} scheduled`} delay={0.1}>
            <ComingUp
              items={upcoming}
              onOpen={(u) => setEditing(`${u.kind === 'goal' ? 'goal' : 'sub'}:${u.id}`)} />
          </Section>

          {/* Goals and subscriptions still get their own editors — the strip
              above shows them, this is where they are made and changed. */}
          <Section title="Goals" note={`${goals.length}`} delay={0.14}>
            {goals.length === 0 && editing !== 'goal:new' && (
              <Empty icon="target" line="No goals yet." sub="Something you are saving towards." />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {goals.map((g) => {
                const p = Math.min(100, Math.round((g.saved_centavos / Math.max(1, g.target_centavos)) * 100));
                if (editing === `goal:${g.id}`) {
                  return (
                    <InlineForm key={g.id}
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
                  );
                }
                return (
                  <div key={g.id} className="blk" {...rowMenu('goal', g.id, g.name)}
                    style={{ padding: '10px 11px', borderRadius: 12, background: 'var(--card2)', border: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{g.name}</span>
                      <span className="num" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700 }}>{peso(g.saved_centavos)}</span>
                      <span className="num" style={{ fontSize: 10, color: 'var(--tx3)' }}>of {peso(g.target_centavos)}</span>
                    </div>
                    <div style={{ margin: '8px 0 6px' }}>
                      <AsciiBar shape="slim" value={p} hue={p >= 70 ? MINT : PAL.indigo} label={`${g.name} saved`} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, color: 'var(--tx3)' }}>
                        {g.due_on ? `by ${new Date(g.due_on).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : 'no deadline'}
                      </span>
                      <button onClick={() => GA.edit.mutate({ id: g.id, patch: { saved_centavos: g.saved_centavos + 50000 } })}
                        className="hov k-squish"
                        style={{ marginLeft: 'auto', minHeight: 30, padding: '0 11px', borderRadius: 8, border: '1px solid var(--line2)', fontSize: 10.5, fontWeight: 700, color: 'var(--tx2)' }}>
                        + ₱500
                      </button>
                      <RowActions label={g.name} onEdit={() => setEditing(`goal:${g.id}`)}
                        onDelete={() => GA.removeWithUndo(g, g.name)} />
                    </div>
                  </div>
                );
              })}
            </div>

            {editing === 'goal:new' ? (
              <div style={{ marginTop: 10 }}>
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
              <AddButton label="Add a goal" onClick={() => setEditing('goal:new')} />
            )}
          </Section>

          <Section title="Subscriptions"
            note={subs.length ? `${peso(subs.reduce((s, x) => s + x.amount_centavos, 0))} a month` : 'none'}
            delay={0.18}>
            {subs.length === 0 && editing !== 'sub:new' && (
              <Empty icon="refresh" line="No subscriptions." sub="Charges that happen whether you look or not." />
            )}
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
                <div key={sub.id} className="blk" {...rowMenu('sub', sub.id, sub.name)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderBottom: i < subs.length - 1 ? '1px solid var(--line)' : undefined }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub.name}</div>
                    <div className="num" style={{ fontSize: 9.5, color: 'var(--tx3)', marginTop: 1 }}>
                      {sub.next_charge ? `next ${new Date(sub.next_charge).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'no date set'}
                    </div>
                  </div>
                  <div className="num" style={{ fontSize: 12.5, fontWeight: 700 }}>{peso(sub.amount_centavos)}</div>
                  <RowActions label={sub.name} onEdit={() => setEditing(`sub:${sub.id}`)}
                    onDelete={() => SA.removeWithUndo(sub, sub.name)} />
                </div>
              )
            ))}

            {editing === 'sub:new' ? (
              <div style={{ marginTop: 10 }}>
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
              </div>
            ) : (
              <AddButton label="Add a subscription" onClick={() => setEditing('sub:new')} />
            )}
          </Section>

          {/* The to-buy list is only a transaction that has not happened yet,
              so it belongs beside the ones that have. */}
          <Section title="To buy" note={toBuy.length ? `${peso(toBuy.reduce((s, b) => s + b.amount_centavos, 0))} pending` : 'clear'} delay={0.22}>
            {toBuy.length === 0 && editing !== 'buy:new' && (
              <Empty icon="check" line="Nothing on the list." sub="Everything here has been logged." />
            )}
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
                <div key={b.id} className="blk" {...rowMenu('buy', b.id, b.name)}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 4px', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                  <div className="num" style={{ fontSize: 12.5, fontWeight: 700 }}>{peso(b.amount_centavos)}</div>
                  <button onClick={() => A.logBuy.mutate({ item: b, account_id: accounts[0]?.id ?? null })} className="acc k-squish"
                    style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--acc)', color: '#0C0F16', fontSize: 10.5, fontWeight: 800, minHeight: 30, flex: 'none' }}>
                    Log
                  </button>
                  <RowActions label={b.name} onEdit={() => setEditing(`buy:${b.id}`)}
                    onDelete={() => BuyA.removeWithUndo(b, b.name)} />
                </div>
              )
            ))}

            {editing === 'buy:new' ? (
              <div style={{ marginTop: 10 }}>
                <InlineForm
                  fields={[{ key: 'name', label: 'Item', kind: 'text', placeholder: 'Notebook + pens' }, { key: 'amount', label: 'Roughly', kind: 'money', placeholder: '180' }]}
                  submitLabel="Add to list"
                  onCancel={() => setEditing(null)}
                  onSubmit={(v) => {
                    BuyA.add.mutate({ id: crypto.randomUUID(), name: v.name, amount_centavos: toCentavos(v.amount), bought_at: null });
                    setEditing(null);
                    toast(`${v.name} added`);
                  }} />
              </div>
            ) : (
              <AddButton label="Add something to buy" onClick={() => setEditing('buy:new')} />
            )}
          </Section>
        </div>
      </div>

      {sheet && (
        <LogSheet
          amount={pad * 100}
          kind={kind}
          jar={armedJar?.category ?? null}
          onClose={() => setSheet(false)}
          onSave={(d) => commit(d)}
        />
      )}

      {lp.ctx && open && (
        <ContextMenu
          x={lp.ctx.x} y={lp.ctx.y} kind="fab"
          label={open.label}
          items={open.groups}
          accent={prefs.accent}
          dark={prefs.theme === 'dark'}
          onClose={lp.close}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

/**
 * The one number the tab is for, and the two that qualify it.
 *
 * The balance was 11px grey text under an 11px grey heading. It is the answer
 * to "can I", which is the question, so it is the biggest thing on the screen.
 */
function Header({
  phone, balance, accounts, todaysOut, monthIn,
}: { phone: boolean; balance: number; accounts: number; todaysOut: number; monthIn: number }) {
  const { prefs } = usePrefs();
  return (
    <motion.header
      initial={prefs.motion ? { opacity: 0, y: -8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}
    >
      <div>
        <h1 style={{ ...KICKER, margin: 0 }}>Money</h1>
        <div className="num" style={{
          fontSize: phone ? 30 : 38, fontWeight: 800, letterSpacing: '-.045em', lineHeight: 1.05, marginTop: 4,
        }}>
          {peso(balance)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 3 }}>
          across {accounts} account{accounts === 1 ? '' : 's'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginLeft: phone ? 0 : 'auto', paddingBottom: 3 }}>
        <Stat label="Out today" value={peso(todaysOut)} hue={todaysOut > 0 ? PAL.coral : 'var(--tx2)'} />
        <Stat label="In this month" value={peso(monthIn)} hue={monthIn > 0 ? MINT : 'var(--tx2)'} />
      </div>
    </motion.header>
  );
}

function Stat({ label, value, hue }: { label: string; value: string; hue: string }) {
  return (
    <div>
      <div style={{ ...KICKER, fontSize: 8.5 }}>{label}</div>
      <div className="num" style={{ fontSize: 16, fontWeight: 800, color: hue, marginTop: 3 }}>{value}</div>
    </div>
  );
}

/** What a chart click did to the ledger, and the way back out of it. */
function FilterPill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button onClick={onClear} className="k-squish"
      aria-label={`Clear the ${label} filter`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 5px 3px 9px', borderRadius: 999,
        background: 'color-mix(in srgb, var(--acc) 16%, transparent)',
        border: '1px solid color-mix(in srgb, var(--acc) 42%, transparent)',
        color: 'var(--accTx, var(--tx))', fontSize: 10, fontWeight: 700, cursor: 'pointer',
      }}>
      {label}
      <Icon name="close" size={11} color="currentColor" />
    </button>
  );
}

/** One line of the ledger. Income is green and signed; spending is not. */
function TxnRow({
  t, index, account, gestures, onEdit, onDelete,
}: {
  t: Txn; index: number; account?: string;
  gestures: { onPointerDown: (e: React.PointerEvent) => void; onContextMenu: (e: React.MouseEvent) => void };
  onEdit: () => void; onDelete: () => void;
}) {
  const { prefs } = usePrefs();
  const income = t.amount_centavos < 0;

  return (
    <motion.div
      className="blk"
      {...gestures}
      layout={prefs.motion}
      initial={prefs.motion ? { opacity: 0, x: 12 } : false}
      animate={{ opacity: 1, x: 0 }}
      exit={prefs.motion ? { opacity: 0, x: -12, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0 } : undefined}
      transition={{ ...SPRING, delay: Math.min(index, 12) * 0.02 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px',
        borderBottom: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden',
      }}
    >
      <span aria-hidden style={{
        width: 6, height: 6, borderRadius: 2, flex: 'none',
        background: income ? MINT : colourOf(t.category),
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
          {t.detailed === false && (
            <span className="num" style={{
              fontSize: 7, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
              padding: '2px 4px', borderRadius: 3, flex: 'none',
              background: 'color-mix(in srgb, #FFC24B 18%, transparent)', color: '#FFC24B',
            }}>Lazy</span>
          )}
        </div>
        <div className="num" style={{ fontSize: 9.5, color: 'var(--tx3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {t.category} · {account ?? '—'} · {new Date(t.occurred_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </div>
      </div>
      <div className="num" style={{ fontSize: 12.5, fontWeight: 700, flex: 'none', color: income ? MINT : 'var(--tx)' }}>
        {income ? '+' : ''}{peso(Math.abs(t.amount_centavos))}
      </div>
      <RowActions label={t.name} onEdit={onEdit} onDelete={onDelete} />
    </motion.div>
  );
}
