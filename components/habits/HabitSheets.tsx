'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, ICONS, type IconName } from '@/components/Icon';
import { AsciiBar } from '@/components/AsciiBar';
import { useOverlayBack } from '@/lib/nav';
import { toast } from '@/lib/toast';
import { confirmAsk } from '@/lib/ask';
import { playCelebration } from '@/lib/audio';
import {
  HABIT_CATEGORIES, HABIT_MILESTONES, HABIT_PRESETS, logHabitEntry, useHabitLogs,
  type Habit, type HabitCategory, type HabitFrequency, type HabitKind, type HabitLog, type HabitPreset, type Tick, type TimeOfDay,
} from '@/lib/habits';
import {
  addDays, bestStreak, currentStreak, dayKey, hitRate, isDueOn, progress, scheduleLabel, ticksByDay, weekStart,
} from '@/lib/habitSchedule';
import './habitSheets.css';

export const HABIT_COLORS = ['#FF6B6B', '#FF9A3C', '#FFC24B', '#A3E635', '#34D9A0', '#38D6F2', '#345CFF', '#7C6CFF', '#B07CFF', '#FF6FA8', '#8C8C8C'];
const PICK_ICONS: IconName[] = ['check', 'book', 'drop', 'gym', 'walk', 'food', 'moon', 'sun', 'pen', 'focus', 'heart', 'money', 'flame', 'star', 'clock', 'cup', 'phone', 'mind'];
/** Names older presets saved that the icon set spells differently. */
const ICON_ALIAS: Record<string, IconName> = { droplet: 'drop', snowflake: 'spark', 'x-circle': 'close' };

export function habitIcon(h: { icon?: string; kind: HabitKind }): IconName {
  const name = h.icon ? ICON_ALIAS[h.icon] ?? h.icon : '';
  if (name && name in ICONS) return name as IconName;
  return h.kind === 'dur' ? 'clock' : h.kind === 'count' ? 'plus' : 'check';
}

/** Dark text on a light colour, white on a dark one. */
export function inkFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // 0.2 is where dark and white text are equally readable; above it dark reads better.
  return l > 0.2 ? '#1b1b1f' : '#fff';
}

const accent = (color: string) => ({ '--hs-accent': color, '--hs-ink': inkFor(color) }) as React.CSSProperties;

function Sheet({ label, color, onClose, children }: { label: string; color: string; onClose: () => void; children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="hs-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hs-sheet" role="dialog" aria-modal="true" aria-label={label} style={accent(color)}>{children}</div>
    </div>,
    document.body,
  );
}

const KINDS: { id: HabitKind; label: string; icon: IconName }[] = [
  { id: 'bin', label: 'Check off', icon: 'check' },
  { id: 'count', label: 'Count', icon: 'plus' },
  { id: 'dur', label: 'Minutes', icon: 'clock' },
];
const SCHEDULES: { id: HabitFrequency; label: string }[] = [
  { id: 'daily', label: 'Every day' },
  { id: 'weekdays', label: 'Weekdays' },
  { id: 'weekends', label: 'Weekends' },
  { id: 'weekly', label: 'Once a week' },
  { id: 'custom_days', label: 'Pick days' },
];
export const TIMES: { id: TimeOfDay; label: string; icon: IconName }[] = [
  { id: 'morning', label: 'Morning', icon: 'sun' },
  { id: 'afternoon', label: 'Afternoon', icon: 'spark' },
  { id: 'evening', label: 'Evening', icon: 'moon' },
  { id: 'anytime', label: 'Any time', icon: 'clock' },
];
/** Monday first, as the week is drawn everywhere else. Values are Date.getDay(). */
const WEEK = [[1, 'M'], [2, 'T'], [3, 'W'], [4, 'T'], [5, 'F'], [6, 'S'], [0, 'S']] as const;

export type HabitDraft = Partial<Habit> & { id: string; name: string; color: string };

/** Making a habit, or changing one. */
export function HabitEditor({ initial, onClose, onSave, onArchive }: {
  initial?: Habit | null;
  onClose: () => void;
  onSave: (h: HabitDraft) => void;
  onArchive?: () => void;
}) {
  useOverlayBack(true, onClose);
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? HABIT_COLORS[6]);
  const [icon, setIcon] = useState<IconName>(initial ? habitIcon(initial) : 'check');
  const [kind, setKind] = useState<HabitKind>(initial?.kind ?? 'bin');
  const [target, setTarget] = useState(String(initial?.kind !== 'bin' && initial?.target ? initial.target : 10));
  const [unit, setUnit] = useState(initial?.kind === 'count' ? initial.target_unit ?? 'times' : 'times');
  const [frequency, setFrequency] = useState<HabitFrequency>(initial?.frequency ?? 'daily');
  const [days, setDays] = useState<number[]>(initial?.custom_days?.length ? initial.custom_days : [1, 3, 5]);
  const [time, setTime] = useState<TimeOfDay>(initial?.time_of_day ?? 'anytime');
  const [cue, setCue] = useState(initial?.cue ?? '');
  const [category, setCategory] = useState<HabitCategory>(initial?.category ?? 'health');
  const [onHome, setOnHome] = useState(initial?.show_in_home ?? true);

  const applyPreset = (p: HabitPreset) => {
    setName(p.name); setColor(p.color); setIcon(habitIcon({ icon: p.icon, kind: p.kind })); setKind(p.kind);
    setTarget(String(p.target)); setUnit(p.kind === 'count' ? p.target_unit : 'times'); setTime(p.time_of_day);
    setCue(p.cue); setCategory(p.category);
  };

  const amount = Math.max(1, Math.round(Number(target) || 1));
  const summary = `${kind === 'bin' ? 'Check it off' : kind === 'count' ? `${amount} ${unit || 'times'}` : `${amount} minutes`} · ${scheduleLabel({ id: '', kind, target: amount, frequency, custom_days: days })} · ${TIMES.find((t) => t.id === time)!.label.toLowerCase()}`;

  const save = () => {
    const clean = name.trim();
    if (!clean) return;
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name: clean,
      short_name: initial?.short_name && initial.name === clean ? initial.short_name : clean.split(/\s+/)[0],
      show_in_home: onHome,
      color,
      icon,
      kind,
      target: kind === 'bin' ? 1 : amount,
      target_unit: kind === 'bin' ? 'day' : kind === 'dur' ? 'mins' : unit.trim() || 'times',
      frequency,
      custom_days: frequency === 'custom_days' ? days : undefined,
      time_of_day: time,
      cue: cue.trim(),
      category,
    });
  };

  return (
    <Sheet label={initial ? 'Edit habit' : 'New habit'} color={color} onClose={onClose}>
      <header className="hs-head">
        <h2>{initial ? 'Edit habit' : 'New habit'}</h2>
        <button type="button" className="hs-icon" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
      </header>

      {!initial && (
        <div className="hs-section">
          <span className="hs-label">Start from one of these</span>
          <div className="hs-presets">
            {HABIT_PRESETS.map((p) => (
              <button key={p.id} type="button" className="hs-preset" style={{ '--pc': p.color } as React.CSSProperties} onClick={() => applyPreset(p)}>
                <i><Icon name={habitIcon({ icon: p.icon, kind: p.kind })} size={16} /></i>{p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="hs-preview">
        <span><Icon name={icon} size={22} /></span>
        <div><b>{name.trim() || 'Your habit'}</b><small>{summary}</small></div>
      </div>

      <label className="hs-field">
        <span>Name</span>
        <input className="hs-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Read 20 pages" autoFocus={!initial} maxLength={60}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
      </label>

      <div className="hs-section">
        <span className="hs-label">Track it by</span>
        <div className="hs-seg" role="radiogroup" aria-label="Track it by">
          {KINDS.map((k) => (
            <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)}><Icon name={k.icon} size={15} />{k.label}</button>
          ))}
        </div>
        {kind !== 'bin' && (
          <div className="hs-row">
            <label className="hs-field">
              <span>{kind === 'dur' ? 'Minutes a day' : 'How many'}</span>
              <input className="hs-input" type="number" inputMode="numeric" min={1} value={target} onChange={(e) => setTarget(e.target.value)} />
            </label>
            {kind === 'count' && (
              <label className="hs-field">
                <span>Of what</span>
                <input className="hs-input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pages, glasses, reps" maxLength={20} />
              </label>
            )}
          </div>
        )}
      </div>

      <div className="hs-section">
        <span className="hs-label">How often</span>
        <div className="hs-chips" role="radiogroup" aria-label="How often">
          {SCHEDULES.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={frequency === s.id} onClick={() => setFrequency(s.id)}>{s.label}</button>
          ))}
        </div>
        {frequency === 'custom_days' && (
          <div className="hs-days" role="group" aria-label="Days">
            {WEEK.map(([dow, letter]) => (
              <button key={dow} type="button" aria-pressed={days.includes(dow)} aria-label={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow]}
                onClick={() => setDays((d) => (d.includes(dow) ? (d.length > 1 ? d.filter((x) => x !== dow) : d) : [...d, dow]))}>{letter}</button>
            ))}
          </div>
        )}
      </div>

      <div className="hs-section">
        <span className="hs-label">When</span>
        <div className="hs-chips" role="radiogroup" aria-label="When">
          {TIMES.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={time === t.id} onClick={() => setTime(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>

      <label className="hs-field">
        <span>Cue <em>what reminds you to do it</em></span>
        <input className="hs-input" value={cue} onChange={(e) => setCue(e.target.value)} placeholder="After I pour my morning coffee" maxLength={120} />
      </label>

      <div className="hs-section">
        <span className="hs-label">Colour</span>
        <div className="hs-swatches" role="radiogroup" aria-label="Colour">
          {HABIT_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} style={{ '--sw': c } as React.CSSProperties} onClick={() => setColor(c)} />
          ))}
        </div>
      </div>

      <div className="hs-section">
        <span className="hs-label">Icon</span>
        <div className="hs-icons" role="radiogroup" aria-label="Icon">
          {PICK_ICONS.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={icon === n} aria-label={n} onClick={() => setIcon(n)}><Icon name={n} size={18} /></button>
          ))}
        </div>
      </div>

      <div className="hs-section">
        <span className="hs-label">Category</span>
        <div className="hs-chips" role="radiogroup" aria-label="Category">
          {HABIT_CATEGORIES.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={category === c.id} onClick={() => setCategory(c.id)}>{c.label}</button>
          ))}
        </div>
      </div>

      <label className="hs-toggle">
        <input type="checkbox" checked={onHome} onChange={(e) => setOnHome(e.target.checked)} />
        Show it on the Today tab
      </label>

      <div className="hs-actions">
        {onArchive && <button type="button" className="hs-ghost is-danger" onClick={onArchive}><Icon name="archive" size={16} />Archive</button>}
        <button type="button" className="hs-save" disabled={!name.trim()} onClick={save}>{initial ? 'Save changes' : 'Create habit'}</button>
      </div>
    </Sheet>
  );
}

const MOODS: { id: NonNullable<HabitLog['mood']>; label: string }[] = [
  { id: 'fire', label: 'Great' },
  { id: 'happy', label: 'Good' },
  { id: 'neutral', label: 'Okay' },
  { id: 'tired', label: 'Tired' },
  { id: 'skull', label: 'Hard' },
];

/** One habit up close: how it is going, five weeks of days to fix, and a note for today. */
export function HabitDetail({ habit, ticks, today, frozen, onClose, onEdit, onArchive, onSetDay }: {
  habit: Habit;
  ticks: Tick[];
  today: Date;
  frozen: ReadonlySet<string>;
  onClose: () => void;
  onEdit: () => void;
  onArchive?: () => void;
  onSetDay: (date: string, done: boolean) => void;
}) {
  useOverlayBack(true, onClose);
  const logs = useHabitLogs(habit.id);
  const todayKey = dayKey(today);
  const todayLog = logs.find((l) => l.on_date === todayKey);
  const [mood, setMood] = useState<HabitLog['mood']>(todayLog?.mood);
  const [note, setNote] = useState(todayLog?.note ?? '');

  const days = useMemo(() => ticksByDay(ticks, habit.id), [ticks, habit.id]);
  const streak = currentStreak(habit, ticks, today, frozen);
  const best = bestStreak(habit, ticks, today, frozen);
  const rate = hitRate(habit, ticks, today, 30);
  const total = [...days.values()].filter((t) => progress(habit, t).done).length;
  const next = HABIT_MILESTONES.find((m) => best < m.days) ?? null;
  const weekly = habit.frequency === 'weekly';
  const unit = weekly ? 'week' : 'day';

  // Five weeks, Monday first, ending with this week.
  const first = addDays(weekStart(today), -28);
  const cells = Array.from({ length: 35 }, (_, i) => addDays(first, i));

  const saveNote = () => {
    const current = days.get(todayKey);
    logHabitEntry({ habit_id: habit.id, on_date: todayKey, value: current?.value ?? 0, note: note.trim(), mood, completed_at: new Date().toISOString() });
    toast('Note saved for today', undefined, { tone: 'success', icon: 'pen' });
  };

  return (
    <Sheet label={habit.name} color={habit.color} onClose={onClose}>
      <header className="hs-head">
        <div className="hs-hero" style={{ flex: 1 }}>
          <span><Icon name={habitIcon(habit)} size={24} /></span>
          <div>
            <h2>{habit.name}</h2>
            <p>{scheduleLabel(habit)}{habit.kind === 'count' ? ` · ${habit.target} ${habit.target_unit ?? 'times'}` : habit.kind === 'dur' ? ` · ${habit.target} minutes` : ''}{habit.cue ? ` · ${habit.cue}` : ''}</p>
          </div>
        </div>
        <button type="button" className="hs-icon" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
      </header>

      <div className="hs-stats">
        <div><b>{streak}</b><span>{unit} streak</span></div>
        <div><b>{best}</b><span>best streak</span></div>
        <div><b>{rate.due ? `${rate.pct}%` : '–'}</b><span>last 30 days</span></div>
        <div><b>{total}</b><span>times kept</span></div>
      </div>

      <div className="hs-section">
        <h3>Five weeks<small>Tap a day to fix it</small></h3>
        <div className="hs-cal">
          {WEEK.map(([dow, letter]) => <span key={dow} aria-hidden="true">{letter}</span>)}
          {cells.map((d) => {
            const key = dayKey(d);
            const p = progress(habit, days.get(key));
            const future = d > today;
            const due = weekly || isDueOn(habit, d);
            const cls = p.done ? 'is-done' : p.value > 0 ? 'is-part' : frozen.has(key) ? 'is-frozen' : !due ? 'is-off' : '';
            return (
              <button key={key} type="button" disabled={future} className={`${cls}${key === todayKey ? ' is-today' : ''}`}
                aria-label={`${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}: ${p.done ? 'kept' : p.value ? `${p.value} of ${p.target}` : due ? 'not kept' : 'not due'}`}
                aria-pressed={p.done} onClick={() => onSetDay(key, !p.done)}>
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      {next && (
        <div className="hs-section">
          <h3>Next milestone<small>{next.title}, {next.days} {unit}s in a row</small></h3>
          <AsciiBar value={(best / next.days) * 100} hue={habit.color} showValue={false} label={`${best} of ${next.days} toward ${next.title}`} />
        </div>
      )}

      <div className="hs-section">
        <h3>How did today go<small>optional</small></h3>
        <div className="hs-moods" role="radiogroup" aria-label="How it went">
          {MOODS.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={mood === m.id} onClick={() => setMood(mood === m.id ? undefined : m.id)}>{m.label}</button>
          ))}
        </div>
        <div className="hs-row">
          <input className="hs-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="A line about today" maxLength={200} aria-label="Note for today"
            onKeyDown={(e) => { if (e.key === 'Enter') saveNote(); }} />
          <button type="button" className="hs-ghost" onClick={saveNote} disabled={!note.trim() && !mood}>Save</button>
        </div>
        {logs.filter((l) => l.note || l.mood).length > 0 && (
          <ul className="hs-notes">
            {logs.filter((l) => l.note || l.mood).slice(0, 6).map((l) => (
              <li key={l.on_date}>
                <time dateTime={l.on_date}>{new Date(`${l.on_date}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time>
                {l.mood && <em>{MOODS.find((m) => m.id === l.mood)?.label}</em>}
                <span>{l.note}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="hs-actions">
        {onArchive && <button type="button" className="hs-ghost is-danger" onClick={onArchive}><Icon name="archive" size={16} />Archive</button>}
        <button type="button" className="hs-save" onClick={onEdit}><Icon name="edit" size={16} />Edit habit</button>
      </div>
    </Sheet>
  );
}

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

/**
 * A stopwatch for a minutes habit. It keeps time from timestamps, so a
 * throttled background tab still counts, and what you log adds to today.
 */
export function HabitTimer({ habit, minutesToday, onClose, onLog }: {
  habit: Habit;
  minutesToday: number;
  onClose: () => void;
  onLog: (minutes: number) => void;
}) {
  const [saved, setSaved] = useState(0);
  const [since, setSince] = useState<number | null>(() => Date.now());
  const [, redraw] = useState(0);
  const celebrated = useRef(false);
  const target = Math.max(1, habit.target ?? 1);
  const elapsed = saved + (since ? Date.now() - since : 0);
  const total = minutesToday + elapsed / 60_000;

  useEffect(() => {
    if (!since) return;
    const t = setInterval(() => redraw((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [since]);

  useEffect(() => {
    if (total >= target && minutesToday < target && !celebrated.current) {
      celebrated.current = true;
      playCelebration();
      toast(`${habit.name}: ${target} minutes reached`, undefined, { tone: 'success', icon: 'check' });
    }
  }, [total, target, minutesToday, habit.name]);

  const close = async () => {
    if (elapsed > 60_000 && !(await confirmAsk('Stop without logging?', { message: `${Math.round(elapsed / 60_000)} minutes will not be saved.`, confirmLabel: 'Stop', danger: true }))) return;
    onClose();
  };
  useOverlayBack(true, () => void close());

  const minutes = Math.max(1, Math.round(elapsed / 60_000));
  return (
    <Sheet label={`${habit.name} timer`} color={habit.color} onClose={() => void close()}>
      <header className="hs-head">
        <div className="hs-hero" style={{ flex: 1 }}>
          <span><Icon name={habitIcon(habit)} size={22} /></span>
          <div><h2>{habit.name}</h2><p>{habit.cue || `${target} minutes a day`}</p></div>
        </div>
        <button type="button" className="hs-icon" aria-label="Close timer" onClick={() => void close()}><Icon name="close" size={18} /></button>
      </header>
      <div className="hs-timer" role="timer" aria-live="off">
        <b>{clock(elapsed)}</b>
        <small>{Math.floor(total)} of {target} minutes today</small>
        <AsciiBar value={(total / target) * 100} hue={habit.color} showValue={false} label={`${Math.floor(total)} of ${target} minutes`} />
        <div className="hs-timer-row">
          <button type="button" onClick={() => setSaved((s) => s + 5 * 60_000)}>+5 min</button>
          <button type="button" onClick={() => { setSaved(0); setSince(since ? Date.now() : null); celebrated.current = false; }}>Reset</button>
        </div>
      </div>
      <div className="hs-actions">
        <button type="button" className="hs-ghost" onClick={() => {
          if (since) { setSaved(elapsed); setSince(null); } else setSince(Date.now());
        }}>
          <Icon name={since ? 'pause' : 'play'} size={16} />{since ? 'Pause' : 'Resume'}
        </button>
        <button type="button" className="hs-save" disabled={elapsed < 1000} onClick={() => { onLog(minutes); onClose(); }}>
          <Icon name="check" size={16} />Log {minutes} {minutes === 1 ? 'minute' : 'minutes'}
        </button>
      </div>
    </Sheet>
  );
}
