'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useLayout } from '@/lib/useLayout';
import { useOverlayBack } from '@/lib/nav';
import { useProfiles, displayOf, type Person } from '@/lib/people';

/**
 * Who do you want to talk to.
 *
 * Messaging used to answer that with `ask('Message who?')` — a text box that
 * wanted a handle typed exactly, matched it case-insensitively, and said "No
 * one called “jaz”" when you got it wrong. Nobody knows their friends' handles;
 * they know their faces and roughly their names. `bd_profiles` is world-
 * readable by design, so the list has always been available — it just was not
 * being shown.
 *
 * One component for all three cases, because they are the same question:
 * start a chat (pick one), make a group (pick several, name it), add someone to
 * a group (pick several, no name). `multi` and `askName` decide which.
 */
export function PeoplePicker({
  title, me, exclude = [], multi = false, askName = false, confirmLabel = 'Start', onClose, onPick,
}: {
  title: string;
  me: string;
  /** Ids already in the conversation — shown, greyed, and not selectable. */
  exclude?: string[];
  multi?: boolean;
  askName?: boolean;
  confirmLabel?: string;
  onClose: () => void;
  onPick: (ids: string[], name: string) => void;
}) {
  const { phone } = useLayout();
  const { data: profiles = {} } = useProfiles();
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [name, setName] = useState('');
  useOverlayBack(true, onClose);

  const already = useMemo(() => new Set([me, ...exclude]), [me, exclude]);

  const people = useMemo(() => {
    const needle = q.trim().replace(/^@/, '').toLowerCase();
    return Object.values(profiles)
      .filter((p) => p.user_id !== me)
      // Search both, because you may remember either half.
      .filter((p) => !needle
        || (p.handle ?? '').toLowerCase().includes(needle)
        || (p.name ?? '').toLowerCase().includes(needle))
      .sort((a, b) => (a.name || a.handle || '').localeCompare(b.name || b.handle || ''));
  }, [profiles, q, me]);

  const toggle = (id: string) => {
    if (already.has(id)) return;
    if (!multi) { onPick([id], ''); return; }
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  };

  const canGo = chosen.length > 0 && (!askName || name.trim().length > 0);

  const body = (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: phone ? 'flex-end' : 'center', justifyContent: 'center', padding: phone ? 0 : 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}
        className="k-bloom"
        style={{
          width: 420, maxWidth: '100%', maxHeight: phone ? '86dvh' : '78dvh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--card)', border: '1px solid var(--line2)',
          borderRadius: phone ? '18px 18px 0 0' : 18, boxShadow: 'var(--shl)', overflow: 'hidden',
        }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 15px 11px', flex: 'none' }}>
          <Icon name="people" size={16} color="var(--accTx)" />
          <h2 style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.02em', flex: 1 }}>{title}</h2>
          <button onClick={onClose} className="hov k-squish" aria-label="Close"
            style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
            <Icon name="close" size={14} color="var(--tx2)" />
          </button>
        </div>

        {askName && (
          <div style={{ padding: '0 15px 10px', flex: 'none' }}>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
              placeholder="Name the group" aria-label="Group name" style={FIELD} />
          </div>
        )}

        <div style={{ padding: '0 15px 10px', flex: 'none', position: 'relative' }}>
          <Icon name="search" size={14} color="var(--tx3)"
            style={{ position: 'absolute', left: 26, top: 12, pointerEvents: 'none' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus={!askName}
            placeholder="Search by name or handle" aria-label="Search people"
            style={{ ...FIELD, paddingLeft: 34 }} />
        </div>

        {multi && chosen.length > 0 && (
          <div className="hbar" style={{ display: 'flex', gap: 6, padding: '0 15px 10px', overflowX: 'auto', flex: 'none' }}>
            {chosen.map((id) => {
              const who = displayOf(profiles, id, me);
              return (
                <button key={id} onClick={() => toggle(id)} className="k-squish" aria-label={`Remove ${who.label}`}
                  style={{
                    flex: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 9px 4px 4px',
                    borderRadius: 999, border: '1px solid var(--line2)', background: 'var(--card2)',
                    fontSize: 11, fontWeight: 700, color: 'var(--tx2)',
                  }}>
                  <Disc who={who} size={20} />
                  {who.label}
                  <Icon name="close" size={10} color="var(--tx3)" />
                </button>
              );
            })}
          </div>
        )}

        <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 9px 8px' }}>
          {people.length === 0 && (
            <p style={{ fontSize: 11.5, color: 'var(--tx3)', textAlign: 'center', padding: '26px 14px', lineHeight: 1.7 }}>
              {q ? `Nobody matching “${q}”.` : 'Nobody else here yet.'}
            </p>
          )}

          {people.map((p) => {
            const who = displayOf(profiles, p.user_id, me);
            const inAlready = already.has(p.user_id);
            const on = chosen.includes(p.user_id);
            return (
              <button key={p.user_id} onClick={() => toggle(p.user_id)} disabled={inAlready}
                className={inAlready ? undefined : 'hov'} aria-pressed={multi ? on : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '9px 10px',
                  borderRadius: 11, textAlign: 'left', minHeight: 48, opacity: inAlready ? 0.45 : 1,
                  background: on ? 'color-mix(in srgb, var(--acc) 13%, transparent)' : 'transparent',
                  cursor: inAlready ? 'default' : 'pointer',
                }}>
                <Disc who={who} size={34} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name?.trim() || who.label}
                  </span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'var(--tx3)' }}>
                    {inAlready ? 'already in this chat' : p.handle ? `@${p.handle}` : 'no handle'}
                  </span>
                </span>
                {multi && !inAlready && (
                  <span style={{
                    width: 19, height: 19, flex: 'none', borderRadius: 6, display: 'grid', placeItems: 'center',
                    border: `1.5px solid ${on ? 'var(--acc)' : 'var(--line2)'}`,
                    background: on ? 'var(--acc)' : 'transparent',
                  }}>
                    {on && <Icon name="check" size={11} color="var(--ink)" />}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {multi && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 15px', borderTop: '1px solid var(--line)', flex: 'none' }}>
            <span style={{ fontSize: 11, color: 'var(--tx3)' }}>
              {chosen.length} chosen
            </span>
            <button onClick={() => onPick(chosen, name.trim())} disabled={!canGo} className="k-squish"
              style={{
                marginLeft: 'auto', minHeight: 38, padding: '0 18px', borderRadius: 11,
                background: 'var(--acc)', color: 'var(--ink)', fontSize: 12, fontWeight: 800,
                opacity: canGo ? 1 : 0.45,
              }}>
              {confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(body, document.body);
}

/** The coloured disc: their photo when there is one, their initials when not. */
function Disc({ who, size }: { who: ReturnType<typeof displayOf>; size: number }) {
  return (
    <span aria-hidden style={{
      width: size, height: size, flex: 'none', borderRadius: '50%', overflow: 'hidden',
      display: 'grid', placeItems: 'center', background: who.hue,
      fontSize: size * 0.36, fontWeight: 800, color: '#0C0F16',
    }}>
      {who.photo
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={who.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : who.initials}
    </span>
  );
}

const FIELD: React.CSSProperties = {
  width: '100%', minHeight: 38, padding: '9px 12px', borderRadius: 11,
  border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--tx)', fontSize: 12.5,
};

export type { Person };
