import { useMemo, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import type { Task } from '@/lib/tasks';
import { useTaskActions, getTaskAlert } from '@/lib/tasks';
import { Icon } from './Icon';
import { PAL } from '@/lib/pal';
import { playCelebration } from '@/lib/audio';
import { toast } from '@/lib/toast';
import { useLayout } from '@/lib/useLayout';

const KICKER: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '.12em',
  textTransform: 'uppercase',
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

/**
 * Serious emergency siren/alarm asset for <= 24 hours left tasks.
 */
function SeriousAlarmBeacon({ size = 20 }: { size?: number }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 7px',
        borderRadius: 6,
        background: 'rgba(255, 59, 48, 0.18)',
        border: '1.5px solid rgba(255, 59, 48, 0.55)',
        animation: 'serious-alarm-pulse 0.9s infinite ease-in-out',
      }}
      title="Urgent: Less than 24 hours remaining!"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        style={{
          filter: 'drop-shadow(0 0 6px #FF3B30)',
        }}
      >
        {/* Siren Dome */}
        <path
          d="M6 15V10C6 6.68629 8.68629 4 12 4C15.3137 4 18 6.68629 18 10V15"
          fill="#FF3B30"
          stroke="#FFB3B3"
          strokeWidth="1.5"
        />
        {/* Light Core */}
        <ellipse cx="12" cy="9.5" rx="3.5" ry="4" fill="#FFFFFF" opacity="0.9" />
        {/* Base */}
        <rect x="4" y="15" width="16" height="4" rx="2" fill="#18181B" stroke="#FF3B30" strokeWidth="1.5" />
        {/* Flashing Warning Beams */}
        <line x1="12" y1="1" x2="12" y2="3" stroke="#FF3B30" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="4.5" y1="4.5" x2="6" y2="6" stroke="#FF3B30" strokeWidth="2" strokeLinecap="round" />
        <line x1="19.5" y1="4.5" x2="18" y2="6" stroke="#FF3B30" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span style={{ fontSize: 9.5, fontWeight: 900, color: '#FF4D4D', letterSpacing: '.06em', textTransform: 'uppercase' }}>
        URGENT ALARM
      </span>
    </div>
  );
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
  const { phone } = useLayout();
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

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIdx((prev) => (prev + 1) % upcomingTasks.length);
    setTimeLeft(CYCLE_SECONDS);
  };

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIdx((prev) => (prev - 1 + upcomingTasks.length) % upcomingTasks.length);
    setTimeLeft(CYCLE_SECONDS);
  };

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.changedTouches.length === 0) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = endX - touchStartRef.current.x;
    const deltaY = endY - touchStartRef.current.y;
    const elapsed = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    // Detect horizontal swipe (> 35px horizontal distance and predominantly horizontal within 600ms)
    if (Math.abs(deltaX) > 35 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15 && elapsed < 600) {
      if (deltaX < 0) {
        // Swipe left -> Next task
        handleNext();
      } else {
        // Swipe right -> Previous task
        handlePrev();
      }
    }
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
  const alert = t ? getTaskAlert(t) : null;

  // Compute aura theme & color based on deadline proximity
  let auraTheme = {
    color: 'var(--pal-amber, #FFC24B)',
    bg: 'color-mix(in srgb, var(--pal-amber) 12%, var(--card))',
    border: '1.5px solid color-mix(in srgb, var(--pal-amber) 35%, transparent)',
    shadow: '0 4px 20px color-mix(in srgb, var(--pal-amber) 12%, transparent)',
  };

  if (alert?.tier === 'red') {
    auraTheme = {
      color: '#FF3B30',
      bg: 'color-mix(in srgb, #FF3B30 14%, var(--card))',
      border: '1.5px solid #FF3B30',
      shadow: '0 0 24px rgba(255, 59, 48, 0.45), inset 0 0 16px rgba(255, 59, 48, 0.12)',
    };
  } else if (alert?.tier === 'orange') {
    auraTheme = {
      color: '#FF9A3C',
      bg: 'color-mix(in srgb, #FF9A3C 14%, var(--card))',
      border: '1.5px solid #FF9A3C',
      shadow: '0 0 20px rgba(255, 154, 60, 0.35), inset 0 0 12px rgba(255, 154, 60, 0.1)',
    };
  } else if (alert?.tier === 'yellow') {
    auraTheme = {
      color: '#FFC24B',
      bg: 'color-mix(in srgb, #FFC24B 14%, var(--card))',
      border: '1.5px solid #FFC24B',
      shadow: '0 0 18px rgba(255, 194, 75, 0.3), inset 0 0 10px rgba(255, 194, 75, 0.08)',
    };
  }

  return (
    <div
      className={className}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        flex: '1 1 260px',
        minWidth: 0,
        maxWidth: '100%',
        borderRadius: 16,
        padding: '16px 18px',
        background: auraTheme.bg,
        border: auraTheme.border,
        boxShadow: auraTheme.shadow,
        minHeight: 185,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        justifyContent: 'space-between',
        transition: 'all 0.4s ease',
        ...style,
      }}
    >
      {t ? (
        <>
          {/* Header with Title & Circular Timer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="check" size={14} color={auraTheme.color} />
              <span style={{ ...KICKER, color: auraTheme.color }}>Upcoming Tasks</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {/* Circular Countdown Timer */}
              {upcomingTasks.length > 1 && (
                <div
                  title={`${timeLeft}s until next upcoming task`}
                  style={{
                    position: 'relative',
                    width: 28,
                    height: 28,
                    display: 'grid',
                    placeItems: 'center',
                    flex: 'none',
                  }}
                >
                  <svg width="28" height="28" viewBox="0 0 32 32" style={{ transform: 'rotate(-90deg)', position: 'absolute', inset: 0 }}>
                    <circle cx="16" cy="16" r="13" fill="var(--card2)" stroke="var(--line2)" strokeWidth="2.5" />
                    <circle
                      cx="16"
                      cy="16"
                      r="13"
                      fill="none"
                      stroke={auraTheme.color}
                      strokeWidth="2.5"
                      strokeDasharray={2 * Math.PI * 13}
                      strokeDashoffset={2 * Math.PI * 13 * (1 - timeLeft / CYCLE_SECONDS)}
                      strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset 0.9s linear' }}
                    />
                  </svg>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: 'var(--tx)',
                      zIndex: 1,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {timeLeft}
                  </span>
                </div>
              )}

              {/* Navigation Arrows on Desktop */}
              {!phone && upcomingTasks.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="hov k-squish"
                    aria-label="Previous task"
                    title="Previous task"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      border: '1px solid var(--line2)',
                      background: 'var(--card2)',
                      color: 'var(--tx2)',
                      display: 'grid',
                      placeItems: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Icon name="chevronLeft" size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="hov k-squish"
                    aria-label="Next task"
                    title="Next task"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      border: '1px solid var(--line2)',
                      background: 'var(--card2)',
                      color: 'var(--tx2)',
                      display: 'grid',
                      placeItems: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Icon name="chevronRight" size={12} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Animated Task Content with Visible Swipe to the Left */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 115, display: 'flex' }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={t.id}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: 'minmax(95px, 1fr) 2.8fr',
                  gap: 12,
                  alignItems: 'stretch',
                }}
              >
                {/* Left Column: Metadata (1/4) */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    borderRight: `1px solid color-mix(in srgb, ${auraTheme.color} 30%, var(--line))`,
                    paddingRight: 10,
                    minWidth: 0,
                    width: '100%',
                    justifyContent: 'flex-start',
                  }}
                >
                  {/* Serious Alarm Asset if <= 24 hours left */}
                  {alert?.tier === 'red' && <SeriousAlarmBeacon size={20} />}

                  {/* Priority Tag */}
                  {t.priority && (
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '.06em',
                        padding: '4px 8px',
                        borderRadius: 7,
                        color: PRIORITY_COLOR[t.priority] || 'var(--tx2)',
                        background: `color-mix(in srgb, ${PRIORITY_COLOR[t.priority] || 'var(--line)'} 18%, transparent)`,
                        border: `1.5px solid color-mix(in srgb, ${PRIORITY_COLOR[t.priority] || 'var(--line)'} 35%, transparent)`,
                        width: '100%',
                        boxSizing: 'border-box',
                        textAlign: 'center',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t.priority}
                    </span>
                  )}

                  {/* Due Date Tag */}
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: t.due_on === todayISO ? PAL.coral : 'var(--tx2)',
                      background: 'var(--card2)',
                      padding: '4px 8px',
                      borderRadius: 7,
                      border: '1px solid var(--line)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      width: '100%',
                      boxSizing: 'border-box',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Icon name="clock" size={12} color={t.due_on === todayISO ? PAL.coral : 'var(--tx3)'} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {getDueLabel(t.due_on ?? null, t.due_at ?? null)}
                    </span>
                  </span>

                  {/* Tags */}
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: 'var(--tx2)',
                        background: 'var(--card2)',
                        padding: '4px 8px',
                        borderRadius: 7,
                        border: '1px solid var(--line2)',
                        width: '100%',
                        boxSizing: 'border-box',
                        textAlign: 'center',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {tag}
                    </span>
                  ))}

                  {/* Links */}
                  {links.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2, width: '100%' }}>
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
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 4,
                              fontSize: 11.5,
                              fontWeight: 800,
                              padding: '4px 8px',
                              borderRadius: 7,
                              background: `color-mix(in srgb, ${auraTheme.color} 18%, var(--card2))`,
                              border: `1.5px solid color-mix(in srgb, ${auraTheme.color} 40%, transparent)`,
                              color: auraTheme.color,
                              textDecoration: 'none',
                              width: '100%',
                              boxSizing: 'border-box',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <Icon name="link" size={11} color={auraTheme.color} />
                            <span>{label}</span>
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right Column: Title, Description, and Full-Width Mark Done Button (3/4) */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
                  <div
                    onClick={() => router.push(`/tasks?detail=${t.id}`)}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4 }}
                  >
                    <div
                      style={{
                        fontSize: 17.5,
                        fontWeight: 800,
                        letterSpacing: '-.025em',
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
                          fontSize: 12.5,
                          color: 'var(--tx2)',
                          lineHeight: 1.45,
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
                      marginTop: 8,
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '8px 14px',
                      borderRadius: 9,
                      background: auraTheme.color,
                      color: '#0A0912',
                      fontSize: 12.5,
                      fontWeight: 800,
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: `0 3px 10px color-mix(in srgb, ${auraTheme.color} 35%, transparent)`,
                    }}
                  >
                    <Icon name="check" size={13} color="#0A0912" />
                    <span>Mark Done</span>
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>
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
                      width: isActive ? 18 : 6,
                      height: 6,
                      borderRadius: 3,
                      background: isActive ? auraTheme.color : 'color-mix(in srgb, var(--tx3) 40%, transparent)',
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
