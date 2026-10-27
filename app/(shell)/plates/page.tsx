'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { AnimatePresence, MotionConfig, animate, motion, useMotionValue, useTransform } from 'motion/react';
import { Icon, type IconName } from '@/components/Icon';
import { MemoryViewer } from '@/components/memories/Memories';
import type { CaptureDraft } from '@/components/memories/MemoryCapture';
import { removeMemory, useMemories, useMemoryPhotos, type Memory } from '@/lib/memories';
import { useBodyActions, useMealHistory, type Meal } from '@/lib/body';
import { useSignedUrls } from '@/lib/uploads';
import { usePrefs } from '@/lib/prefs';
import { toast } from '@/lib/toast';
import { ymd } from '@/lib/series';
import { currentSpot } from '@/lib/geo';
import { companionsOf, initials, lean, momentsOf, placeKey, placesOf, platesFrom, stampInk, type Companion, type Moment, type Place, type Plate } from '@/lib/plates';
import './plates.css';

const MemoryCapture = dynamic(() => import('@/components/memories/MemoryCapture').then((m) => m.MemoryCapture), { ssr: false });
const MemoryMap = dynamic(() => import('@/components/memories/MemoryMap').then((m) => m.MemoryMap), { ssr: false, loading: () => <div className="mem-map is-loading" /> });

type View = 'moment' | 'month' | 'list' | 'places' | 'people';
type Kind = 'all' | 'food' | 'drink' | 'notes';
type Day = { key: string; month: string; date: Date; moments: Moment[]; plates: Plate[] };
type Only = { kind: 'place' | 'person'; key: string; label: string };

const VIEWS: { id: View; label: string; icon: IconName }[] = [
  { id: 'moment', label: 'Moment', icon: 'layers' },
  { id: 'month', label: 'Month', icon: 'cal' },
  { id: 'list', label: 'List', icon: 'list' },
  { id: 'places', label: 'Places', icon: 'mapPin' },
  { id: 'people', label: 'Companions', icon: 'people' },
];
const KINDS: { id: Kind; label: string; icon: IconName }[] = [
  { id: 'all', label: 'All', icon: 'grid' },
  { id: 'food', label: 'Food', icon: 'food' },
  { id: 'drink', label: 'Drinks', icon: 'cup' },
  { id: 'notes', label: 'Notes', icon: 'text' },
];
const SPRING = { type: 'spring' as const, stiffness: 420, damping: 34 };
const POP = { type: 'spring' as const, stiffness: 360, damping: 16 };
const EASE = [0.22, 1, 0.36, 1] as const;
const HISTORY_DAYS = 400;

const monthOf = (at: number) => { const d = new Date(at); return `${d.getFullYear()}-${d.getMonth()}`; };
const longDate = (at: number) => new Date(at).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
const startOfDay = (at: number) => { const d = new Date(at); d.setHours(0, 0, 0, 0); return d.getTime(); };
function relative(at: number) {
  const days = Math.round((startOfDay(Date.now()) - startOfDay(at)) / 864e5);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function tally(plates: Plate[]) {
  const drinks = plates.filter((p) => p.drink).length;
  const food = plates.length - drinks;
  return [food && `${food} food`, drinks && `${drinks} ${drinks === 1 ? 'drink' : 'drinks'}`].filter(Boolean).join(' · ');
}
function daysOf(moments: Moment[]): Day[] {
  const out: Day[] = [];
  for (const m of moments) {
    const key = ymd(new Date(m.at));
    let day = out[out.length - 1];
    if (!day || day.key !== key) { day = { key, month: monthOf(m.at), date: new Date(m.at), moments: [], plates: [] }; out.push(day); }
    day.moments.push(m);
    day.plates.push(...m.plates);
  }
  return out;
}

/* ------------------------------------------------------------------ pieces */

function PlateArt({ drink }: { drink: boolean }) {
  return <span className="pd-art"><Icon name={drink ? 'cup' : 'food'} size={18} /></span>;
}

/** A plate as a die-cut sticker: round, white-edged, leaning a little, popping in when it scrolls into view. */
function Sticker({ plate, src, size, delay = 0, onView = true }: { plate: Plate; src?: string; size: number; delay?: number; onView?: boolean }) {
  const r = lean(plate.id, 8);
  const shown = { scale: 1, rotate: r, opacity: 1 };
  return (
    <motion.span className="pd-sticker" style={{ width: size, height: size }}
      initial={{ scale: 0.3, rotate: r - 32, opacity: 0 }} transition={{ ...POP, delay }}
      {...(onView ? { whileInView: shown, viewport: { once: true, margin: '-10px' } } : { animate: shown })}>
      {src ? <img src={src} alt="" draggable={false} loading="lazy" /> : <PlateArt drink={plate.drink} />}
    </motion.span>
  );
}

function Stack({ plates, photo, size = 44 }: { plates: Plate[]; photo: (p: Plate) => string | undefined; size?: number }) {
  return <span className="pd-stack">{plates.slice(0, 3).map((p, i) => <Sticker key={p.id} plate={p} src={photo(p)} size={size} delay={0.1 + i * 0.07} />)}</span>;
}

function Seg<T extends string>({ id, value, options, onChange }: { id: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="pd-subseg" role="tablist">
      {options.map(([v, label]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} onClick={() => onChange(v)}>
          {value === v && <motion.span layoutId={`pd-sub-${id}`} className="pd-subseg-pill" transition={SPRING} />}
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

function Empty({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <motion.div className="pd-empty" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
      <motion.span className="pd-empty-plate" initial={{ scale: 0.4, rotate: -40 }} animate={{ scale: 1, rotate: -8 }} transition={{ ...POP, delay: 0.1 }}><Icon name={icon} size={26} /></motion.span>
      <strong>{title}</strong>
      <p>{text}</p>
    </motion.div>
  );
}

function MonthHeader({ y, m, plates, nav }: { y: number; m: number; plates: Plate[]; nav?: { prev: () => void; next: () => void } }) {
  const inMonth = plates.filter((p) => monthOf(p.at) === `${y}-${m}`);
  const days = new Date(y, m + 1, 0).getDate();
  const filled = new Set(inMonth.map((p) => new Date(p.at).getDate()));
  const now = new Date();
  const today = now.getFullYear() === y && now.getMonth() === m ? now.getDate() : 0;
  return (
    <div className="pd-month">
      <div className="pd-month-title">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.h2 key={`${y}-${m}`} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }}>
            {new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </motion.h2>
        </AnimatePresence>
        <small>{inMonth.length} {inMonth.length === 1 ? 'save' : 'saves'} · {momentsOf(inMonth).length} moments</small>
      </div>
      {nav && (
        <div className="pd-month-nav">
          <button type="button" aria-label="Previous month" onClick={nav.prev}><Icon name="chevronLeft" size={16} /></button>
          <button type="button" aria-label="Next month" onClick={nav.next}><Icon name="chevronRight" size={16} /></button>
        </div>
      )}
      <div className="pd-dots" aria-hidden>
        {Array.from({ length: days }, (_, i) => (
          <motion.i key={`${y}-${m}-${i}`} className={(filled.has(i + 1) ? 'is-on' : '') + (i + 1 === today ? ' is-today' : '')}
            initial={{ scaleY: 0, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }} transition={{ ...SPRING, delay: i * 0.014 }} />
        ))}
      </div>
    </div>
  );
}

function MomentCard({ m, i, photo, time, onOpen }: { m: Moment; i: number; photo: (p: Plate) => string | undefined; time: (at: number) => string; onOpen: (m: Moment) => void }) {
  const plates = [...m.plates].reverse();
  const note = plates.map((p) => p.note).find(Boolean);
  return (
    <motion.article className="pd-card" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-24px' }} transition={{ duration: 0.5, ease: EASE, delay: Math.min(i, 3) * 0.06 }}>
      <button type="button" className="pd-card-hit" onClick={() => onOpen(m)} aria-label={`${longDate(m.at)}${m.place ? ` at ${m.place}` : ''}: ${plates.map((p) => p.name).join(', ')}`} />
      <header>
        <strong>{longDate(m.at)}{m.place ? ` · ${m.place}` : ''}</strong>
        {m.place && <span className="pd-mini" style={{ background: stampInk(placeKey(m.place)) }}>{initials(m.place)}</span>}
        <time>{time(m.at)}</time>
        <Icon name="chevR" size={14} />
      </header>
      <div className="pd-stickers">{plates.map((p, k) => <Sticker key={p.id} plate={p} src={photo(p)} size={64} delay={0.12 + k * 0.08} />)}</div>
      <footer>
        <span><Icon name="food" size={13} />{plates.map((p) => p.name).join(', ')}</span>
        <span className="pd-tally">{tally(plates)}</span>
      </footer>
      {note && <p className="pd-note">{note.split(/(@[\p{L}\p{N}_.'-]+)/u).map((part, k) => (k % 2 ? <b key={k}>{part.slice(1).replace(/_/g, ' ')}</b> : part))}</p>}
    </motion.article>
  );
}

function Timeline({ days, photo, time, onOpen }: { days: Day[]; photo: (p: Plate) => string | undefined; time: (at: number) => string; onOpen: (m: Moment) => void }) {
  return (
    <div className="pd-timeline">
      {days.map((d) => (
        <section key={d.key} className="pd-day" data-day={d.key} data-month={d.month} aria-label={d.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}>
          <div className="pd-rail" aria-hidden>
            <b>{d.date.getDate()}</b>
            <small>{d.date.toLocaleDateString(undefined, { weekday: 'short' })}</small>
            <span><Icon name="layers" size={11} />{d.plates.length}</span>
            <i />
          </div>
          <div className="pd-day-cards">{d.moments.map((m, i) => <MomentCard key={m.id} m={m} i={i} photo={photo} time={time} onOpen={onOpen} />)}</div>
        </section>
      ))}
    </div>
  );
}

function Calendar({ y, m, plates, photo, picked, onPick, mondayFirst }: { y: number; m: number; plates: Plate[]; photo: (p: Plate) => string | undefined; picked: string; onPick: (key: string) => void; mondayFirst: boolean }) {
  const lead = (new Date(y, m, 1).getDay() - (mondayFirst ? 1 : 0) + 7) % 7;
  const count = new Date(y, m + 1, 0).getDate();
  const byDay = new Map<number, Plate[]>();
  for (const p of plates) {
    if (monthOf(p.at) !== `${y}-${m}`) continue;
    const d = new Date(p.at).getDate();
    byDay.set(d, [...(byDay.get(d) ?? []), p]);
  }
  const today = ymd(new Date());
  const labels = mondayFirst ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return (
    <div className="pd-cal">
      <div className="pd-cal-week" aria-hidden>{labels.map((l, i) => <span key={i}>{l}</span>)}</div>
      <div className="pd-cal-grid">
        {Array.from({ length: lead }, (_, i) => <span key={`lead${i}`} />)}
        {Array.from({ length: count }, (_, i) => {
          const day = i + 1;
          const list = byDay.get(day) ?? [];
          const key = ymd(new Date(y, m, day));
          return (
            <button key={key} type="button" aria-pressed={key === picked}
              aria-label={`${new Date(y, m, day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}, ${list.length} saves`}
              className={'pd-cal-day' + (list.length ? ' has' : '') + (key === today ? ' is-today' : '') + (key === picked ? ' is-picked' : '')}
              onClick={() => onPick(key)}>
              <span className="pd-cal-n">{day}</span>
              {list[0] && <Sticker plate={list[0]} src={photo(list[0])} size={36} delay={0.08 + i * 0.016} onView={false} />}
              {list.length > 1 && <motion.b className="pd-more" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...POP, delay: 0.3 + i * 0.016 }}>+{list.length - 1}</motion.b>}
            </button>
          );
        })}
      </div>
      <footer><Icon name="cal" size={13} />{byDay.size} {byDay.size === 1 ? 'day' : 'days'} at the table</footer>
    </div>
  );
}

function PlateList({ days, photo, time, onOpen }: { days: Day[]; photo: (p: Plate) => string | undefined; time: (at: number) => string; onOpen: (p: Plate) => void }) {
  return (
    <div className="pd-list">
      {days.map((d) => (
        <section key={d.key} className="pd-list-day" data-day={d.key} data-month={d.month}>
          <h3><i />{d.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}<small>{d.plates.length} {d.plates.length === 1 ? 'save' : 'saves'}</small></h3>
          {[...d.plates].reverse().map((p, i) => (
            <motion.button key={p.id} type="button" className="pd-row" onClick={() => onOpen(p)}
              initial={{ opacity: 0, x: -14 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-20px' }} transition={{ duration: 0.45, ease: EASE, delay: Math.min(i, 4) * 0.05 }}>
              <Sticker plate={p} src={photo(p)} size={68} delay={0.1} />
              <span className="pd-row-text">
                <strong>{p.name}</strong>
                <span><Icon name={p.drink ? 'cup' : 'food'} size={12} />{p.drink ? 'Drink' : 'Food'} · {longDate(p.at)}{p.place ? ` · ${p.place}` : ''}</span>
                <span><Icon name="clock" size={12} />{time(p.at)}{p.people.length ? ` · with ${p.people.join(', ')}` : ''}</span>
              </span>
            </motion.button>
          ))}
        </section>
      ))}
    </div>
  );
}

function PlacesView({ places, photo, mapMemories, onPlace, onMemory }: { places: Place[]; photo: (p: Plate) => string | undefined; mapMemories: Memory[]; onPlace: (p: Place) => void; onMemory: (id: string) => void }) {
  const [sort, setSort] = useState<'visits' | 'latest' | 'near'>('visits');
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [big, setBig] = useState(false);
  const sorted = useMemo(() => {
    if (sort === 'latest') return [...places].sort((a, b) => b.last - a.last);
    if (sort === 'near' && here) {
      const far = (p: Place) => (p.lat === null || p.lng === null ? Infinity : Math.hypot(p.lat - here.lat, (p.lng - here.lng) * Math.cos((here.lat * Math.PI) / 180)));
      return [...places].sort((a, b) => far(a) - far(b));
    }
    return places;
  }, [places, sort, here]);
  const near = async () => {
    try { setHere(await currentSpot()); setSort('near'); } catch (e) { toast(e instanceof Error ? e.message : 'Could not find where you are.'); }
  };
  return (
    <>
      <motion.div className={'pd-map' + (big ? ' is-big' : '')} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }}>
        <MemoryMap memories={mapMemories} onOpen={(m) => onMemory(m.id)} />
        <button type="button" className="pd-enlarge" onClick={() => setBig((b) => !b)}><Icon name={big ? 'minimize' : 'expand'} size={13} />{big ? 'Smaller map' : 'Enlarge map'}</button>
      </motion.div>
      <Seg id="places" value={sort} options={[['visits', 'Most visited'], ['latest', 'Latest'], ['near', 'Nearby']]} onChange={(v) => (v === 'near' ? void near() : setSort(v))} />
      <div className="pd-rows">
        {sorted.map((p, i) => (
          <motion.button key={p.key} layout type="button" className="pd-place" onClick={() => onPlace(p)}
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ opacity: { delay: Math.min(i, 6) * 0.07 }, y: { delay: Math.min(i, 6) * 0.07, duration: 0.45, ease: EASE }, layout: SPRING }}>
            <Stack plates={p.plates} photo={photo} />
            <span className="pd-row-text">
              <strong>{p.name}</strong>
              <span><Icon name="layers" size={12} />{p.visits} {p.visits === 1 ? 'visit' : 'visits'}<Icon name="clock" size={12} />{relative(p.last)}</span>
              <span>Your usual · {p.usual}</span>
            </span>
            <Icon name="chevR" size={15} />
          </motion.button>
        ))}
        {!sorted.length && <Empty icon="mapPin" title="No places yet" text="Plates with a place become places here." />}
      </div>
    </>
  );
}

function PeopleView({ people, moments, photo, onPerson }: { people: Companion[]; moments: Moment[]; photo: (p: Plate) => string | undefined; onPerson: (c: Companion) => void }) {
  const [sort, setSort] = useState<'shared' | 'latest' | 'az'>('shared');
  const tables = moments.filter((m) => m.plates.some((p) => p.people.length)).length;
  const ring = people.slice(0, 6);
  const center = ring[0]?.plates[0];
  const sorted = sort === 'latest' ? [...people].sort((a, b) => b.last - a.last) : sort === 'az' ? [...people].sort((a, b) => a.name.localeCompare(b.name)) : people;
  if (!people.length) return <Empty icon="people" title="Nobody at the table yet" text="Write @name in a plate's caption and they join your table here." />;
  return (
    <>
      <p className="pd-caps">{people.length} {people.length === 1 ? 'companion' : 'companions'} · {tables} {tables === 1 ? 'table' : 'tables'} shared</p>
      <div className="pd-orbit">
        <motion.div className="pd-table" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...POP, delay: 0.05 }}>
          {center && <Sticker plate={center} src={photo(center)} size={96} onView={false} delay={0.18} />}
        </motion.div>
        {ring.map((c, i) => {
          const a = ((-90 + i * 60) * Math.PI) / 180;
          return (
            <motion.button key={c.key} type="button" className={'pd-buddy' + (i === 0 ? ' is-first' : '')} onClick={() => onPerson(c)}
              initial={{ x: 0, y: 0, scale: 0.2, opacity: 0 }} animate={{ x: Math.cos(a) * 128, y: Math.sin(a) * 108, scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 150, damping: 14, delay: 0.22 + i * 0.08 }}>
              <span className="pd-face">{c.name.charAt(0)}</span>
              <small>{c.name}</small>
            </motion.button>
          );
        })}
      </div>
      <Seg id="people" value={sort} options={[['shared', 'Most shared'], ['latest', 'Latest'], ['az', 'A–Z']]} onChange={setSort} />
      <div className="pd-rows">
        {sorted.map((c, i) => (
          <motion.button key={c.key} layout type="button" className="pd-person" onClick={() => onPerson(c)}
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ opacity: { delay: 0.5 + Math.min(i, 6) * 0.07 }, y: { delay: 0.5 + Math.min(i, 6) * 0.07, duration: 0.45, ease: EASE }, layout: SPRING }}>
            <span className="pd-face">{c.name.charAt(0)}</span>
            <span className="pd-row-text">
              <strong>{c.name}</strong>
              {c.note && <em>{c.note}</em>}
              <span>{c.tables} {c.tables === 1 ? 'time' : 'times'} · last {relative(c.last).toLowerCase()}</span>
            </span>
            <Stack plates={c.plates} photo={photo} size={40} />
          </motion.button>
        ))}
      </div>
    </>
  );
}

function Postmark({ year }: { year: number }) {
  return (
    <svg className="pd-postmark" viewBox="0 0 120 64" aria-hidden>
      <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="32" cy="32" r="19" fill="none" stroke="currentColor" strokeWidth="1" />
      <text x="32" y="36" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">{year}</text>
      {[20, 28, 36, 44].map((y) => <path key={y} d={`M58 ${y}q7-4 14 0t14 0t14 0t14 0`} fill="none" stroke="currentColor" strokeWidth="1.6" />)}
    </svg>
  );
}

/** A place as a postage stamp: perforated paper, the place's ink, its letters, and how many visits. */
function Stamp({ place, size = 'md', postmark = false }: { place: Place; size?: 'sm' | 'md' | 'lg'; postmark?: boolean }) {
  return (
    <span className={'pd-stamp is-' + size} style={{ '--ink': stampInk(place.key) } as React.CSSProperties}>
      <span className="pd-stamp-paper">
        <span className="pd-stamp-face"><b>{initials(place.name)}</b><small>{place.name}</small></span>
      </span>
      {place.visits > 1 && size !== 'sm' && <em>{place.visits}×</em>}
      {postmark && <Postmark year={new Date(place.last).getFullYear()} />}
    </span>
  );
}

function Stat({ n, label, delay }: { n: number; label: string; delay: number }) {
  const { prefs } = usePrefs();
  const value = useMotionValue(0);
  const text = useTransform(value, (v) => Math.round(v).toLocaleString());
  useEffect(() => {
    if (prefs.motion === false) { value.set(n); return; }
    const c = animate(value, n, { duration: 1.2, delay, ease: EASE });
    return () => c.stop();
  }, [n, value, delay, prefs.motion]);
  return (
    <motion.div className="pd-stat" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.45, ease: EASE }}>
      <motion.b>{text}</motion.b><span>{label}</span>
    </motion.div>
  );
}

function StampsView({ places, photo, mapMemories, onPlace, onMemory }: { places: Place[]; photo: (p: Plate) => string | undefined; mapMemories: Memory[]; onPlace: (p: Place) => void; onMemory: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'visits' | 'latest' | 'az'>('visits');
  const regular = places[0];
  const newest = [...places].sort((a, b) => b.first - a.first)[0];
  const year = new Date().getFullYear();
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = places.filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.plates.some((x) => x.name.toLowerCase().includes(needle)));
    if (sort === 'az') return [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'latest') return [...list].sort((a, b) => b.last - a.last);
    return list;
  }, [places, q, sort]);
  const intro = (delay: number) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.5, ease: EASE } });
  return (
    <div className="pd-stamps">
      <motion.p className="pd-caps" {...intro(0)}>{places.length} {places.length === 1 ? 'stamp' : 'stamps'} · {places.filter((p) => new Date(p.first).getFullYear() === year).length} new this year</motion.p>
      <motion.h2 className="pd-big" {...intro(0.05)}>Stamps</motion.h2>
      <motion.p className="pd-lede" {...intro(0.1)}>Every place that fed you, kept as a stamp. Go back and it counts another visit.</motion.p>
      {!places.length && <Empty icon="mapPin" title="No stamps yet" text="Add a place when you keep a plate and it becomes your first stamp." />}
      {regular && (
        <motion.button type="button" className="pd-regular" onClick={() => onPlace(regular)} {...intro(0.15)}>
          <motion.span className="pd-regular-stamp" initial={{ rotate: -28, scale: 0.5, opacity: 0 }} animate={{ rotate: -6, scale: 1, opacity: 1 }} transition={{ ...POP, delay: 0.3 }}>
            <Stamp place={regular} size="lg" postmark />
          </motion.span>
          <span className="pd-row-text">
            <small>Your regular</small>
            <strong>{regular.name}</strong>
            <span>{regular.visits} {regular.visits === 1 ? 'visit' : 'visits'} · since {new Date(regular.first).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
            <Stack plates={regular.plates} photo={photo} size={40} />
          </span>
        </motion.button>
      )}
      {places.length > 0 && (
        <div className="pd-stats">
          <Stat n={places.reduce((n, p) => n + p.visits, 0)} label="Visits" delay={0.25} />
          <Stat n={places.filter((p) => p.visits >= 3).length} label="Regulars" delay={0.32} />
          <Stat n={places.filter((p) => p.visits === 1).length} label="Tried once" delay={0.39} />
        </div>
      )}
      {newest && newest !== regular && (
        <motion.button type="button" className="pd-newest" onClick={() => onPlace(newest)} {...intro(0.35)}>
          <Stamp place={newest} size="sm" />
          <span className="pd-row-text">
            <small>Newest stamp</small>
            <strong>{newest.name}</strong>
            <span>{newest.visits} {newest.visits === 1 ? 'visit' : 'visits'} · {new Date(newest.first).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </span>
        </motion.button>
      )}
      {places.length > 0 && (
        <>
          <motion.div className="pd-map" {...intro(0.4)}><MemoryMap memories={mapMemories} onOpen={(m) => onMemory(m.id)} /></motion.div>
          <label className="pd-search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stamps or dishes" aria-label="Search stamps or dishes" /></label>
          <Seg id="stamps" value={sort} options={[['visits', 'Most visited'], ['latest', 'Latest'], ['az', 'A–Z']]} onChange={setSort} />
          <div className="pd-stamp-grid">
            <AnimatePresence mode="popLayout">
              {shown.map((p, i) => (
                <motion.button key={p.key} layout type="button" className="pd-stamp-cell" onClick={() => onPlace(p)}
                  initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ ...POP, delay: Math.min(i * 0.05, 0.45), layout: SPRING }}>
                  <motion.span initial={{ rotate: lean(p.key, 5) - 20 }} animate={{ rotate: lean(p.key, 5) }} transition={{ ...POP, delay: Math.min(i * 0.05, 0.45) }}><Stamp place={p} /></motion.span>
                  <strong>{p.name}</strong>
                  <small>{relative(p.last)}</small>
                </motion.button>
              ))}
            </AnimatePresence>
            {!shown.length && <p className="pd-quiet">No stamp matches “{q}”.</p>}
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- page */

/**
 * Plate diary: what you ate, where and with whom, as a scrapbook. Reads meal
 * memories and Fuel's meals (lib/plates.ts) and adds nothing to the schema;
 * the camera button keeps a plate the same way Fuel does.
 */
export default function PlateDiaryPage() {
  const router = useRouter();
  const { prefs } = usePrefs();
  const A = useBodyActions();
  const { list: memories, ready } = useMemories(['meal']);
  const { data: meals = [], isLoading } = useMealHistory(HISTORY_DAYS);
  const [tab, setTab] = useState<'table' | 'stamps'>('table');
  const [view, setView] = useState<View>('moment');
  const [kind, setKind] = useState<Kind>('all');
  const [only, setOnly] = useState<Only | null>(null);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);
  const [capture, setCapture] = useState(false);
  const [cal, setCal] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [picked, setPicked] = useState(() => ymd(new Date()));
  const [focus, setFocus] = useState<string | null>(null);
  const headRef = useRef<HTMLDivElement>(null);

  const plates = useMemo(() => platesFrom(memories, meals), [memories, meals]);
  const memPhotos = useMemoryPhotos(memories);
  const stored = plates.filter((p) => p.art && !p.art.startsWith('/'));
  const kept = stored.filter((p) => p.art!.includes('/memories/img/'));
  const older = stored.filter((p) => !p.art!.includes('/memories/img/'));
  const keptUrls = useSignedUrls('bd-files', kept.map((p) => p.art!));
  const olderUrls = useSignedUrls('bd-feed', older.map((p) => p.art!));
  const photos: Record<string, string> = {};
  for (const p of plates) {
    if (p.memoryId && memPhotos[p.memoryId]) photos[p.id] = memPhotos[p.memoryId];
    else if (p.art?.startsWith('/')) photos[p.id] = p.art;
  }
  kept.forEach((p, i) => { if (keptUrls[i] && !photos[p.id]) photos[p.id] = keptUrls[i]!; });
  older.forEach((p, i) => { if (olderUrls[i] && !photos[p.id]) photos[p.id] = olderUrls[i]!; });
  const photo = (p: Plate) => photos[p.id];
  const time = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: !prefs.time24 });

  const needle = q.trim().toLowerCase();
  const filtered = useMemo(() => plates.filter((p) => {
    if (only?.kind === 'place' && placeKey(p.place) !== only.key) return false;
    if (only?.kind === 'person' && !p.people.some((x) => x.toLowerCase() === only.key)) return false;
    return !needle || [p.name, p.note, p.place, ...p.people].some((s) => s.toLowerCase().includes(needle));
  }), [plates, only, needle]);
  const kinded = kind === 'all' ? filtered : filtered.filter((p) => (kind === 'drink' ? p.drink : kind === 'food' ? !p.drink : !!p.note));
  const shownPlates = view === 'month' || view === 'list' ? kinded : filtered;
  const moments = useMemo(() => momentsOf(shownPlates), [shownPlates]);
  const days = useMemo(() => daysOf(moments), [moments]);
  const allMoments = useMemo(() => momentsOf(filtered), [filtered]);
  const places = useMemo(() => placesOf(allMoments), [allMoments]);
  const people = useMemo(() => companionsOf(allMoments), [allMoments]);
  const plateMemories = useMemo(() => {
    const ids = new Set(filtered.map((p) => p.memoryId).filter(Boolean));
    return memories.filter((m) => ids.has(m.id));
  }, [memories, filtered]);
  const nameOf = useMemo(() => new Map(plates.filter((p) => p.memoryId).map((p) => [p.memoryId!, p.name])), [plates]);

  // The month in the header follows the day at the top of the scroll.
  useEffect(() => {
    if (tab !== 'table' || (view !== 'moment' && view !== 'list')) return;
    const main = document.getElementById('workspace');
    if (!main) return;
    let frame = 0;
    const read = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const line = (headRef.current?.getBoundingClientRect().bottom ?? 0) + 6;
        for (const s of main.querySelectorAll<HTMLElement>('[data-day]')) {
          if (s.getBoundingClientRect().bottom > line) { setFocus(s.dataset.month ?? null); return; }
        }
      });
    };
    read();
    main.addEventListener('scroll', read, { passive: true });
    return () => { main.removeEventListener('scroll', read); cancelAnimationFrame(frame); };
  }, [tab, view, days]);

  const top = () => document.getElementById('workspace')?.scrollTo({ top: 0, behavior: 'auto' });
  const go = (next: View) => { setView(next); setTab('table'); top(); };
  const open = (m: Moment) => {
    const first = [...m.plates].reverse().find((p) => p.memoryId);
    if (first) setViewing(first.memoryId);
    else router.push('/fuel/');
  };
  const openPlate = (p: Plate) => (p.memoryId ? setViewing(p.memoryId) : router.push('/fuel/'));
  const showPlace = (p: Place) => { setOnly({ kind: 'place', key: p.key, label: p.name }); go('moment'); };
  const showPerson = (c: Companion) => { setOnly({ kind: 'person', key: c.key, label: c.name }); go('moment'); };

  const commitMeal = (d: CaptureDraft): string | null => {
    if (!d.meal) return null;
    const meal: Meal = {
      id: crypto.randomUUID(), on_date: ymd(new Date(d.at)), name: d.meal.name, slot: d.meal.slot,
      kcal: d.meal.kcal, protein: d.meal.protein, carbs: d.meal.carbs, fat: d.meal.fat,
      photo_path: d.photoPath, place: d.place || null,
    };
    A.addMeal.mutate(meal);
    toast(`${meal.name} kept`, () => { A.delMeal.mutate({ id: meal.id }); void removeMemory(d.memoryId); }, { tone: 'success', icon: 'food' });
    return `meal:${meal.id}`;
  };

  const now = new Date();
  const [fy, fm] = (focus ?? days[0]?.month ?? `${now.getFullYear()}-${now.getMonth()}`).split('-').map(Number);
  const pickedPlates = kinded.filter((p) => ymd(new Date(p.at)) === picked);
  const pickedMoments = momentsOf(pickedPlates);
  const loading = !ready || isLoading;
  const stepMonth = (by: number) => setCal(({ y, m }) => { const d = new Date(y, m + by, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  return (
    <MotionConfig reducedMotion={prefs.motion === false ? 'always' : 'never'}>
      <div className="pd">
        <div className="pd-head" ref={headRef}>
          <header className="pd-top">
            <div className="pd-brand">
              <svg className="pd-logo" viewBox="0 0 40 32" aria-hidden>
                <path d="M2 11h6M1 16h7M2 21h6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                <circle cx="25" cy="16" r="13" fill="currentColor" />
                <circle cx="25" cy="16" r="8" fill="none" stroke="var(--pd-bg)" strokeWidth="2.2" />
              </svg>
              <div><strong>PlateDiary.</strong><small>Taste, then remember</small></div>
            </div>
            <div className="pd-tools">
              <button type="button" className="pd-round" aria-label="Search plates" aria-pressed={searching} onClick={() => { setSearching((s) => !s); if (searching) setQ(''); }}><Icon name={searching ? 'close' : 'search'} size={17} /></button>
              <button type="button" className="pd-round" aria-label="Month view" onClick={() => go('month')}><Icon name="grid" size={17} /></button>
            </div>
          </header>

          <AnimatePresence initial={false}>
            {searching && (
              <motion.label className="pd-search is-head" initial={{ height: 0, opacity: 0 }} animate={{ height: 44, opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                <Icon name="search" size={16} />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dishes, places, people" aria-label="Search plates" />
              </motion.label>
            )}
          </AnimatePresence>

          {tab === 'table' && (
            <nav className="pd-seg" aria-label="Diary views">
              {VIEWS.map((v) => {
                const on = view === v.id;
                return (
                  <motion.button key={v.id} layout type="button" className={'pd-seg-btn' + (on ? ' is-on' : '')} aria-pressed={on} aria-label={v.label} onClick={() => go(v.id)} transition={SPRING}>
                    {on && <motion.span layoutId="pd-seg-pill" className="pd-seg-pill" transition={SPRING} />}
                    <motion.span layout="position" className="pd-seg-in" transition={SPRING}>
                      <Icon name={v.icon} size={18} />
                      {on && <motion.span className="pd-seg-label" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08, duration: 0.25 }}>{v.label}</motion.span>}
                    </motion.span>
                  </motion.button>
                );
              })}
            </nav>
          )}

          <AnimatePresence initial={false}>
            {only && (
              <motion.button type="button" className="pd-only" onClick={() => setOnly(null)} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} aria-label={`Showing ${only.label}. Show everything`}>
                <Icon name={only.kind === 'place' ? 'mapPin' : 'people'} size={13} />{only.label}<Icon name="close" size={12} />
              </motion.button>
            )}
          </AnimatePresence>

          {tab === 'table' && (view === 'month' || view === 'list') && (
            <div className="pd-kinds" role="group" aria-label="Show">
              {KINDS.map((k) => (
                <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
                  {kind === k.id && <motion.span layoutId="pd-kind" className="pd-kind-pill" transition={SPRING} />}
                  <span><Icon name={k.icon} size={14} />{k.label}</span>
                </button>
              ))}
            </div>
          )}

          {tab === 'table' && (view === 'moment' || view === 'list') && days.length > 0 && <MonthHeader y={fy} m={fm} plates={shownPlates} />}
          {tab === 'table' && view === 'month' && <MonthHeader y={cal.y} m={cal.m} plates={kinded} nav={{ prev: () => stepMonth(-1), next: () => stepMonth(1) }} />}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab === 'stamps' ? 'stamps' : view} className="pd-body"
            initial={{ opacity: 0, x: tab === 'stamps' ? 28 : 0, y: tab === 'stamps' ? 0 : 12 }} animate={{ opacity: 1, x: 0, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: EASE }}>
            {tab === 'stamps' ? (
              <StampsView places={places} photo={photo} mapMemories={plateMemories} onPlace={showPlace} onMemory={setViewing} />
            ) : loading && !plates.length ? (
              <div className="pd-loading" role="status"><span /><span /><span /></div>
            ) : view === 'moment' ? (
              days.length ? <Timeline days={days} photo={photo} time={time} onOpen={open} />
                : <Empty icon="food" title={plates.length ? 'Nothing matches' : 'Your table is empty'} text={plates.length ? 'Try another search, or clear the filter above.' : 'Tap the camera to keep your first plate. Meals you log in Fuel land here too.'} />
            ) : view === 'month' ? (
              <>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={`${cal.y}-${cal.m}`} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.28, ease: EASE }}>
                    <Calendar y={cal.y} m={cal.m} plates={kinded} photo={photo} picked={picked} onPick={setPicked} mondayFirst={prefs.weekStart !== 'sun'} />
                  </motion.div>
                </AnimatePresence>
                <div className="pd-picked">
                  <h3><i />{new Date(`${picked}T12:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}<small>{pickedPlates.length} {pickedPlates.length === 1 ? 'save' : 'saves'} · {pickedMoments.length} {pickedMoments.length === 1 ? 'moment' : 'moments'}</small></h3>
                  {pickedMoments.map((m, i) => <MomentCard key={m.id} m={m} i={i} photo={photo} time={time} onOpen={open} />)}
                </div>
              </>
            ) : view === 'list' ? (
              days.length ? <PlateList days={days} photo={photo} time={time} onOpen={openPlate} />
                : <Empty icon="list" title="Nothing here" text="No plates match this filter." />
            ) : view === 'places' ? (
              <PlacesView places={places} photo={photo} mapMemories={plateMemories} onPlace={showPlace} onMemory={setViewing} />
            ) : (
              <PeopleView people={people} moments={allMoments} photo={photo} onPerson={showPerson} />
            )}
          </motion.div>
        </AnimatePresence>

        <div className="pd-dock">
          <nav className="pd-tabs" aria-label="Plate diary sections">
            {([['table', 'Table', 'home'], ['stamps', 'Stamps', 'bookmark']] as const).map(([id, label, icon]) => (
              <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); top(); }}>
                {tab === id && <motion.span layoutId="pd-tab" className="pd-tab-pill" transition={SPRING} />}
                <span className="pd-tab-in"><Icon name={icon} size={20} /><small>{label}</small></span>
              </button>
            ))}
          </nav>
          <motion.button type="button" className="pd-fab" aria-label="Keep a plate" title="Keep a plate" whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.9 }} onClick={() => setCapture(true)}>
            <Icon name="camera" size={22} />
          </motion.button>
        </div>
      </div>

      {viewing && plateMemories.some((m) => m.id === viewing) && (
        <MemoryViewer memories={plateMemories} id={viewing} onChange={setViewing} onClose={() => setViewing(null)} describe={(m) => nameOf.get(m.id) ?? null} />
      )}
      {capture && <MemoryCapture mode="meal" initialKind="meal" kinds={['meal']} title="Keep a plate" onClose={() => setCapture(false)} onCommit={commitMeal} />}
    </MotionConfig>
  );
}
