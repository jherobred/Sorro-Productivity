'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { useLayout } from '@/lib/useLayout';
import { JournalPhotos } from './JournalPhotos';
import { JournalWindow } from './JournalWindow';
import {
  useJournalDates, useJournalMonth, useOnThisDay, useJournalActions,
  MOODS, moodColor, ymd, fromYmd, monthOf, monthGrid, shiftMonth, heat, words, streaks,
  type Entry,
} from '@/lib/journal';

/**
 * The journal, as chosen: the Almanac's month heat map and "on this day" rail,
 * wrapped around the Spread's two-leaf page.
 *
 * The rail answers *when* — a month at a glance, tinted by how much was
 * written, with the same day in past years underneath it. The spread answers
 * *what* — the day's photos pinned on the left leaf, ruled paper and a serif on
 * the right. Writing is the only thing on the page that is full width.
 *
 * On a phone the two leaves stack and the rail collapses to the month grid,
 * because the writing surface is what the fold is for.
 */

const SERIF = 'Georgia, "Times New Roman", "Iowan Old Style", serif';
const LINE_H = 26;

const CARD: React.CSSProperties = { background: 'var(--card)', borderRadius: 14, boxShadow: 'var(--sh)' };
const KICKER: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)',
};

export function Journal() {
  const { phone } = useLayout();
  const today = ymd(new Date());
  const [sel, setSel] = useState(today);
  const [ym, setYm] = useState(monthOf(today));

  const { data: dates = [] } = useJournalDates();
  const { data: month = [], isSuccess } = useJournalMonth(ym);
  const { data: past = [] } = useOnThisDay(sel, dates);
  const A = useJournalActions(ym);

  const entry = month.find((e) => e.entry_date === sel) ?? null;
  const run = useMemo(() => streaks(dates), [dates]);

  /* ------------------------------------------------------------- the page */

  const [text, setText] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const loaded = useRef<string | null>(null);

  // Adopt the server's copy once per day opened, and never while there is
  // unsaved typing — that is how a refetch used to eat a sentence.
  useEffect(() => {
    if (loaded.current === sel) return;
    if (!isSuccess && !entry) return;
    loaded.current = sel;
    setText(entry?.text ?? '');
    setMood(entry?.mood ?? null);
    setDirty(false);
  }, [sel, entry, isSuccess]);

  const timer = useRef<number>(0);
  const latest = useRef<{ text: string; mood: string | null } | null>(null);
  const saveRef = useRef(A.save);
  saveRef.current = A.save;

  const queue = useCallback((t: string, m: string | null) => {
    latest.current = { text: t, mood: m };
    setDirty(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const v = latest.current;
      latest.current = null;
      if (v) { saveRef.current.mutate({ entry_date: sel, ...v }); setDirty(false); }
    }, 700);
  }, [sel]);

  // Leaving the day flushes it. Keyed on the date, with the mutation read
  // through a ref, so this cleanup does not fire on every keystroke.
  useEffect(() => {
    const day = sel;
    return () => {
      clearTimeout(timer.current);
      const v = latest.current;
      latest.current = null;
      if (v) saveRef.current.mutate({ entry_date: day, ...v });
    };
  }, [sel]);

  const write = (t: string) => { setText(t); queue(t, mood); };
  const setDayMood = (m: string | null) => { setMood(m); queue(text, m); };

  const step = (by: number) => {
    const next = ymd(new Date(fromYmd(sel).getTime() + by * 86400000));
    setSel(next);
    setYm(monthOf(next));
  };

  const jump = (date: string) => { setSel(date); setYm(monthOf(date)); };

  /* --------------------------------------------------------------- render */

  const rail = (
    <>
      <JournalWindow />
      <MonthCard ym={ym} sel={sel} today={today} month={month} onPick={jump}
        onShift={(by) => setYm(shiftMonth(ym, by))} />
      <div style={{ ...CARD, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--acc)' }}>
            {run.current}
          </div>
          <div style={KICKER}>day streak</div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx2)' }}>{run.best}</div>
          <div style={KICKER}>best</div>
        </div>
      </div>
      <OnThisDay entries={past} onPick={jump} />
    </>
  );

  const dateLong = fromYmd(sel).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  const leftLeaf = (
    <div style={{
      background: 'var(--card2)', padding: phone ? 13 : 15,
      display: 'flex', flexDirection: 'column', gap: 12,
      ...(phone ? { borderRadius: '14px 14px 0 0' } : {}),
    }}>
      <div style={phone ? { display: 'flex', alignItems: 'center', gap: 12 } : undefined}>
        <div>
          <div style={{ fontFamily: SERIF, fontSize: phone ? 26 : 34, fontWeight: 700, lineHeight: 1, letterSpacing: '-.03em' }}>
            {fromYmd(sel).getDate()}
          </div>
          <div style={{ ...KICKER, marginTop: 4 }}>
            {fromYmd(sel).toLocaleDateString(undefined, { weekday: 'long' })}
            {' · '}
            {fromYmd(sel).toLocaleDateString(undefined, { month: 'long' })}
          </div>
        </div>
        {phone && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {moodChips(mood, setDayMood, true)}
          </div>
        )}
      </div>

      {!phone && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{moodChips(mood, setDayMood, false)}</div>}

      <JournalPhotos entryId={entry && !entry.id.startsWith('pending-') ? entry.id : null} entryDate={sel}
        onNeedEntry={() => A.save.mutate({ entry_date: sel, text, mood })} />

      <div style={{ marginTop: 'auto', display: 'flex', gap: 6, paddingTop: 4 }}>
        <button onClick={() => step(-1)} className="hov" style={navChip} aria-label="The day before">‹</button>
        <button onClick={() => jump(today)} className="hov" style={{ ...navChip, flex: 1 }}>Today</button>
        <button onClick={() => step(1)} className="hov" style={navChip}
          aria-label="The day after" disabled={sel >= today}>›</button>
      </div>
    </div>
  );

  const rightLeaf = (
    <div style={{
      padding: phone ? '14px 15px 20px' : '18px 22px 28px',
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <div style={{ fontFamily: SERIF, fontSize: phone ? 16 : 19, fontWeight: 600, letterSpacing: '-.01em' }}>
          {dateLong}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 10.5, color: dirty ? 'var(--accTx)' : 'var(--tx3)' }}>
          {dirty ? 'Saving…' : `${words(text)} word${words(text) === 1 ? '' : 's'}`}
        </div>
      </div>

      {/**
        * The page scrolls.
        *
        * It used to grow instead: an autosize helper set the textarea's height
        * to its own scrollHeight on every keystroke. That never worked, and
        * could not — the textarea is `flex: 1` in a column, and the flex
        * algorithm sizes a flex item, not the `height` property. So the box
        * stayed at whatever the leaf gave it (495px here, nineteen lines),
        * `overflow: hidden` cut the rest off, and no ancestor scrolled because
        * none of them ever overflowed. Everything past line nineteen was
        * written, saved, and unreachable.
        *
        * `background-attachment: local` is what keeps the ruled lines under the
        * words as they move; the default paints them on the box, so they would
        * sit still while the text slid over them.
        */}
      <textarea
        className="navsb"
        value={text}
        onChange={(e) => write(e.target.value)}
        placeholder="How was today?"
        aria-label={`Journal entry for ${dateLong}`}
        style={{
          width: '100%', flex: 1, minHeight: LINE_H * 8, resize: 'none', overflowY: 'auto',
          fontFamily: SERIF, fontSize: 13.5, lineHeight: `${LINE_H}px`, color: 'var(--tx)',
          padding: 0, background: 'transparent',
          backgroundImage: `repeating-linear-gradient(180deg, transparent 0 ${LINE_H - 1}px, var(--line) ${LINE_H - 1}px ${LINE_H}px)`,
          backgroundAttachment: 'local',
        }} />
    </div>
  );

  if (phone) {
    return (
      <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <JournalWindow />
        <MonthCard ym={ym} sel={sel} today={today} month={month} onPick={jump}
          onShift={(by) => setYm(shiftMonth(ym, by))} />
        <div style={{ ...CARD, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {leftLeaf}
          {rightLeaf}
        </div>
        <OnThisDay entries={past} onPick={jump} />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 14 }}>
      <aside className="navsb" style={{
        width: 248, flex: 'none', display: 'flex', flexDirection: 'column', gap: 10,
        overflowY: 'auto', minHeight: 0, paddingRight: 2,
      }}>
        {rail}
      </aside>

      <div className="navsb" style={{
        ...CARD, flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto',
        display: 'grid', gridTemplateColumns: '218px minmax(0, 1fr)', alignItems: 'stretch',
      }}>
        {leftLeaf}
        {rightLeaf}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function moodChips(mood: string | null, set: (m: string | null) => void, compact: boolean) {
  return MOODS.map((m) => {
    const on = mood === m.id;
    return (
      <button key={m.id} onClick={() => set(on ? null : m.id)} aria-pressed={on} className="tap"
        aria-label={`Mood: ${m.label}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: compact ? '4px 8px' : '5px 10px',
          borderRadius: 999, fontSize: 10.5, fontWeight: 700, minHeight: 28,
          border: `1px solid ${on ? m.color : 'var(--line2)'}`,
          background: on ? `color-mix(in srgb, ${m.color} 18%, transparent)` : 'transparent',
          color: on ? 'var(--tx)' : 'var(--tx3)',
        }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: m.color, flex: 'none' }} />
        {m.label}
      </button>
    );
  });
}

const HEAT = ['transparent', 22, 45, 100] as const;

function MonthCard({
  ym, sel, today, month, onPick, onShift,
}: {
  ym: string; sel: string; today: string; month: Entry[];
  onPick: (d: string) => void; onShift: (by: number) => void;
}) {
  const byDate = useMemo(() => new Map(month.map((e) => [e.entry_date, e])), [month]);
  const written = month.filter((e) => e.text.trim()).length;
  const label = fromYmd(`${ym}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div style={{ ...CARD, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={() => onShift(-1)} className="hov" aria-label="Previous month" style={arrow}>
          <Icon name="back" size={13} color="var(--tx2)" />
        </button>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '-.01em', flex: 1, textAlign: 'center' }}>{label}</div>
        <button onClick={() => onShift(1)} className="hov" aria-label="Next month" style={arrow}>
          <Icon name="chev" size={13} color="var(--tx2)" />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--tx3)', textAlign: 'center' }}>{d}</div>
        ))}
        {monthGrid(ym).map((d, i) => {
          if (!d) return <div key={`b${i}`} />;
          const e = byDate.get(d);
          const level = e ? heat(e.text) : 0;
          const on = d === sel;
          const mc = moodColor(e?.mood ?? null);
          return (
            <button key={d} onClick={() => onPick(d)} aria-current={on ? 'date' : undefined}
              aria-label={fromYmd(d).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}
              style={{
                aspectRatio: '1', borderRadius: 6, display: 'grid', placeItems: 'center',
                fontSize: 9.5, fontWeight: level === 3 ? 700 : 500,
                background: level === 0 ? 'var(--card2)' : `color-mix(in srgb, var(--acc) ${HEAT[level]}%, transparent)`,
                color: level >= 3 ? '#0C0F16' : level > 0 ? 'var(--tx)' : 'var(--tx3)',
                outline: on ? '1.5px solid var(--acc)' : d === today ? '1px dashed var(--line2)' : 'none',
                outlineOffset: 1,
                position: 'relative',
              }}>
              {fromYmd(d).getDate()}
              {mc && (
                <span aria-hidden style={{
                  position: 'absolute', bottom: 2, width: 4, height: 4, borderRadius: '50%', background: mc,
                }} />
              )}
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>
        {written} of {monthGrid(ym).filter(Boolean).length} days written
      </div>
    </div>
  );
}

function OnThisDay({ entries, onPick }: { entries: Entry[]; onPick: (d: string) => void }) {
  return (
    <div style={{ ...CARD, padding: '12px 13px' }}>
      <div style={KICKER}>On this day</div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 7 }}>
          Nothing yet. Next year this is where today shows up.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {entries.map((e) => (
            <button key={e.id} onClick={() => onPick(e.entry_date)} style={{ textAlign: 'left', width: '100%' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accTx)' }}>
                  {fromYmd(e.entry_date).getFullYear()}
                </span>
                {moodColor(e.mood) && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: moodColor(e.mood)! }} />
                )}
              </span>
              <span style={{
                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                fontFamily: SERIF, fontSize: 11.5, lineHeight: 1.55, color: 'var(--tx2)', marginTop: 2,
              }}>
                {e.text.trim() || 'Nothing written.'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const arrow: React.CSSProperties = {
  width: 26, height: 26, flex: 'none', borderRadius: 8, display: 'grid', placeItems: 'center',
};

const navChip: React.CSSProperties = {
  minHeight: 30, padding: '0 12px', borderRadius: 9, border: '1px solid var(--line2)',
  fontSize: 11, fontWeight: 700, color: 'var(--tx2)',
};
