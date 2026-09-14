'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '@/components/Icon';
import { formatTaskCountdown, getTaskAlert, parseTaskLinks, useTaskActions, type Task } from '@/lib/tasks';
import { upcomingCycle } from '@/lib/todayCycle';
import { usePrefs } from '@/lib/prefs';

const CYCLE = 7;
const RING = 2 * Math.PI * 13;
const PRIORITY: Record<string, string> = { high: 'High priority', med: 'Medium priority', low: 'Low priority' };

/**
 * The upcoming task card on Today, cycling through what is due the way the
 * old rotating card did: a new task every seven seconds with a ring counting
 * down to it, arrows, a swipe, and dots to jump. It holds still while it is
 * pointed at or focused, and the ring pauses it, so a task never moves away
 * under a finger that is reaching for Mark done.
 */
export function UpcomingTaskCycle({ tasks, today, weekEnd }: { tasks: Task[]; today: string; weekEnd: string }) {
  const { prefs } = usePrefs();
  const A = useTaskActions();
  const list = useMemo(() => upcomingCycle(tasks, today, weekEnd), [tasks, today, weekEnd]);
  const count = list.length;
  const [index, setIndex] = useState(0);
  const [left, setLeft] = useState(CYCLE);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const remaining = useRef(CYCLE);
  const stopped = useRef(false);
  stopped.current = paused || held;
  const direction = useRef(1);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      if (count < 2 || stopped.current) return;
      remaining.current -= 1;
      if (remaining.current <= 0) {
        remaining.current = CYCLE;
        direction.current = 1;
        setIndex((i) => (i + 1) % count);
      }
      setLeft(remaining.current);
    }, 1000);
    return () => clearInterval(timer);
  }, [count]);

  const go = (delta: number, to?: number) => {
    if (!count) return;
    direction.current = delta;
    setIndex((i) => (to ?? i + delta + count) % count);
    remaining.current = CYCLE;
    setLeft(CYCLE);
  };

  const at = count ? index % count : 0;
  const task = list[at];
  const late = !!task?.due_on && (task.due_at ? new Date(task.due_at).getTime() < now : task.due_on < today);
  const countdown = task ? formatTaskCountdown(task, now) : null;
  const alert = task ? getTaskAlert(task) : null;
  const course = task ? task.course || parseTaskLinks(task.notes || '').course : '';
  const notes = task ? parseTaskLinks(task.notes || '').cleanNotes : '';
  const dueTime = task?.due_at ? new Date(task.due_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !prefs.time24 }) : '';
  const dueDay = !task?.due_on ? 'No deadline'
    : task.due_on === today ? 'Due today'
    : 'Due ' + new Date(task.due_on + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const motionOn = prefs.motion;

  return (
    <section className="upcoming-task-panel task-cycle" aria-roledescription="carousel" aria-label="Upcoming tasks"
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHeld(true); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHeld(false); }}
      onFocus={() => setHeld(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false); }}>
      <div className="overview-label">
        <h2>{task ? (late ? 'Overdue task' : 'Upcoming tasks') : 'Upcoming tasks'}</h2>
        {count > 1 ? (
          <div className="task-cycle-controls">
            <button type="button" className="task-cycle-ring" onClick={() => setPaused((p) => !p)}
              aria-label={paused ? 'Resume cycling tasks' : `Pause cycling tasks. Next task in ${left} seconds`}
              title={paused ? 'Resume' : 'Pause'}>
              <svg viewBox="0 0 32 32" aria-hidden="true">
                <circle cx="16" cy="16" r="13" className="task-cycle-track" />
                <circle cx="16" cy="16" r="13" className="task-cycle-fill" strokeDasharray={RING}
                  strokeDashoffset={RING * (1 - left / CYCLE)} style={{ transition: motionOn ? 'stroke-dashoffset .9s linear' : 'none' }} />
              </svg>
              {paused ? <Icon name="pause" size={11} /> : <b>{left}</b>}
            </button>
            <button type="button" onClick={() => go(-1)} aria-label="Previous task" title="Previous task"><Icon name="chevronLeft" size={16} /></button>
            <button type="button" onClick={() => go(1)} aria-label="Next task" title="Next task"><Icon name="chevronRight" size={16} /></button>
          </div>
        ) : <span>{task ? dueDay : 'All clear'}</span>}
      </div>

      <div className="task-cycle-stage">
        <AnimatePresence mode="wait" initial={false} custom={direction.current}>
          <motion.div key={task?.id ?? 'empty'} className="upcoming-task-copy"
            custom={direction.current}
            initial={motionOn ? { opacity: 0, x: 26 * direction.current } : false}
            animate={{ opacity: 1, x: 0 }}
            exit={motionOn ? { opacity: 0, x: -26 * direction.current } : { opacity: 0 }}
            transition={{ duration: motionOn ? 0.26 : 0, ease: [0.22, 1, 0.36, 1] }}
            drag={count > 1 ? 'x' : false} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.2}
            onDragEnd={(_e, info) => {
              if (info.offset.x < -40 || info.velocity.x < -300) go(1);
              else if (info.offset.x > 40 || info.velocity.x > 300) go(-1);
            }}>
            {task ? <>
              <div className="task-cycle-tags">
                {course && <span><Icon name="book" size={12} />{course}</span>}
                {task.priority && <span className={'is-' + task.priority}>{PRIORITY[task.priority]}</span>}
                <span className={late ? 'is-late' : undefined}><Icon name="clock" size={12} />{dueDay}{dueTime ? ' · ' + dueTime : ''}</span>
                {countdown && <span className={'task-cycle-countdown' + (countdown.isOverdue || alert?.tier === 'red' ? ' is-late' : '')}>{countdown.text}</span>}
              </div>
              <h3>{task.title}</h3>
              <p>{notes ? notes.slice(0, 140) : 'One thing at a time is still moving forward.'}</p>
            </> : <>
              <h3>Room for something new.</h3>
              <p>Add a task whenever you’re ready.</p>
            </>}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="upcoming-task-actions">
        {task ? <>
          <button onClick={() => A.complete.mutate({ id: task.id, done: true })}><Icon name="check" size={17} />Mark done</button>
          {count > 1 && (
            <div className="task-cycle-dots" role="group" aria-label="Choose a task">
              {list.map((t, i) => (
                <button key={t.id} type="button" aria-label={`Task ${i + 1} of ${count}: ${t.title}`} aria-current={i === at ? 'true' : undefined}
                  onClick={() => go(i >= at ? 1 : -1, i)} />
              ))}
            </div>
          )}
          <Link href={'/tasks/?detail=' + task.id} aria-label="Open task"><Icon name="arrowR" size={19} /></Link>
        </> : <Link href="/tasks/">Add a task<Icon name="plus" size={19} /></Link>}
      </div>
    </section>
  );
}
