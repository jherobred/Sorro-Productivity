'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Task } from '@/lib/tasks';
import { useTaskActions } from '@/lib/tasks';
import { Icon } from './Icon';
import { PAL } from '@/lib/pal';
import { playTick, playCelebration } from '@/lib/audio';
import { toast } from '@/lib/toast';

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
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [sliding, setSliding] = useState(false);

  // Compute end of the current week (Sunday)
  const endOfWeekISO = useMemo(() => {
    const d = new Date();
    const day = d.getDay(); // 0 is Sunday, 1 is Monday...
    const distToSunday = day === 0 ? 0 : 7 - day;
    const end = new Date(d);
    end.setDate(d.getDate() + distToSunday);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${end.getFullYear()}-${p(end.getMonth() + 1)}-${p(end.getDate())}`;
  }, []);

  // Filter tasks: open tasks due within this week or high-priority items
  const upcomingTasks = useMemo(() => {
    const openTasks = tasks.filter((t) => !t.done);
    return openTasks
      .filter((t) => {
        if (t.due_on) {
          return t.due_on >= todayISO && t.due_on <= endOfWeekISO;
        }
        // Include high priority even without explicit due date
        return t.priority === 'high';
      })
      .sort((a, b) => {
        // First sort by priority
        const pA = PRIORITY_ORDER[a.priority ?? ''] ?? 0;
        const pB = PRIORITY_ORDER[b.priority ?? ''] ?? 0;
        if (pA !== pB) return pB - pA;

        // Then by due date
        const dateA = a.due_on ?? '9999-99-99';
        const dateB = b.due_on ?? '9999-99-99';
        if (dateA !== dateB) return dateA.localeCompare(dateB);

        // Then by time
        const timeA = a.due_at ?? '';
        const timeB = b.due_at ?? '';
        return timeA.localeCompare(timeB);
      });
  }, [tasks, todayISO, endOfWeekISO]);

  // Reset index if upcoming tasks change
  useEffect(() => {
    if (index >= upcomingTasks.length) {
      setIndex(0);
    }
  }, [upcomingTasks.length, index]);

  // Automatic sliding carousel with ample time (6.5s) per task
  useEffect(() => {
    if (upcomingTasks.length <= 1 || isPaused) return;

    const timer = setInterval(() => {
      setSliding(true);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % upcomingTasks.length);
        setSliding(false);
      }, 250);
    }, 6500);

    return () => clearInterval(timer);
  }, [upcomingTasks.length, isPaused]);

  const current = upcomingTasks[index];

  const handleToggleDone = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    playCelebration();
    A.complete.mutate({ id: task.id, done: true });
    toast('Task completed 🎉');
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    playTick();
    setSliding(true);
    setTimeout(() => {
      setIndex((prev) => (prev - 1 + upcomingTasks.length) % upcomingTasks.length);
      setSliding(false);
    }, 200);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    playTick();
    setSliding(true);
    setTimeout(() => {
      setIndex((prev) => (prev + 1) % upcomingTasks.length);
      setSliding(false);
    }, 200);
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
    const dayName = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    return dayName;
  };

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
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
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="check" size={13} color="var(--pal-amber)" />
          <span style={{ ...KICKER, color: 'var(--pal-amber)' }}>Upcoming Tasks</span>
        </div>

        {upcomingTasks.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
              {index + 1} of {upcomingTasks.length}
            </span>
            {upcomingTasks.length > 1 && (
              <div style={{ display: 'flex', gap: 2 }}>
                <button
                  onClick={handlePrev}
                  className="hov k-squish"
                  aria-label="Previous task"
                  style={{ width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center', background: 'var(--card2)', border: '1px solid var(--line)' }}
                >
                  <Icon name="chev" size={11} color="var(--tx2)" style={{ transform: 'rotate(180deg)' }} />
                </button>
                <button
                  onClick={handleNext}
                  className="hov k-squish"
                  aria-label="Next task"
                  style={{ width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center', background: 'var(--card2)', border: '1px solid var(--line)' }}
                >
                  <Icon name="chev" size={11} color="var(--tx2)" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Task Slide Content */}
      {current ? (
        <div
          key={current.id}
          onClick={() => router.push(`/tasks?detail=${current.id}`)}
          style={{
            cursor: 'pointer',
            opacity: sliding ? 0 : 1,
            transform: sliding ? 'translateX(12px)' : 'translateX(0)',
            transition: 'opacity 0.22s ease, transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
          }}
        >
          {/* Priority & Due Date tags */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {current.priority && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '.05em',
                  padding: '2px 7px',
                  borderRadius: 6,
                  color: PRIORITY_COLOR[current.priority] || 'var(--tx2)',
                  background: `color-mix(in srgb, ${PRIORITY_COLOR[current.priority] || 'var(--line)'} 16%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${PRIORITY_COLOR[current.priority] || 'var(--line)'} 30%, transparent)`,
                }}
              >
                {current.priority} Priority
              </span>
            )}
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: current.due_on === todayISO ? PAL.coral : 'var(--tx2)',
                background: 'var(--card2)',
                padding: '2px 7px',
                borderRadius: 6,
                border: '1px solid var(--line)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Icon name="clock" size={10} color={current.due_on === todayISO ? PAL.coral : 'var(--tx3)'} />
              {getDueLabel(current.due_on ?? null, current.due_at ?? null)}
            </span>
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: '-.02em',
              lineHeight: 1.3,
              marginBottom: 6,
              color: 'var(--tx)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {current.title}
          </div>

          {/* Notes Preview */}
          {current.notes && (
            <div
              style={{
                fontSize: 11.5,
                color: 'var(--tx3)',
                lineHeight: 1.45,
                marginBottom: 10,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {current.notes}
            </div>
          )}

          {/* Bottom action row */}
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 }}>
            <button
              onClick={(e) => handleToggleDone(e, current)}
              className="k-squish"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
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

            {upcomingTasks.length > 1 && (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {upcomingTasks.slice(0, 7).map((t, i) => (
                  <span
                    key={t.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIndex(i);
                    }}
                    style={{
                      width: i === index ? 14 : 5,
                      height: 5,
                      borderRadius: 3,
                      background: i === index ? 'var(--pal-amber)' : 'var(--line2)',
                      transition: 'all 0.25s ease',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ margin: 'auto 0', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 4 }}>
            All caught up! 🎉
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--tx3)', marginBottom: 12 }}>
            No upcoming tasks due this week
          </div>
          <button
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
