'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Task } from '@/lib/tasks';
import { useTaskActions } from '@/lib/tasks';
import { Icon } from './Icon';
import { PAL } from '@/lib/pal';
import { playCelebration } from '@/lib/audio';
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

function extractLinks(text: string): string[] {
  if (!text) return [];
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex);
  return matches ? Array.from(new Set(matches)) : [];
}

function extractTags(title: string, notes: string): string[] {
  const combined = `${title || ''} ${notes || ''}`;
  const tagRegex = /#([a-zA-Z0-9_\-]+)/g;
  const matches = combined.match(tagRegex);
  return matches ? Array.from(new Set(matches)) : [];
}

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

  const [currentIdx, setCurrentIdx] = useState(0);
  const CYCLE_SECONDS = 7;
  const [timeLeft, setTimeLeft] = useState(CYCLE_SECONDS);

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
        notes: 'Outline core milestones and deliverable checklist #sprint',
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
        title: 'Complete 25-minute deep work sprint',
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

  // Auto-cycle timer
  useEffect(() => {
    if (upcomingTasks.length <= 1) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setCurrentIdx((cur) => (cur + 1) % upcomingTasks.length);
          return CYCLE_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [upcomingTasks.length]);

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIdx((prev) => (prev - 1 + upcomingTasks.length) % upcomingTasks.length);
    setTimeLeft(CYCLE_SECONDS);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIdx((prev) => (prev + 1) % upcomingTasks.length);
    setTimeLeft(CYCLE_SECONDS);
  };

  const handleSelect = (idx: number) => {
    setCurrentIdx(idx);
    setTimeLeft(CYCLE_SECONDS);
  };

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
        return `Today ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
      return 'Today';
    }
    const d = new Date(due_on + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const t = upcomingTasks[currentIdx] || upcomingTasks[0];
  const links = t ? extractLinks(`${t.title || ''} ${t.notes || ''}`) : [];
  const tags = t ? extractTags(t.title, t.notes) : [];

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
        justifyContent: 'space-between',
        ...style,
      }}
    >
      {t ? (
        <>
          {/* Header with Title, Auto-Timer & Arrows */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="check" size={13} color="var(--pal-amber)" />
              <span style={{ ...KICKER, color: 'var(--pal-amber)' }}>Upcoming Tasks</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Timer until next task */}
              {upcomingTasks.length > 1 && (
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    color: 'var(--tx3)',
                    background: 'var(--card2)',
                    padding: '2px 6px',
                    borderRadius: 6,
                    border: '1px solid var(--line2)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  Next in {timeLeft}s
                </span>
              )}

              {/* Navigation Arrows */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <button
                  type="button"
                  onClick={handlePrev}
                  className="hov k-squish"
                  aria-label="Previous task"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    border: '1px solid var(--line2)',
                    background: 'var(--card2)',
                    color: 'var(--tx2)',
                    display: 'grid',
                    placeItems: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <Icon name="chevronLeft" size={11} />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="hov k-squish"
                  aria-label="Next task"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    border: '1px solid var(--line2)',
                    background: 'var(--card2)',
                    color: 'var(--tx2)',
                    display: 'grid',
                    placeItems: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <Icon name="chevronRight" size={11} />
                </button>
              </div>
            </div>
          </div>

          {/* 2-Column Split: 1/4 Left (Metadata: Tags, Dates, Links), 3/4 Right (Details & Mark Done) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(70px, 1fr) 2.6fr', gap: 10, flex: 1, alignItems: 'stretch' }}>
            {/* Left Column: 1/4 */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                borderRight: '1px solid color-mix(in srgb, var(--pal-amber) 25%, var(--line))',
                paddingRight: 8,
                minWidth: 0,
                justifyContent: 'flex-start',
              }}
            >
              {/* Priority */}
              {t.priority && (
                <span
                  style={{
                    fontSize: 8.5,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    padding: '2px 5px',
                    borderRadius: 5,
                    color: PRIORITY_COLOR[t.priority] || 'var(--tx2)',
                    background: `color-mix(in srgb, ${PRIORITY_COLOR[t.priority] || 'var(--line)'} 16%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${PRIORITY_COLOR[t.priority] || 'var(--line)'} 30%, transparent)`,
                    width: 'fit-content',
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.priority}
                </span>
              )}

              {/* Due Date */}
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: t.due_on === todayISO ? PAL.coral : 'var(--tx2)',
                  background: 'var(--card2)',
                  padding: '2px 5px',
                  borderRadius: 5,
                  border: '1px solid var(--line)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  width: 'fit-content',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon name="clock" size={9} color={t.due_on === todayISO ? PAL.coral : 'var(--tx3)'} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {getDueLabel(t.due_on ?? null, t.due_at ?? null)}
                </span>
              </span>

              {/* Tags */}
              {tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontSize: 8.5,
                    fontWeight: 600,
                    color: 'var(--tx3)',
                    background: 'var(--card2)',
                    padding: '1px 5px',
                    borderRadius: 4,
                    border: '1px solid var(--line2)',
                    width: 'fit-content',
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tag}
                </span>
              ))}

              {/* Links (Shows LINK or LINK 1, LINK 2, etc.) */}
              {links.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
                  {links.map((link, idx) => {
                    const label = links.length === 1 ? 'LINK' : `LINK ${idx + 1}`;
                    return (
                      <a
                        key={link + idx}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title={link}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          fontSize: 8.5,
                          fontWeight: 800,
                          padding: '2px 5px',
                          borderRadius: 4,
                          background: 'color-mix(in srgb, var(--pal-amber) 16%, var(--card2))',
                          border: '1px solid color-mix(in srgb, var(--pal-amber) 35%, transparent)',
                          color: 'var(--pal-amber)',
                          textDecoration: 'none',
                          width: 'fit-content',
                          maxWidth: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <Icon name="link" size={8} color="var(--pal-amber)" />
                        <span>{label}</span>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: 3/4 */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
              <div
                onClick={() => router.push(`/tasks?detail=${t.id}`)}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 3 }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    letterSpacing: '-.02em',
                    lineHeight: 1.25,
                    color: 'var(--tx)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    wordBreak: 'break-word',
                  }}
                >
                  {t.title}
                </div>

                {t.notes && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--tx3)',
                      lineHeight: 1.3,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      wordBreak: 'break-word',
                    }}
                  >
                    {t.notes}
                  </div>
                )}
              </div>

              {/* Full-Width Mark Done Button */}
              <button
                type="button"
                onClick={(e) => handleToggleDone(e, t)}
                className="k-squish"
                style={{
                  marginTop: 6,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  borderRadius: 8,
                  background: 'var(--pal-amber)',
                  color: '#0A0912',
                  fontSize: 11.5,
                  fontWeight: 800,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px color-mix(in srgb, var(--pal-amber) 30%, transparent)',
                }}
              >
                <Icon name="check" size={12} color="#0A0912" />
                <span>Mark Done</span>
              </button>
            </div>
          </div>

          {/* Pagination Circles/Dots at the Bottom */}
          {upcomingTasks.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 8 }}>
              {upcomingTasks.map((item, idx) => {
                const isActive = idx === currentIdx;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(idx)}
                    aria-label={`Go to task ${idx + 1}`}
                    style={{
                      width: isActive ? 16 : 6,
                      height: 6,
                      borderRadius: 3,
                      background: isActive ? 'var(--pal-amber)' : 'color-mix(in srgb, var(--tx3) 40%, transparent)',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                    }}
                  />
                );
              })}
            </div>
          )}
        </>
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
