'use client';

import { Icon, type IconName } from '../Icon';
import { AsciiBar } from '../AsciiBar';
import { useToday } from '@/lib/today';
import { useTasks } from '@/lib/tasks';
import { useHabits, useTicks, ymd } from '@/lib/habits';
import { peso } from '@/lib/money';
import { SECHUE } from '@/lib/pal';

/**
 * The L1 second column.
 *
 * The rail gives up the sidebar's width and this takes it, filled by whichever
 * section is open. The point is P4: sub-items used to hide behind a disclosure
 * chevron, so Canvas, Graph, Journal and Java were one collapsed row away from
 * invisible. Here they are chips at the top of the column, always drawn.
 *
 * Under them, whatever the section can usefully list. Sections with nothing to
 * list get their sub-items and nothing else, which is still strictly more than
 * the collapsed chevron showed.
 */

export type Kid = { n: string; c: string; m?: string };

const ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', borderRadius: 8,
  fontSize: 12, fontWeight: 500, color: 'var(--tx2)', width: '100%', textAlign: 'left',
  minWidth: 0,
};

function Chip({ label, hue, on, onClick }: { label: string; hue: string; on?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={on ? 'k-squish' : 'hov k-squish'} style={{
      height: 25, padding: '0 10px', borderRadius: 8, flex: 'none',
      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
      color: on ? 'var(--tx)' : 'var(--tx2)',
      background: on ? `color-mix(in srgb, ${hue} 20%, transparent)` : 'var(--card)',
      border: `1px solid ${on ? `color-mix(in srgb, ${hue} 38%, transparent)` : 'var(--line)'}`,
    }}>{label}</button>
  );
}

export function ContextPane({
  width = 264, section, sectionName, hue, kids, focus, go, goFiltered, onNew,
}: {
  width?: number;
  section: string;
  sectionName: string;
  hue: string;
  kids?: Kid[];
  /** The sub-item currently selected, so the chips can show which. */
  focus?: string;
  go: (id: string) => void;
  goFiltered: (id: string, focus: string) => void;
  onNew?: () => void;
}) {
  const t = useToday();
  const { data: tasks = [] } = useTasks();
  const { data: habits = [] } = useHabits();
  const { data: ticks = [] } = useTicks(1);

  const today = ymd(new Date());
  const doneIds = new Set(ticks.filter((x) => x.on_date === today).map((x) => x.habit_id));
  const open = tasks.filter((x) => !x.done && !x.deleted_at);

  const head = (s: string) => <div className="kicker" style={{ marginTop: 14, marginBottom: 6 }}>{s}</div>;

  let listing: React.ReactNode = null;

  if (section === 'tasks') {
    const groups: [string, number, string][] = [
      ['Due today', t.dueToday, SECHUE.tasks],
      ['Overdue', t.overdue, '#FF6B6B'],
      ['All open', open.length, 'var(--tx3)'],
    ];
    listing = (
      <>
        {head('Filters')}
        {groups.map(([label, n, c]) => (
          <button key={label} onClick={() => go('tasks')} className="hov" style={ROW}>
            <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: c, flex: 'none' }} />
            <span style={{ flex: 1 }}>{label}</span>
            <span className="num" style={{ fontSize: 11, color: 'var(--tx3)' }}>{n}</span>
          </button>
        ))}
        {head('Next up')}
        {open.slice(0, 7).map((x) => (
          <button key={x.id} onClick={() => go('tasks')} className="hov" style={ROW} title={x.title}>
            <span aria-hidden style={{
              width: 13, height: 13, flex: 'none', borderRadius: 4, border: '1.6px solid var(--line2)',
            }} />
            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.title}</span>
          </button>
        ))}
      </>
    );
  } else if (section === 'calendar') {
    listing = (
      <>
        {head(`Today · ${t.events.length}`)}
        {t.events.length === 0 && <div className="metaline" style={{ padding: '4px 8px' }}>Your schedule is clear</div>}
        {t.events.map((e) => (
          <button key={e.id} onClick={() => go('calendar')} className="hov" style={ROW} title={e.title}>
            <span aria-hidden style={{
              width: 3, height: 15, borderRadius: 2, flex: 'none', background: e.color || SECHUE.calendar,
            }} />
            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</span>
            <span className="num" style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{e.starts_at.slice(11, 16)}</span>
          </button>
        ))}
      </>
    );
  } else if (section === 'habits') {
    listing = (
      <>
        {head(`Today · ${t.habitsDone} of ${habits.length}`)}
        {habits.slice(0, 10).map((h) => (
          <button key={h.id} onClick={() => go('habits')} className="hov" style={ROW} title={h.name}>
            <span aria-hidden style={{
              width: 13, height: 13, flex: 'none', borderRadius: 4,
              background: doneIds.has(h.id) ? (h.color || SECHUE.habits) : 'transparent',
              border: `1.6px solid ${doneIds.has(h.id) ? (h.color || SECHUE.habits) : 'var(--line2)'}`,
            }} />
            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</span>
          </button>
        ))}
      </>
    );
  } else if (section === 'home') {
    listing = (
      <>
        {head('Today')}
        <button onClick={() => go('calendar')} className="hov" style={ROW}>
          <Icon name="cal" size={13} color={SECHUE.calendar} />
          <span style={{ flex: 1 }}>{t.events.length ? `${t.events.length} on the calendar` : 'Schedule is clear'}</span>
        </button>
        <button onClick={() => go('tasks')} className="hov" style={ROW}>
          <Icon name="task" size={13} color={t.overdue ? '#FF6B6B' : SECHUE.tasks} />
          <span style={{ flex: 1 }}>{t.dueToday} due{t.overdue ? `, ${t.overdue} overdue` : ''}</span>
        </button>
        <button onClick={() => go('habits')} className="hov" style={ROW}>
          <Icon name="habit" size={13} color={SECHUE.habits} />
          <span style={{ flex: 1 }}>{t.habitsDone} of {habits.length} habits</span>
        </button>
        {t.leftCentavos !== null && (
          <button onClick={() => go('money')} className="hov" style={ROW}>
            <Icon name="money" size={13} color={SECHUE.money} />
            <span style={{ flex: 1 }} className="num">{peso(t.leftCentavos)} left</span>
          </button>
        )}
        {head('Next up')}
        {open.slice(0, 6).map((x) => (
          <button key={x.id} onClick={() => go('tasks')} className="hov" style={ROW} title={x.title}>
            <span aria-hidden style={{
              width: 13, height: 13, flex: 'none', borderRadius: 4, border: '1.6px solid var(--line2)',
            }} />
            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.title}</span>
          </button>
        ))}
      </>
    );
  } else if (section === 'notebooks') {
    // Two levels, as the render has it: the notebooks, then the pages of the
    // one you are in. The second list is what the collapsed chevron never
    // showed at all.
    listing = (
      <>
        {head(focus ? focus : 'All notebooks')}
        {(kids ?? []).map((k) => (
          <button key={k.n} onClick={() => goFiltered(section, k.n)} className="hov" style={{
            ...ROW, background: focus === k.n ? 'var(--hov)' : undefined,
          }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 3, background: k.c, flex: 'none' }} />
            <span style={{
              flex: 1, fontWeight: focus === k.n ? 700 : 500,
              color: focus === k.n ? 'var(--tx)' : 'var(--tx2)',
            }}>{k.n}</span>
            {k.m && <span className="num" style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{k.m}</span>}
          </button>
        ))}
        {head('Recently edited')}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 1,
          paddingLeft: 9, borderLeft: '1px solid var(--line2)', marginLeft: 6,
        }}>
          <div className="metaline" style={{ padding: '4px 8px' }}>
            Open a notebook to list its pages here.
          </div>
        </div>
      </>
    );
  } else if (section === 'money') {
    listing = (
      <>
        {head('This month')}
        <div style={{ padding: '2px 8px 8px' }}>
          {t.leftCentavos !== null ? (
            <>
              <div className="num" style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--tx)' }}>
                {peso(t.leftCentavos)}
              </div>
              <div className="metaline" style={{ marginBottom: 8 }}>left of your budgets</div>
              <AsciiBar value={t.spentPct} cells={16} hue={SECHUE.money} suffix="% spent" label="Budget used" />
            </>
          ) : <div className="metaline">No budgets set</div>}
        </div>
      </>
    );
  }

  return (
    <div style={{
      width, minWidth: width, flex: 'none', display: 'flex', flexDirection: 'column',
      borderRight: '1px solid var(--line)', minHeight: 0, background: 'var(--bg)',
    }}>
      <div style={{ padding: '14px 12px 10px', flex: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: kids?.length ? 11 : 0 }}>
          <span style={{
            flex: 1, fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 700,
            letterSpacing: '-.02em', color: 'var(--tx)', minWidth: 0,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{sectionName}</span>
          {onNew && (
            <button onClick={onNew} className="hov k-squish"
              title={`New in ${sectionName}`} aria-label={`New in ${sectionName}`} style={{
                width: 28, height: 28, flex: 'none', borderRadius: 8, display: 'grid', placeItems: 'center',
                border: '1px solid var(--line2)', background: 'var(--card2)',
              }}>
              <Icon name={'plus' as IconName} size={14} color="var(--tx2)" />
            </button>
          )}
        </div>

        {/* P4: the sub-items, drawn rather than hidden behind a disclosure. */}
        {!!kids?.length && (
          <div className="hbar" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            <Chip label="All" hue={hue} on={!focus} onClick={() => go(section)} />
            {kids.map((k) => (
              <Chip key={k.n} label={k.n} hue={k.c} on={focus === k.n}
                onClick={() => goFiltered(section, k.n)} />
            ))}
          </div>
        )}
      </div>

      <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 12px 12px' }}>
        {listing ?? (
          <div className="metaline" style={{ padding: '6px 8px' }}>
            {kids?.length ? 'Pick a view above.' : 'Nothing to list for this section yet.'}
          </div>
        )}
      </div>
    </div>
  );
}
