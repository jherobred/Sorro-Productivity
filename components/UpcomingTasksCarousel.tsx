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
  style = {},
  className = '',
}: {
  tasks: Task[];
  todayISO: string;
  style?: React.CSSProperties;
  className?: string;
}) {
  const router = useRouter();
  const A = useTaskActions();

  // Compute next 7 days ISO
  const next7DaysISO = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }, []);

  const upcomingTasks = useMemo(() => {
    const openTasks = tasks.filter((t) => !t.done);
    const filtered = openTasks
      .filter((t) => {
        if (t.due_on) {
          return t.due_on >= todayISO && t.due_on <= next7DaysISO;
        }
        return true;
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

    if (filtered.length > 0) return filtered;
    if (openTasks.length > 0) return openTasks;

    // Default starter upcoming tasks so carousel always displays and cycles
    return [
      {
        id: 'starter-1',
        title: 'Review course syllabus and upcoming deadlines',
        notes: 'Plan study sessions and team project milestones for the week',
        due_on: todayISO,
        due_at: null,
        priority: 'high' as const,
        stars: 3,
        done: false,
        list_id: null,
        position: 1,
        deleted_at: null,
      },
      {
        id: 'starter-2',
        title: 'Draft weekly project sprint goals',
        notes: 'Outline core milestones and deliverable checklist',
        due_on: next7DaysISO,
        due_at: null,
        priority: 'med' as const,
        stars: 2,
        done: false,
        list_id: null,
        position: 2,
        deleted_at: null,
      },
      {
        id: 'starter-3',
        title: 'Complete 25-minute Pomodoro deep work sprint',
        notes: 'Focus on primary study materials without interruptions',
        due_on: next7DaysISO,
        due_at: null,
        priority: 'low' as const,
        stars: 1,
        done: false,
        list_id: null,
        position: 3,
        deleted_at: null,
      },
    ];
  }, [tasks, todayISO, next7DaysISO]);

  const handleToggleDone = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    playCelebration();
    A.complete.mutate({ id: task.id, done: true });
    toast('Task completed 🎉');
  };

  const getDueLabel = (due_on: string | null, due_at: string | null) => {
    if (!due_on) return 'Next 7 days';
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
      className={className}
      style={{
        flex: '1 1 260px',
        minWidth: 0,
        maxWidth: '100%',
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
        ...style,
      }}
    >
      {upcomingTasks.length > 0 ? (
        <Carousel autoPlayInterval={60000} className="flex flex-col flex-1 justify-between h-full">
          {/* Header remains left-aligned title with right-aligned arrows */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="check" size={13} color="var(--pal-amber)" />
              <span style={{ ...KICKER, color: 'var(--pal-amber)' }}>Upcoming Tasks</span>
            </div>
            <CarouselNavigation alwaysShow />
          </div>

          {/* Centered Slide Content */}
          <CarouselContent className="my-auto py-1">
            {upcomingTasks.map((t) => {
              const len = t.title.length;
              const titleSize = len > 55 ? 13.5 : len > 32 ? 15 : 17.5;
              return (
                <CarouselItem key={t.id}>
                  <div
                    onClick={() => router.push(`/tasks?detail=${t.id}`)}
                    style={{
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      textAlign: 'center',
                      justifyContent: 'center',
                      width: '100%',
                      padding: '2px 6px',
                    }}
                  >
                    {/* Centered Priority & Date Badges */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                      {t.priority && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: '.05em',
                            padding: '2px 8px',
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
                          padding: '2px 8px',
                          borderRadius: 6,
                          border: '1px solid var(--line)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Icon name="clock" size={10} color={t.due_on === todayISO ? PAL.coral : 'var(--tx3)'} />
                        {getDueLabel(t.due_on ?? null, t.due_at ?? null)}
                      </span>
                    </div>

                    {/* Centered Larger Auto-adjusting Title */}
                    <div
                      style={{
                        fontSize: titleSize,
                        fontWeight: 800,
                        letterSpacing: '-.02em',
                        lineHeight: 1.25,
                        marginBottom: 4,
                        color: 'var(--tx)',
                        textAlign: 'center',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        maxWidth: '100%',
                        wordBreak: 'break-word',
                      }}
                    >
                      {t.title}
                    </div>

                    {/* Centered Notes snippet */}
                    {t.notes && (
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--tx3)',
                          lineHeight: 1.35,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '92%',
                          textAlign: 'center',
                          marginBottom: 4,
                        }}
                      >
                        {t.notes}
                      </div>
                    )}

                    {/* Centered Mark Done Button */}
                    <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center' }}>
                      <button
                        type="button"
                        onClick={(e) => handleToggleDone(e, t)}
                        className="k-squish"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '5px 14px',
                          borderRadius: 7,
                          background: 'var(--pal-amber)',
                          color: '#0A0912',
                          fontSize: 11.5,
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
              );
            })}
          </CarouselContent>

          {/* Dots Indicator placed at bottom middle */}
          <div style={{ marginTop: 'auto', paddingTop: 4, display: 'flex', justifyContent: 'center', width: '100%' }}>
            <CarouselIndicator />
          </div>
        </Carousel>
      ) : (
        <div style={{ margin: 'auto 0', textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 4 }}>
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
