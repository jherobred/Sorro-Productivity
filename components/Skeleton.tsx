'use client';

/**
 * The shape of a page, before its data arrives.
 *
 * Every screen in this app read `const { data = [] } = useX()`, which means a
 * page that has not loaded yet and a page with nothing in it are the same
 * render: an empty screen. So a cold start looked like "you have no tasks",
 * then flashed to a full list a moment later. That flash is most of what
 * "slow" meant here — the app was not usually waiting long, it was showing
 * you the wrong answer while it waited.
 *
 * **These match the real layouts, not a generic grey box.** Same card radii,
 * same paddings, same row heights, same column counts, so the content lands
 * *into* the outline instead of replacing it, and nothing reflows on arrival.
 * A skeleton whose proportions are wrong is a second layout shift with extra
 * steps.
 *
 * `.skq` in globals.css does the shimmer, and it already respects the motion
 * preference — a person who asked the app to hold still gets a still outline.
 *
 * They are all gated on *pending*, never on empty: once the persisted cache
 * has been restored there is data on the very first frame and none of this is
 * drawn at all.
 */

/** One shimmering block. Everything below is made of these. */
export function Bar({ w = '100%', h = 12, r = 6, style }: {
  w?: number | string;
  h?: number | string;
  r?: number | string;
  style?: React.CSSProperties;
}) {
  return <span className="skq" aria-hidden style={{ display: 'block', width: w, height: h, borderRadius: r, ...style }} />;
}

const CARD: React.CSSProperties = {
  background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--sh)', border: '1px solid var(--line)',
};

/** Wraps any of these so a screen reader says "loading" once, not fifty times. */
function Frame({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} style={style}>
      <span className="sronly">{label}</span>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ lists */

/**
 * Tasks: three tinted group cards, each with a header row and a few task rows.
 * The tints are the real ones, so Overdue is already red before its count
 * lands and the eye is in the right place when it does.
 */
export function TasksSkeleton({ tints }: { tints: [string, string, string] }) {
  return (
    <Frame label="Loading your tasks">
      {tints.map((tint, g) => (
        <div key={tint} style={{
          ...CARD, padding: '14px 14px 6px', marginTop: g === 0 ? 12 : 12,
          border: `1px solid color-mix(in srgb, ${tint} 34%, transparent)`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 3, flex: 'none', background: tint }} />
            <Bar w={68} h={11} r={4} />
            <Bar w={26} h={16} r={7} />
            <span style={{ marginLeft: 'auto' }}><Bar w={72} h={10} r={4} /></span>
          </div>
          {Array.from({ length: 3 - g }).map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 2px' }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', border: '1.6px solid var(--line2)', flex: 'none' }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <Bar w={`${58 + ((i * 13) % 30)}%`} h={12} />
                <span style={{ display: 'block', height: 7 }} />
                <Bar w={90} h={7} r={4} />
              </span>
              <Bar w={44} h={9} r={4} />
            </div>
          ))}
        </div>
      ))}
    </Frame>
  );
}

/** Habits, money rows, notebooks, people — one card, evenly spaced rows. */
export function RowsSkeleton({ rows = 6, label, lead = 'square' }: {
  rows?: number;
  label: string;
  /** The thing at the start of each row. */
  lead?: 'square' | 'circle' | 'none';
}) {
  return (
    <Frame label={label} style={{ ...CARD, padding: '6px 14px', marginTop: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0',
          borderBottom: i === rows - 1 ? 'none' : '1px solid var(--line)',
        }}>
          {lead !== 'none' && <Bar w={32} h={32} r={lead === 'circle' ? '50%' : 10} style={{ flex: 'none' }} />}
          <span style={{ flex: 1, minWidth: 0 }}>
            <Bar w={`${44 + ((i * 17) % 34)}%`} h={12} />
            <span style={{ display: 'block', height: 7 }} />
            <Bar w={`${24 + ((i * 11) % 20)}%`} h={8} r={4} />
          </span>
          <Bar w={52} h={10} r={4} />
        </div>
      ))}
    </Frame>
  );
}

/* -------------------------------------------------------------------- feed */

/**
 * Community. One post outline per card: author line, title, picture, actions.
 * The picture block is 4:5 because that is the ratio MediaFrame stages every
 * feed image at, so the real photo drops into exactly this hole.
 */
export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <Frame label="Loading the feed" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Array.from({ length: count }).map((_, i) => (
        <article key={i} style={{ ...CARD, borderRadius: 18, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 13px 10px' }}>
            <Bar w={32} h={32} r="50%" style={{ flex: 'none' }} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <Bar w={104} h={11} />
              <span style={{ display: 'block', height: 6 }} />
              <Bar w={64} h={8} r={4} />
            </span>
            <Bar w={54} h={17} r={7} style={{ flex: 'none' }} />
          </div>

          <div style={{ padding: '0 13px 9px' }}>
            <Bar w={i % 2 ? '62%' : '84%'} h={15} r={5} />
          </div>

          {/* Every other card gets a picture, which is roughly what a feed
              looks like and stops three identical grey rectangles reading as
              one enormous one. */}
          {i % 2 === 0 && <Bar w="100%" h={0} r={0} style={{ aspectRatio: '4 / 5', maxHeight: 320 }} />}

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 13px 12px' }}>
            <Bar w={44} h={13} r={5} />
            <Bar w={38} h={13} r={5} />
            <Bar w={18} h={13} r={5} />
          </div>
        </article>
      ))}
    </Frame>
  );
}

/* ------------------------------------------------------------------ grids */

/**
 * Projects and Files: a bare grid of folder tiles, matching the real one —
 * no card behind each, because the real page dropped that on purpose.
 */
export function FolderGridSkeleton({ count = 8, phone, label }: { count?: number; phone: boolean; label: string }) {
  const size = phone ? 52 : 60;
  return (
    <Frame label={label} style={{
      display: 'grid', gridTemplateColumns: `repeat(auto-fill,minmax(${phone ? 104 : 124}px,1fr))`, gap: phone ? 6 : 10,
    }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
          padding: phone ? '10px 4px' : '12px 6px',
        }}>
          <Bar w={size} h={size * 0.82} r={12} />
          <Bar w={`${58 + ((i * 19) % 30)}%`} h={10} r={4} />
          <Bar w={28} h={8} r={4} />
        </div>
      ))}
    </Frame>
  );
}

/* --------------------------------------------------------------- calendar */

/** The week grid: a day header strip over a ruled body. */
export function CalendarSkeleton({ days = 7 }: { days?: number }) {
  return (
    <Frame label="Loading your calendar" style={{ ...CARD, overflow: 'hidden', marginTop: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `44px repeat(${days}, 1fr)`, borderBottom: '1px solid var(--line)' }}>
        <span />
        {Array.from({ length: days }).map((_, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 4px' }}>
            <Bar w={22} h={8} r={4} />
            <Bar w={26} h={18} r={8} />
          </div>
        ))}
      </div>

      {Array.from({ length: 8 }).map((_, row) => (
        <div key={row} style={{
          display: 'grid', gridTemplateColumns: `44px repeat(${days}, 1fr)`,
          height: 46, borderBottom: '1px solid var(--line)',
        }}>
          <div style={{ display: 'grid', placeItems: 'center' }}><Bar w={26} h={8} r={4} /></div>
          {Array.from({ length: days }).map((_, col) => (
            <div key={col} style={{ padding: 3 }}>
              {/* A scatter, not a full grid — a calendar is mostly empty and a
                  solid block of chips is not what is about to appear. */}
              {(row * 7 + col) % 5 === 0 && <Bar w="100%" h={40} r={7} />}
            </div>
          ))}
        </div>
      ))}
    </Frame>
  );
}

/* ------------------------------------------------------------ phone home */

/** The phone dashboard: up-next card, task rows, ring grid. */
export function PhoneHomeSkeleton() {
  return (
    <Frame label="Loading your day">
      <div style={{ ...CARD, display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px' }}>
        <span style={{ width: 3, alignSelf: 'stretch', minHeight: 34, borderRadius: 2, background: 'var(--line2)', flex: 'none' }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <Bar w={54} h={8} r={4} />
          <span style={{ display: 'block', height: 6 }} />
          <Bar w="72%" h={13} />
          <span style={{ display: 'block', height: 5 }} />
          <Bar w="40%" h={9} r={4} />
        </span>
      </div>

      <div style={{ height: 18 }} />
      <Bar w={148} h={15} r={5} />
      <div style={{ height: 8 }} />
      <Bar w={110} h={10} r={4} />
      <div style={{ height: 11 }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 13px',
            borderRadius: 14, background: 'var(--card)', boxShadow: 'var(--sh)',
          }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <Bar w={`${52 + ((i * 15) % 34)}%`} h={12} />
              <span style={{ display: 'block', height: 7 }} />
              <Bar w={44} h={5} r={3} />
            </span>
            <span style={{ width: 22, height: 22, flex: 'none', borderRadius: '50%', border: '1.6px solid var(--line2)' }} />
          </div>
        ))}
      </div>

      <div style={{ height: 18 }} />
      <div style={{ ...CARD, padding: '15px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(72px,1fr))', gap: '12px 6px' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <Bar w={56} h={56} r="50%" />
              <Bar w={38} h={7} r={4} />
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}
