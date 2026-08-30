'use client';

import { useRef, useState } from 'react';
import { Icon, type IconName } from '../Icon';
import { toast } from '@/lib/toast';
import { ask, confirmAsk } from '@/lib/ask';
import { uploadTo, useSignedUrl, useSignedUrls } from '@/lib/uploads';

/**
 * One person, everything you have on them.
 *
 * Every field here is something you typed. The card links out to accounts you
 * already know about — it does not go looking for them, and there is no
 * username sweep, breach lookup or reverse image search behind it. A contact
 * book and a dossier on someone who never agreed to be in one are different
 * things, and the difference is whether the app is the one doing the finding.
 *
 * Anything filled in becomes a button. An email you cannot click is a string
 * you have to select and copy, which is most of the reason contact apps exist.
 */

export type PersonLink = { label: string; url: string };
export type GalleryItem = { path: string; kind: 'image' | 'video' };

export type PersonRecord = {
  id: string;
  name: string;
  category: string;
  color: string;
  email: string;
  note: string;
  photo_path?: string | null;
  basedly_handle?: string | null;
  links?: PersonLink[] | null;
  gallery?: GalleryItem[] | null;
};

const KICKER: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)',
};

const FIELD: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line2)',
  background: 'var(--card2)', fontSize: 12.5, color: 'var(--tx)', fontFamily: 'inherit',
};

/** A label like "Instagram" gets its icon; anything else is a generic link. */
function iconFor(label: string): IconName {
  const l = label.toLowerCase();
  if (l.includes('mail')) return 'send';
  if (l.includes('phone') || l.includes('tel')) return 'phone';
  if (l.includes('site') || l.includes('web')) return 'link';
  return 'link';
}

/** Accept "instagram.com/x" as readily as the full thing. */
function normalise(url: string): string {
  const u = url.trim();
  if (!u) return '';
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
  if (u.includes('@') && !u.includes('/')) return `mailto:${u}`;
  return `https://${u}`;
}

export function PersonCard({
  person, cats, hueFor, phone, onPatch, onDelete, onOpenProfile, onMessage, follow,
}: {
  person: PersonRecord;
  cats: readonly string[];
  hueFor: (c: string) => string;
  phone: boolean;
  onPatch: (patch: Partial<PersonRecord>) => void;
  onDelete: () => void;
  onOpenProfile: () => void;
  onMessage: () => void;
  follow: { on: boolean; toggle: () => void };
}) {
  const links = person.links ?? [];
  const gallery = person.gallery ?? [];

  const photoUrl = useSignedUrl('bd-files', person.photo_path);
  const galleryUrls = useSignedUrls('bd-files', gallery.map((g) => g.path));

  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(person.name === 'Untitled Person');
  const photoInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const initials = person.name.trim()
    ? person.name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const upload = async (file: File, then: (path: string) => void) => {
    setBusy(true);
    try {
      then(await uploadTo('bd-files', file));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const addLink = () => void ask('Add a link', { placeholder: 'instagram.com/them, or any URL' })
    .then(async (url) => {
      if (!url?.trim()) return;
      const label = await ask('Call it what?', { placeholder: 'Instagram', initial: '' });
      onPatch({ links: [...links, { label: (label || 'Link').trim(), url: normalise(url) }] });
    });

  const editLink = (i: number) => void ask('Edit link', { initial: links[i].url })
    .then((url) => {
      if (url === null) return;
      const next = [...links];
      if (!url.trim()) next.splice(i, 1);
      else next[i] = { ...next[i], url: normalise(url) };
      onPatch({ links: next });
    });

  return (
    <div style={{
      background: 'var(--card)', borderRadius: 16, padding: '18px 18px 20px',
      boxShadow: 'var(--sh)', minWidth: 0,
    }}>
      {/* hidden pickers — one per source, because `capture` cannot be toggled
          on a live input in every browser */}
      <input ref={photoInput} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f, (photo_path) => onPatch({ photo_path })); }} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f, (photo_path) => onPatch({ photo_path })); }} />
      <input ref={galleryInput} type="file" accept="image/*,video/*" multiple hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void (async () => {
            const added: GalleryItem[] = [];
            for (const f of files) {
              await upload(f, (path) => added.push({ path, kind: f.type.startsWith('video') ? 'video' : 'image' }));
            }
            if (added.length) onPatch({ gallery: [...gallery, ...added] });
          })();
        }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <div style={{ position: 'relative', flex: 'none' }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%', display: 'grid', placeItems: 'center',
            overflow: 'hidden',
            background: photoUrl ? 'var(--card2)' : `color-mix(in srgb, ${person.color} 28%, var(--card2))`,
            color: person.color, fontSize: 18, fontWeight: 800,
          }}>
            {photoUrl
              ? <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : initials}
          </div>
          <button onClick={() => photoInput.current?.click()} disabled={busy}
            className="hov k-squish" title="Choose a photo" aria-label="Choose a photo"
            style={{
              position: 'absolute', right: -3, bottom: -3, width: 24, height: 24, borderRadius: '50%',
              border: '1px solid var(--line2)', background: 'var(--card2)', display: 'grid', placeItems: 'center',
            }}>
            <Icon name={busy ? 'refresh' : 'image'} size={12} color="var(--tx2)" />
          </button>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {editingName ? (
            <input
              autoFocus defaultValue={person.name === 'Untitled Person' ? '' : person.name}
              placeholder="Their name"
              onBlur={(e) => {
                const v = e.target.value.trim();
                setEditingName(false);
                if (v && v !== person.name) onPatch({ name: v });
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              style={{ ...FIELD, fontSize: 17, fontWeight: 800, letterSpacing: '-.02em' }} />
          ) : (
            <button onClick={() => setEditingName(true)} className="hov" title="Rename"
              style={{
                fontSize: 19, fontWeight: 800, letterSpacing: '-.02em', textAlign: 'left',
                padding: '2px 4px', borderRadius: 6, maxWidth: '100%',
                color: person.name === 'Untitled Person' ? 'var(--tx3)' : 'var(--tx)',
              }}>
              {person.name || 'Untitled Person'}
            </button>
          )}
          <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 3 }}>{person.category}</div>
        </div>

        <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
          <button onClick={() => cameraInput.current?.click()} disabled={busy}
            className="hov" title="Take a photo" aria-label="Take a photo"
            style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center' }}>
            <Icon name="photo" size={14} color="var(--tx2)" />
          </button>
          <button onClick={() => void confirmAsk(`Remove ${person.name}?`, {
            message: 'Their photos stay in Files.', confirmLabel: 'Remove', danger: true,
          }).then((yes) => { if (yes) onDelete(); })}
            className="hov" title="Remove" aria-label={`Remove ${person.name}`}
            style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center' }}>
            <Icon name="trash" size={14} color="var(--tx2)" />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={onOpenProfile} className="hov k-squish" style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9,
          border: '1px solid var(--line2)', background: 'var(--card2)', fontSize: 12, fontWeight: 700,
        }}>
          <Icon name="people" size={13} color="var(--accTx)" />View profile
        </button>
        <button onClick={follow.toggle} className="acc k-squish" style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9,
          background: follow.on ? 'var(--card2)' : 'var(--acc)',
          color: follow.on ? 'var(--tx)' : 'var(--ink)',
          border: follow.on ? '1px solid var(--line2)' : 'none', fontSize: 12, fontWeight: 800,
        }}>{follow.on ? 'Following ✓' : 'Follow +'}</button>
        <button onClick={onMessage} className="hov k-squish" style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9,
          border: '1px solid var(--line2)', background: 'var(--card2)', fontSize: 12, fontWeight: 700,
        }}>
          <Icon name="send" size={13} color="var(--accTx)" />Message
        </button>
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 16 }}>
        {cats.map((c) => (
          <button key={c} onClick={() => onPatch({ category: c, color: hueFor(c) })} style={{
            padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
            border: `1px solid ${person.category === c ? 'var(--acc)' : 'var(--line2)'}`,
            color: person.category === c ? 'var(--accTx)' : 'var(--tx2)',
          }}>{c}</button>
        ))}
      </div>

      {/* Contact. Filled in, each of these is a button; empty, it is a field. */}
      <div style={{ ...KICKER, marginBottom: 7 }}>Contact</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
        <Row
          icon="send" value={person.email} href={person.email ? `mailto:${person.email}` : null}
          placeholder="Email address"
          onSet={(v) => onPatch({ email: v })} />
        <Row
          icon="focus" value={person.basedly_handle ?? ''}
          href={person.basedly_handle ? `/profile/?u=${encodeURIComponent(person.basedly_handle.replace(/^@/, ''))}` : null}
          placeholder="Basedly profile (@handle)"
          onSet={(v) => onPatch({ basedly_handle: v.replace(/^@/, '') })} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
        <div style={KICKER}>Links</div>
        <button onClick={addLink} className="hov" aria-label="Add a link" title="Add a link"
          style={{ marginLeft: 'auto', width: 22, height: 22, borderRadius: 7, display: 'grid', placeItems: 'center' }}>
          <Icon name="plus" size={13} color="var(--tx3)" />
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {links.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--tx3)' }}>Nothing yet — add a profile or a site.</div>
        )}
        {links.map((l, i) => (
          <span key={`${l.url}:${i}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="hov k-squish" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px',
              borderRadius: 9, border: '1px solid var(--line2)', background: 'var(--card2)',
              fontSize: 12, fontWeight: 700, color: 'var(--tx)', textDecoration: 'none',
            }}>
              <Icon name={iconFor(l.label)} size={12} color="var(--accTx)" />{l.label}
            </a>
            <button onClick={() => editLink(i)} className="hov" title={`Edit ${l.label}`}
              aria-label={`Edit ${l.label}`}
              style={{ width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center', marginLeft: 2 }}>
              <Icon name="edit" size={11} color="var(--tx3)" />
            </button>
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
        <div style={KICKER}>Gallery</div>
        <button onClick={() => galleryInput.current?.click()} disabled={busy}
          className="hov" aria-label="Add photos or video" title="Add photos or video"
          style={{ marginLeft: 'auto', width: 22, height: 22, borderRadius: 7, display: 'grid', placeItems: 'center' }}>
          <Icon name="plus" size={13} color="var(--tx3)" />
        </button>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${phone ? 3 : 4}, 1fr)`, gap: 6, marginBottom: 16,
      }}>
        {gallery.length === 0 && (
          <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--tx3)' }}>
            No photos or video yet.
          </div>
        )}
        {gallery.map((g, i) => (
          <div key={`${g.path}:${i}`} style={{
            position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden',
            background: 'var(--card2)', border: '1px solid var(--line)',
          }}>
            {galleryUrls[i] && (g.kind === 'video'
              ? <video src={galleryUrls[i]!} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <img src={galleryUrls[i]!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)}
            <button
              onClick={() => onPatch({ gallery: gallery.filter((_, j) => j !== i) })}
              className="hov" title="Remove" aria-label="Remove from gallery"
              style={{
                position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 6,
                background: 'color-mix(in srgb, var(--bg) 70%, transparent)', display: 'grid', placeItems: 'center',
              }}>
              <Icon name="close" size={11} color="var(--tx)" />
            </button>
          </div>
        ))}
      </div>

      <div style={{ ...KICKER, marginBottom: 6 }}>What you want to remember</div>
      <textarea key={person.id} defaultValue={person.note}
        onBlur={(e) => e.target.value !== person.note && onPatch({ note: e.target.value })}
        rows={4} placeholder="How you met, what they're working on, what to ask next time…"
        style={{ ...FIELD, lineHeight: 1.6, resize: 'vertical' }} />
    </div>
  );
}

/** A contact line: a link once it has a value, an input while it does not. */
function Row({
  icon, value, href, placeholder, onSet,
}: {
  icon: IconName;
  value: string;
  href: string | null;
  placeholder: string;
  onSet: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (value && !editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <a href={href ?? undefined} className="hov k-squish" style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
          borderRadius: 10, border: '1px solid var(--line2)', background: 'var(--card2)',
          fontSize: 12.5, fontWeight: 600, color: 'var(--tx)', textDecoration: 'none',
        }}>
          <Icon name={icon} size={13} color="var(--accTx)" />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {value}
          </span>
        </a>
        <button onClick={() => setEditing(true)} className="hov" title="Edit" aria-label={`Edit ${placeholder}`}
          style={{ width: 26, height: 26, flex: 'none', borderRadius: 7, display: 'grid', placeItems: 'center' }}>
          <Icon name="edit" size={12} color="var(--tx3)" />
        </button>
      </div>
    );
  }

  return (
    <input
      autoFocus={editing} defaultValue={value} placeholder={placeholder}
      onBlur={(e) => { setEditing(false); if (e.target.value.trim() !== value) onSet(e.target.value.trim()); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      style={FIELD} />
  );
}

/**
 * A person's face at any size, falling back to their initials.
 *
 * Its own component because resolving the storage path is a hook, and the
 * roster draws these in a loop.
 */
export function PersonAvatar({
  name, color, path, size = 32,
}: {
  name: string;
  color: string;
  path?: string | null;
  size?: number;
}) {
  const url = useSignedUrl('bd-files', path);
  const initials = name.trim()
    ? name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <span style={{
      width: size, height: size, flex: 'none', borderRadius: '50%', overflow: 'hidden',
      display: 'grid', placeItems: 'center',
      background: url ? 'var(--card2)' : `color-mix(in srgb, ${color} 28%, var(--card2))`,
      color, fontSize: Math.round(size * 0.34), fontWeight: 700,
    }}>
      {url
        ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initials}
    </span>
  );
}
