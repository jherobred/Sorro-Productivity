'use client';

/**
 * How a task repeats, in the task panel: never, or a rule, and when it will
 * next come back if it were finished today.
 */

import { Icon } from '@/components/Icon';
import { usePrefs } from '@/lib/prefs';
import { isRepeat, nextDue, repeatLabel, type TaskRepeat } from '@/lib/taskRepeat';

const PRESETS: { label: string; rule: TaskRepeat | null }[] = [
  { label: 'Never', rule: null },
  { label: 'Daily', rule: { every: 'day' } },
  { label: 'Weekdays', rule: { every: 'weekday' } },
  { label: 'Weekly', rule: { every: 'week' } },
  { label: 'Monthly', rule: { every: 'month' } },
  { label: 'Yearly', rule: { every: 'year' } },
];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n: number) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export function TaskRepeatProp({ taskId, due }: { taskId: string; due: string | null }) {
  const { prefs, update } = usePrefs();
  const stored = prefs.taskRepeat?.[taskId];
  const rule = isRepeat(stored) ? stored : null;
  const set = (next: TaskRepeat | null) => {
    const { [taskId]: _old, ...rest } = prefs.taskRepeat ?? {};
    void update({ taskRepeat: next ? { ...rest, [taskId]: next } : rest });
  };
  const weekdayOfDue = due ? new Date(`${due}T12:00`).getDay() : new Date().getDay();
  const days = rule?.every === 'week' ? (rule.days?.length ? rule.days : [weekdayOfDue]) : [];
  const next = rule ? nextDue(rule, due, today()) : null;

  return (
    <div className="task-prop">
      <span className="task-prop-name"><Icon name="repeat" size={14} />Repeat</span>
      <div className="task-prop-value">
        <div className="task-chips" role="radiogroup" aria-label="Repeat">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" role="radio" aria-checked={p.rule ? rule?.every === p.rule.every : !rule}
              onClick={() => set(p.rule && { ...p.rule, interval: rule?.every === p.rule.every ? rule.interval : undefined, until: rule?.until })}>{p.label}</button>
          ))}
        </div>
        {rule && (
          <div className="task-repeat-more">
            {rule.every !== 'weekday' && (
              <label className="task-repeat-every">Every
                <input type="number" min={1} max={99} value={rule.interval ?? 1} aria-label="How many"
                  onChange={(e) => set({ ...rule, interval: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })} />
                {{ day: 'days', week: 'weeks', month: 'months', year: 'years' }[rule.every]}
              </label>
            )}
            {rule.every === 'week' && (
              <div className="task-repeat-days" role="group" aria-label="On these days">
                {DAYS.map((d, i) => (
                  <button key={i} type="button" aria-pressed={days.includes(i)} aria-label={DAY_NAMES[i]} title={DAY_NAMES[i]}
                    onClick={() => { const on = days.includes(i) ? days.filter((x) => x !== i) : [...days, i]; set({ ...rule, days: on.length ? on.sort((a, b) => a - b) : undefined }); }}>{d}</button>
                ))}
              </div>
            )}
            <label className="task-repeat-until">Ends
              <input type="date" value={rule.until ?? ''} aria-label="Last date it comes back" onChange={(e) => set({ ...rule, until: e.target.value || null })} />
            </label>
            <p className="task-repeat-note">
              {repeatLabel(rule, due)}. {next
                ? <>Finish it and it comes back <b>{new Date(`${next}T12:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</b>.</>
                : 'The rule has ended, so this is the last one.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
