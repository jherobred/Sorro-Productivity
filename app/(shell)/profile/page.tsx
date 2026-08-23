'use client';

import { useEffect, useState } from 'react';
import { supabase, currentUserId } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { PAL } from '@/lib/pal';
import { uploadAvatar } from '@/lib/uploads';
import { ON_ACCENT } from '@/lib/glass';
import { useLayout } from '@/lib/useLayout';
import { useOverlayBack } from '@/lib/nav';
import { profileLink, hueOf, ME_KEY } from '@/lib/people';
import { startDm } from '@/lib/messages';
import { queryClient } from '@/lib/offline';
import { Icon } from '@/components/Icon';
import { useRouter } from 'next/navigation';

/**
 * Ported from Basedly.dc.html markup 663–758. The avatar is drawn as layered
 * SVG exactly as the prototype does; README flags the illustrated art as an
 * asset still to be sourced, so these vector parts are the same placeholder.
 *
 * Two things changed here.
 *
 * **The builder is behind a button.** Eleven categories and a swatch grid took
 * half the page, permanently, for a thing most people touch once. Your name,
 * handle, picture and link are what this page is for day to day; the workbench
 * opens when you ask for it.
 *
 * **`?u=<handle>` shows somebody else's.** That is what a shareable profile
 * link points at. A query parameter rather than `/u/[handle]`, because this is
 * a static export and handles are made after the build — see `profileLink` in
 * lib/people.ts. Read-only, with one button on it: message them. That button is
 * the whole point — it is how somebody reaches you *deliberately*, instead of
 * every account in the database being one tap from your inbox.
 */

const KICKER: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)' };
const CARD: React.CSSProperties = { background: 'var(--card)', borderRadius: 16, padding: '15px 16px', boxShadow: 'var(--sh)' };

const AV_ORDER = ['bg', 'skin', 'face', 'hair', 'hairColor', 'eyes', 'brows', 'nose', 'mouth', 'glasses', 'hat'] as const;
type AvKey = (typeof AV_ORDER)[number];
const AV_LABEL: Record<AvKey, string> = {
  bg: 'Backdrop', skin: 'Skin', face: 'Face shape', hair: 'Hair', hairColor: 'Hair colour',
  eyes: 'Eyes', brows: 'Brows', nose: 'Nose', mouth: 'Mouth', glasses: 'Glasses', hat: 'Hat',
};

const AV: Record<AvKey, { id: string; v: string }[]> = {
  bg: [
    { id: 'violet', v: '#7C6CFF,#38D6F2' }, { id: 'sunset', v: '#FF6B6B,#FFC24B' },
    { id: 'mint', v: '#34D9A0,#38BDF8' }, { id: 'rose', v: '#FF6FA8,#B07CFF' },
    { id: 'slate', v: '#3A3550,#211F2C' },
  ],
  skin: [
    { id: 'porcelain', v: '#F3D7C2' }, { id: 'sand', v: '#E7BE9A' }, { id: 'tan', v: '#C98F63' },
    { id: 'bronze', v: '#A56A3E' }, { id: 'deep', v: '#6E4326' },
  ],
  face: [
    { id: 'oval', v: 'M50 22c16 0 25 12 25 28s-11 30-25 30-25-14-25-30 9-28 25-28z' },
    { id: 'round', v: 'M50 22c17 0 27 13 27 29S67 80 50 80 23 67 23 51s10-29 27-29z' },
    { id: 'square', v: 'M27 26h46v30c0 14-10 24-23 24S27 70 27 56z' },
  ],
  hair: [
    { id: 'short', v: 'M24 44c0-16 11-26 26-26s26 10 26 26c0-8-9-13-26-13s-26 5-26 13z' },
    { id: 'wave', v: 'M23 46c2-18 12-28 27-28s25 10 27 28c-4-10-12-14-27-14s-23 4-27 14z' },
    { id: 'bun', v: 'M24 44c0-16 11-26 26-26s26 10 26 26c0-8-9-13-26-13s-26 5-26 13zM50 8a7 7 0 1 1 0 14 7 7 0 0 1 0-14z' },
    { id: 'bald', v: '' },
  ],
  hairColor: [
    { id: 'ink', v: '#221F2E' }, { id: 'brown', v: '#5A3A26' }, { id: 'sand', v: '#C8964F' },
    { id: 'auburn', v: '#8E3B24' }, { id: 'violet', v: '#7C6CFF' },
  ],
  eyes: [{ id: 'round', v: '3.6,3.6' }, { id: 'narrow', v: '4.2,2.4' }, { id: 'wide', v: '4.4,4.2' }],
  brows: [
    { id: 'flat', v: 'M31 43h11M58 43h11' },
    { id: 'raised', v: 'M31 44c4-3 8-3 11-1M58 43c3-2 7-2 11 1' },
    { id: 'angled', v: 'M31 45l11-3M58 42l11 3' },
  ],
  nose: [{ id: 'soft', v: 'M50 54v6l-3 2' }, { id: 'button', v: 'M50 58h-2' }, { id: 'long', v: 'M50 52v10l-4 2' }],
  mouth: [
    { id: 'smile', v: 'M42 66c4 4 12 4 16 0' }, { id: 'neutral', v: 'M43 67h14' },
    { id: 'grin', v: 'M41 64c5 7 13 7 18 0' }, { id: 'smirk', v: 'M43 67c5 3 10 1 13-2' },
  ],
  glasses: [
    { id: 'none', v: '' },
    { id: 'round', v: 'M31 52a6 6 0 1 0 12 0 6 6 0 0 0-12 0M57 52a6 6 0 1 0 12 0 6 6 0 0 0-12 0M43 52h14' },
    { id: 'square', v: 'M31 47h12v10H31zM57 47h12v10H57zM43 52h14' },
  ],
  hat: [
    { id: 'none', v: '' },
    { id: 'cap', v: 'M24 40c0-15 11-24 26-24s26 9 26 24H24z' },
    { id: 'beanie', v: 'M25 42c0-16 11-25 25-25s25 9 25 25z' },
  ],
};

type Avatar = Partial<Record<AvKey, string>>;
const DEFAULT_AVATAR: Avatar = Object.fromEntries(AV_ORDER.map((k) => [k, AV[k][0].id]));

const pick = (a: Avatar, k: AvKey) => AV[k].find((o) => o.id === a[k]) ?? AV[k][0];

export default function ProfilePage() {
  const { phone } = useLayout();
  /**
   * Whose profile. Read off `window.location.search` rather than
   * `useSearchParams`, which forces the page into a Suspense boundary under
   * `output: 'export'` — this is a client page that already waits for a fetch.
   */
  const [visiting, setVisiting] = useState<string | null>(null);
  useEffect(() => {
    const u = new URLSearchParams(window.location.search).get('u');
    setVisiting(u ? u.replace(/^@/, '').trim() || null : null);
  }, []);

  const [avatar, setAvatar] = useState<Avatar>(DEFAULT_AVATAR);
  const [cat, setCat] = useState<AvKey>('bg');
  /** The builder is a workbench, not a setting — it opens when asked. */
  const [building, setBuilding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [course, setCourse] = useState('');
  const [campus, setCampus] = useState('');
  const [dirty, setDirty] = useState(false);
  const [uid, setUid] = useState('');
  /** A real photo, when there is one. It wins over the drawn avatar. */
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const id = await currentUserId().catch(() => null);
      if (!id) return;
      setUid(id);
      const { data: p } = await supabase.from('bd_profiles')
        .select('name,handle,bio,course,year,campus,avatar,photo_url').eq('user_id', id).maybeSingle();
      if (!p) return;
      setName(p.name ?? ''); setHandle(p.handle ?? ''); setBio(p.bio ?? '');
      setCourse([p.course, p.year].filter(Boolean).join(' · ')); setCampus(p.campus ?? '');
      if (p.avatar && Object.keys(p.avatar).length) setAvatar({ ...DEFAULT_AVATAR, ...p.avatar });
      setPhoto(p.photo_url ?? null);
    })();
  }, []);

  const set = (k: AvKey, id: string) => { setAvatar((a) => ({ ...a, [k]: id })); setDirty(true); };

  /**
   * A photo replaces the built avatar rather than deleting it — remove the
   * photo and the drawn one is still exactly as you left it, which is the only
   * behaviour that makes trying a photo a safe thing to do.
   */
  async function pickPhoto(file: File) {
    if (!uid) return toast('Sign in to change your picture');
    if (file.size > 5_000_000) return toast('That image is over 5 MB');
    setBusy(true);
    try {
      const url = await uploadAvatar(file);
      setPhoto(url);
      setDirty(true);
      toast('Picture updated — save to keep it');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  const surprise = () => {
    const next: Avatar = {};
    for (const k of AV_ORDER) next[k] = AV[k][Math.floor(Math.random() * AV[k].length)].id;
    setAvatar(next);
    setDirty(true);
  };

  async function save() {
    // Silence was the bug: with no session this returned without a word, so the
    // button looked broken rather than blocked.
    if (!uid) return toast('Sign in to save your profile');
    if (!dirty) return toast('Nothing to save');
    const { error } = await supabase.from('bd_profiles')
      .update({ name, handle: handle || null, bio, avatar, photo_url: photo }).eq('user_id', uid);
    if (error) return toast(error.message);
    setDirty(false);
    toast('Profile saved');
  }

  const [bg0, bg1] = pick(avatar, 'bg').v.split(',');
  const skin = pick(avatar, 'skin').v;
  const hairColor = pick(avatar, 'hairColor').v;
  const [eyeRx, eyeRy] = pick(avatar, 'eyes').v.split(',');
  const myLink = profileLink(handle);

  // Somebody else's link. Their card, and a button to message them.
  if (visiting && visiting.toLowerCase() !== (handle ?? '').toLowerCase()) {
    return <Visitor handle={visiting} phone={phone} />;
  }

  return (
    <div style={{ padding: phone ? '14px 14px 24px' : '20px 24px 28px', maxWidth: 1240, marginInline: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <h1 className="sronly">Profile</h1>
        <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>Your face across Basedly</div>

        {/* Your link. This is how somebody gets to you on purpose - see the
            header of this file for why that matters to the inbox. */}
        <button
          onClick={() => {
            if (!myLink) { toast('Set a handle first — your link is built from it'); return; }
            if (navigator.share) { void navigator.share({ title: name || 'Basedly', url: myLink }); return; }
            void navigator.clipboard.writeText(myLink).then(() => { setCopied(true); toast('Link copied'); });
          }}
          className="hov" title={myLink ?? 'Set a handle to get a link'}
          style={{ marginLeft: 'auto', flex: 'none', display: 'flex', alignItems: 'center', gap: 7, padding: '10px 14px', borderRadius: 11, border: '1px solid var(--line2)', fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)', whiteSpace: 'nowrap' }}>
          <Icon name={copied ? 'check' : 'upload'} size={14} color="var(--accTx)" />
          Share link
        </button>

        {/* The builder used to be half the page, permanently, for something
            most people set once. It is an icon now. */}
        <button onClick={() => setBuilding((v) => !v)} className="hov k-squish"
          aria-expanded={building} aria-label="Build your avatar" title="Build your avatar"
          style={{ flex: 'none', width: 40, height: 40, borderRadius: 11, border: `1px solid ${building ? 'var(--acc)' : 'var(--line2)'}`, display: 'grid', placeItems: 'center', background: building ? 'color-mix(in srgb, var(--acc) 14%, transparent)' : 'transparent' }}>
          <Icon name="pen" size={15} color={building ? 'var(--accTx)' : 'var(--tx2)'} />
        </button>
        <button onClick={save} className="acc" style={{
          flex: 'none', padding: '10px 18px', borderRadius: 11,
          background: dirty ? 'var(--acc)' : 'var(--card2)', color: dirty ? '#0A0912' : 'var(--tx3)',
          fontSize: 12.5, fontWeight: 800, transition: 'background .24s, color .24s',
        }}>
          {dirty ? 'Save changes' : 'Saved'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: phone || !building ? '1fr' : '1fr 1fr', gap: 12, alignItems: 'start' }}>
        <div style={CARD}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ width: 132, height: 132, flex: 'none', position: 'relative' }}>
            <div style={{ width: 132, height: 132, borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--sh)', background: 'var(--card2)' }}>
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="Your profile picture" className="fade"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : (
              <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', display: 'block' }}>
                <defs>
                  <linearGradient id="avbg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor={bg0} />
                    <stop offset="1" stopColor={bg1} />
                  </linearGradient>
                </defs>
                <rect x="0" y="0" width="100" height="100" fill="url(#avbg)" />
                <circle cx="50" cy="112" r="44" fill="rgba(255,255,255,.10)" />
                <path d={pick(avatar, 'hair').v} fill={hairColor} opacity="0.55" transform="translate(0,4)" />
                <ellipse cx="22" cy="55" rx="4.5" ry="6" fill={skin} />
                <ellipse cx="78" cy="55" rx="4.5" ry="6" fill={skin} />
                <path d={pick(avatar, 'face').v} fill={skin} />
                <path d={pick(avatar, 'hair').v} fill={hairColor} />
                <path d={pick(avatar, 'brows').v} fill="none" stroke={hairColor} strokeWidth="2.4" strokeLinecap="round" />
                <ellipse cx="38" cy="52" rx={eyeRx} ry={eyeRy} fill="#221F2E" />
                <ellipse cx="62" cy="52" rx={eyeRx} ry={eyeRy} fill="#221F2E" />
                <circle cx="39.4" cy="50.6" r="1.1" fill="rgba(255,255,255,.85)" />
                <circle cx="63.4" cy="50.6" r="1.1" fill="rgba(255,255,255,.85)" />
                <path d={pick(avatar, 'nose').v} fill="none" stroke="rgba(0,0,0,.25)" strokeWidth="1.8" strokeLinecap="round" />
                <path d={pick(avatar, 'mouth').v} fill="none" stroke="#8E4A46" strokeWidth="2.2" strokeLinecap="round" />
                <path d={pick(avatar, 'glasses').v} fill="none" stroke="#1C1A26" strokeWidth="2" strokeLinecap="round" />
                <path d={pick(avatar, 'hat').v} fill={PAL.indigo} />
              </svg>
              )}
            </div>

            {/* Upload sits on the picture, where a phone user expects to tap. */}
            <label title={photo ? 'Change your picture' : 'Upload a picture'}
              style={{
                position: 'absolute', right: -6, bottom: -6, width: 38, height: 38, borderRadius: 19,
                background: 'var(--acc)', border: '3px solid var(--card)', cursor: 'pointer',
                display: 'grid', placeItems: 'center', opacity: busy ? 0.5 : 1,
              }}>
              <Icon name={busy ? 'refresh' : 'photo'} size={16} color={ON_ACCENT} />
              <input type="file" accept="image/*" hidden disabled={busy}
                aria-label={photo ? 'Change your picture' : 'Upload a picture'}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickPhoto(f); e.target.value = ''; }} />
            </label>

            {photo && (
              <button onClick={() => { setPhoto(null); setDirty(true); toast('Back to your drawn avatar'); }}
                className="hov k-squish" aria-label="Remove your picture" title="Remove your picture"
                style={{
                  position: 'absolute', left: -6, bottom: -6, width: 32, height: 32, borderRadius: 16,
                  background: 'var(--card)', border: '1px solid var(--line2)', display: 'grid', placeItems: 'center',
                }}>
                <Icon name="close" size={13} color="var(--tx2)" />
              </button>
            )}
            </div>

            <div style={{ flex: 1, minWidth: 190 }}>
              <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} placeholder="Your name"
                style={{ width: '100%', fontSize: 19, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--tx)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, margin: '4px 0 10px' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx3)' }}>@</span>
                <input value={handle} onChange={(e) => { setHandle(e.target.value); setDirty(true); }} placeholder="handle"
                  style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--tx2)' }} />
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--accTx)', marginBottom: 3 }}>{course || '—'}</div>
              <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginBottom: 12 }}>{campus || 'No campus set'}</div>
              <textarea value={bio} onChange={(e) => { setBio(e.target.value); setDirty(true); }} rows={3} placeholder="A line about you"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 11, border: '1px solid var(--line2)', background: 'var(--card2)', fontSize: 12.5, lineHeight: 1.6, color: 'var(--tx)', resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
          </div>
        </div>

        {building && (
        <div style={CARD} className="rise">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
            <div style={KICKER}>Build your avatar</div>
            <button onClick={surprise} className="hov"
              style={{ marginLeft: 'auto', padding: '5px 11px', borderRadius: 8, border: '1px solid var(--line2)', fontSize: 11, fontWeight: 700, color: 'var(--tx2)' }}>
              Surprise me
            </button>
            <button onClick={() => setBuilding(false)} className="hov" aria-label="Close the builder"
              style={{ width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center' }}>
              <Icon name="close" size={12} color="var(--tx3)" />
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {AV_ORDER.map((k) => (
              <button key={k} onClick={() => setCat(k)} className="tt" style={{
                padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                border: `1px solid ${cat === k ? 'var(--acc)' : 'var(--line2)'}`,
                background: cat === k ? 'color-mix(in srgb, var(--acc) 14%, transparent)' : 'transparent',
                color: cat === k ? 'var(--accTx)' : 'var(--tx2)',
              }}>
                {AV_LABEL[k]}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))', gap: 8 }}>
            {AV[cat].map((o) => {
              const on = (avatar[cat] ?? AV[cat][0].id) === o.id;
              const swatch = cat === 'bg' ? `linear-gradient(135deg, ${o.v.split(',')[0]}, ${o.v.split(',')[1]})`
                : /^#/.test(o.v) ? o.v : 'var(--card2)';
              return (
                <button key={o.id} onClick={() => set(cat, o.id)} className="tt" style={{
                  minHeight: 54, borderRadius: 10, padding: 7,
                  border: `1px solid ${on ? 'var(--acc)' : 'var(--line2)'}`,
                  background: swatch,
                  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                  fontSize: 9.5, fontWeight: 700, textTransform: 'capitalize',
                  color: /^#|linear/.test(swatch) ? '#0C0F16' : 'var(--tx2)',
                }}>
                  {o.id}
                </button>
              );
            })}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ somebody else */

/**
 * A profile reached by its link.
 *
 * Deliberately thin: a face, a name, what they study, and Message. No stats and
 * no mutual-anything - the job is to let a person check they have the right
 * Jules before they say hello, and then to say hello.
 */
function Visitor({ handle, phone }: { handle: string; phone: boolean }) {
  const router = useRouter();
  const [who, setWho] = useState<{
    user_id: string; name: string; handle: string; bio: string; course: string; campus: string; photo: string | null;
  } | null | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('bd_profiles')
        .select('user_id,name,handle,bio,course,year,campus,photo_url')
        .eq('handle', handle).maybeSingle();
      setWho(data
        ? {
          user_id: data.user_id, name: data.name ?? '', handle: data.handle ?? handle,
          bio: data.bio ?? '', course: [data.course, data.year].filter(Boolean).join(' · '),
          campus: data.campus ?? '', photo: data.photo_url ?? null,
        }
        : null);
    })();
  }, [handle]);

  const pad = phone ? '14px 14px 24px' : '20px 24px 28px';

  if (who === undefined) {
    return <div style={{ padding: pad, fontSize: 12.5, color: 'var(--tx3)' }}>Looking for @{handle}…</div>;
  }

  if (who === null) {
    return (
      <div style={{ padding: pad, maxWidth: 520 }}>
        <div style={{ ...CARD, textAlign: 'center', padding: '32px 20px' }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>No @{handle} here</div>
          <p style={{ fontSize: 12, color: 'var(--tx3)', lineHeight: 1.7, margin: '0 0 14px' }}>
            The link may be old, or the handle may have changed.
          </p>
          <button onClick={() => router.replace('/profile/')} className="acc k-squish"
            style={{ padding: '10px 16px', borderRadius: 11, background: 'var(--acc)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 800 }}>
            Your own profile
          </button>
        </div>
      </div>
    );
  }

  const initials = (who.name || who.handle).split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div style={{ padding: pad, maxWidth: 520 }}>
      <div style={CARD}>
        <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
          {who.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={who.photo} alt="" style={{ width: 78, height: 78, borderRadius: 18, objectFit: 'cover', flex: 'none' }} />
          ) : (
            <span style={{
              width: 78, height: 78, flex: 'none', borderRadius: 18, display: 'grid', placeItems: 'center',
              background: hueOf(who.user_id), fontSize: 26, fontWeight: 800, color: '#0C0F16',
            }}>{initials}</span>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.02em' }}>{who.name || `@${who.handle}`}</div>
            <div style={{ fontSize: 12.5, color: 'var(--tx3)', marginTop: 2 }}>@{who.handle}</div>
            {who.course && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--accTx)', marginTop: 6 }}>{who.course}</div>}
            {who.campus && <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{who.campus}</div>}
          </div>
        </div>

        {who.bio && (
          <p style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--tx2)', margin: '14px 0 0', textWrap: 'pretty' }}>
            {who.bio}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            onClick={() => void startDm(who.user_id).then((id) => { if (id) router.push('/community/'); })}
            className="acc k-squish"
            style={{ flex: 1, minHeight: 44, borderRadius: 12, background: 'var(--acc)', color: 'var(--ink)', fontSize: 13, fontWeight: 800 }}>
            Message {who.name.split(' ')[0] || `@${who.handle}`}
          </button>
          <button onClick={() => router.replace('/profile/')} className="hov"
            style={{ flex: 'none', padding: '0 16px', minHeight: 44, borderRadius: 12, border: '1px solid var(--line2)', fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)' }}>
            Yours
          </button>
        </div>
      </div>
    </div>
  );
}
