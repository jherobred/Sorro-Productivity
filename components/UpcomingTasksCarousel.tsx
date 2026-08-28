'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Task } from '@/lib/tasks';
import { useTaskActions } from '@/lib/tasks';
import { Icon } from './Icon';
import { PAL } from '@/lib/pal';
import { playCelebration } from '@/lib/audio';
import { toast } from '@/lib/toast';
import {
  Carousel,
  CarouselContent,
  CarouselNavigation,
  CarouselIndicator,
  CarouselItem,
} from '@/components/core/carousel';

const KICKER: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: '.11em',
  textTransform: 'uppercase',
  color: 'var(--tx3)',
};

const PRIORITY_ORDER: Record<string, number> = {
  high: 3,
  med: 2,
  low: 1,
};

const PRIORITY_COLOR: Record<string, string> = {
  high: PAL.coral,
  med: PAL.amber,
  low: PAL.mint,
};

export function UpcomingTasksCarousel({
  tasks = [],
  todayISO,
}: {
  tasks: Task[];
  todayISO: string;
}) {
  const router = useRouter();
  const A = useTaskActions();

  // Compute end of current week
  const endOfWeekISO = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const distToSunday = day === 0 ? 0 : 7 - day;
    const end = new Date(d);
    end.setDate(d.getDate() + distToSunday);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${end.getFullYear()}-${p(end.getMonth() + 1)}-${p(end.getDate())}`;
  }, []);

  const upcomingTasks = useMemo(() => {
    const openTasks = tasks.filter((t) => !t.done);
    return openTasks
      .filter((t) => {
        if (t.due_on) {
          return t.due_on >= todayISO && t.due_on <= endOfWeekISO;
        }
        return t.priority === 'high';
      })
      .sort((a, b) => {
        const pA = PRIORITY_ORDER[a.priority ?? ''] ?? 0;
        const pB = PRIORITY_ORDER[b.priority ?? ''] ?? 0;
        if (pA !== pB) return pB - pA;

        const dateA = a.due_on ?? '9999-99-99';
        const dateB = b.due_on ?? '9999-99-99';
        if (dateA !== dateB) return dateA.localeCompare(dateB);

        const timeA = a.due_at ?? '';
        const timeB = b.due_at ?? '';
        return timeA.localeCompare(timeB);
      });
  }, [tasks, todayISO, endOfWeekISO]);

  const handleToggleDone = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    playCelebration();
    A.complete.mutate({ id: task.id, done: true });
    toast('Task completed 🎉');
  };

  const getDueLabel = (due_on: string | null, due_at: string | null) => {
    if (!due_on) return 'This week';
    if (due_on === todayISO) {
      if (due_at) {
        const d = new Date(due_at);
        return `Today at ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
      return 'Today';
    }
    const d = new Date(due_on + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div
      style={{
        flex: 'none',
        width: 353,
        borderRadius: 16,
        padding: '16px 18px',
        background: 'color-mix(in srgb, var(--pal-amber) 12%, var(--card))',
        border: '1.5px solid color-mix(in srgb, var(--pal-amber) 32%, transparent)',
        boxShadow: '0 4px 20px color-mix(in srgb, var(--pal-amber) 10%, transparent)',
        minHeight: 180,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {upcomingTasks.length > 0 ? (
        <Carousel autoPlayInterval={6500} className="flex flex-col flex-1 justify-between">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="check" size={13} color="var(--pal-amber)" />
              <span style={{ ...KICKER, color: 'var(--pal-amber)' }}>Upcoming Tasks</span>
            </div>
            <CarouselNavigation alwaysShow />
          </div>

          <CarouselContent>
            {upcomingTasks.map((t) => (
              <CarouselItem key={t.id}>
                <div
                  onClick={() => router.push(`/tasks?detail=${t.id}`)}
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 88,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                    {t.priority && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '.05em',
                          padding: '2px 7px',
                          borderRadius: 6,
                          color: PRIORITY_COLOR[t.priority] || 'var(--tx2)',
                          background: `color-mix(in srgb, ${PRIORITY_COLOR[t.priority] || 'var(--line)'} 16%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${PRIORITY_COLOR[t.priority] || 'var(--line)'} 30%, transparent)`,
                        }}
                      >
                        {t.priority} Priority
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: t.due_on === todayISO ? PAL.coral : 'var(--tx2)',
                        background: 'var(--card2)',
                        padding: '2px 7px',
                        borderRadius: 6,
                        border: '1px solid var(--line)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Icon name="clock" size={10} color={t.due_on === todayISO ? PAL.coral : 'var(--tx3)'} />
                      {getDueLabel(t.due_on ?? null, t.due_at ?? null)}
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: 14.5,
                      fontWeight: 800,
                      letterSpacing: '-.02em',
                      lineHeight: 1.3,
                      marginBottom: 4,
                      color: 'var(--tx)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {t.title}
                  </div>

                  {t.notes && (
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--tx3)',
                        lineHeight: 1.4,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t.notes}
                    </div>
                  )}

                  <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 }}>
                    <button
                      type="button"
                      onClick={(e) => handleToggleDone(e, t)}
                      className="k-squish"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '5px 11px',
                        borderRadius: 7,
                        background: 'var(--pal-amber)',
                        color: '#0A0912',
                        fontSize: 11,
                        fontWeight: 800,
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <Icon name="check" size={12} color="#0A0912" />
                      <span>Mark Done</span>
                    </button>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>

          <CarouselIndicator />
        </Carousel>
      ) : (
        <div style={{ margin: 'auto 0', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 4 }}>
            All caught up! 🎉
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--tx3)', marginBottom: 12 }}>
            No upcoming tasks due this week
          </div>
          <button
            type="button"
            onClick={() => router.push('/tasks/')}
            className="k-squish"
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              background: 'var(--card2)',
              border: '1px solid var(--line2)',
              color: 'var(--tx2)',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Go to Tasks
          </button>
        </div>
      )}
    </div>
  );
}
