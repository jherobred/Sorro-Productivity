'use client';

/**
 * What the roster looks like before anyone is in it.
 *
 * Not a loading skeleton — the query has already answered, and the answer was
 * nobody. "Nobody yet." on its own line says that and nothing else; three
 * empty rows say it while also showing the shape of the thing you are about to
 * make, which is the part a first-time screen has to get across.
 *
 * They fade back so the row nearest the button reads as the next one and the
 * ones behind it as depth rather than as content that failed to load. No
 * names, no faces: a placeholder with a fake name is a row people try to click.
 */

export function GhostRoster({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 11px', borderRadius: 11,
          // 1, then 0.55, then 0.3 — far enough apart that the order reads.
          opacity: 1 - i * 0.35,
        }}>
          <span style={{
            width: 32, height: 32, flex: 'none', borderRadius: '50%',
            background: 'var(--sk2, rgba(170,166,210,.13))',
            border: '1px dashed var(--line2)',
          }} />
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ height: 8, width: `${64 - i * 12}%`, borderRadius: 4, background: 'var(--sk2, rgba(170,166,210,.13))' }} />
            <span style={{ height: 7, width: `${38 - i * 8}%`, borderRadius: 4, background: 'var(--sk1, rgba(170,166,210,.06))' }} />
          </span>
        </div>
      ))}
    </div>
  );
}
