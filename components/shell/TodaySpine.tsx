'use client';

import { Icon } from '../Icon';
import { AsciiBar } from '../AsciiBar';
import { useToday, untilLabel, elapsedPct } from '@/lib/today';
import { peso } from '@/lib/money';
import { PAL, SECHUE } from '@/lib/pal';

/**
 * The L3 top strip.
 *
 * The bar it replaces held five status icons and, once the search circle came
 * out, a large amount of nothing. This carries the four things Home's top cards
 * carry — what is next, what is due, how many habits are ticked, what is left
 * to spend — so they follow you into Notebooks and Money instead of living on
 * one screen you have to navigate back to.
 *
 * Nothing here is a link to a modal. Every chip is a jump to the section that
 * owns the number, which is the only thing you would want after reading it.
 */

const CHIP: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px',
  borderRadius: 999, border: '1px solid var(--line2)', background: 'var(--card2)',
  fontSize: 11.5, fontWeight: 600, color: 'var(--tx2)', whiteSpace: 'nowrap', flex: 'none',
};

function hot(hue: string): React.CSSProperties {
  return {
    ...CHIP,
    borderColor: `color-mix(in srgb, ${hue} 42%, var(--line2))`,
    background: `color-mix(in srgb, ${hue} 13%, var(--card2))`,
  };
}

export function TodaySpine({ go, compact = false }: { go: (id: string) => void; compact?: boolean }) {
  const t = useToday();
  const evHue = t.next?.color || SECHUE.calendar;

  return (
    <div className="hbar" style={{
      display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
      overflowX: 'auto', overflowY: 'hidden',
    }}>
      {!compact && (
        <span className="kicker" style={{ flex: 'none', letterSpacing: '.14em' }}>Today</span>
      )}

      {t.next ? (
        <button onClick={() => go('calendar')} style={hot(evHue)}
          title={`${t.next.title}${t.next.location ? ` · ${t.next.location}` : ''}`}>
          <Icon name="clock" size={13} color={evHue} />
          <span className="num">{t.next.starts_at.slice(11, 16)}</span>
          <span style={{ maxWidth: compact ? 84 : 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {t.next.title}
          </span>
          <span style={{ fontWeight: 500, color: 'var(--tx3)' }}>
            {untilLabel(t.minsTo, t.ongoing)}
          </span>
        </button>
      ) : (
        <button onClick={() => go('calendar')} style={CHIP}>
          <Icon name="cal" size={13} color="var(--tx3)" />Nothing else today
        </button>
      )}

      <button onClick={() => go('tasks')} style={t.overdue ? hot(PAL.coral) : CHIP}>
        <Icon name="task" size={13} color={t.overdue ? PAL.coral : SECHUE.tasks} />
        <span className="num">{t.dueToday} due</span>
        {t.overdue > 0 && (
          <span className="num" style={{ fontWeight: 500, color: PAL.coral }}>· {t.overdue} over</span>
        )}
      </button>

      {t.habitsTotal > 0 && (
        <button onClick={() => go('habits')} style={CHIP}>
          <Icon name="habit" size={13} color={SECHUE.habits} />
          <span style={{ display: 'flex', gap: 3, marginLeft: 1 }}>
            {Array.from({ length: Math.min(t.habitsTotal, 7) }, (_, i) => (
              <span key={i} aria-hidden style={{
                width: 7, height: 7, borderRadius: '50%',
                background: i < t.habitsDone ? SECHUE.habits : 'var(--line2)',
              }} />
            ))}
          </span>
          <span className="num">{t.habitsDone} of {t.habitsTotal}</span>
        </button>
      )}

      {t.leftCentavos !== null && !compact && (
        <button onClick={() => go('money')} style={CHIP}>
          <Icon name="money" size={13} color={SECHUE.money} />
          <span className="num">{peso(t.leftCentavos)}</span>
          <span style={{ width: 54, display: 'inline-block' }}>
            <AsciiBar value={t.spentPct} cells={7} size={10} showValue={false}
              hue={t.spentPct > 90 ? PAL.coral : SECHUE.money} label="Budget used" />
          </span>
        </button>
      )}

      {/* How far through the current thing you are, when there is one. */}
      {t.ongoing && t.next && !compact && (
        <span style={{ ...CHIP, background: 'transparent', border: 'none', paddingLeft: 0 }}>
          <AsciiBar value={elapsedPct(t.next)} cells={12} size={10} hue={evHue}
            showValue={false} label="Time elapsed in the current event" />
        </span>
      )}
    </div>
  );
}
