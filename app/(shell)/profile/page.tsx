'use client';

import { useEffect, useState } from 'react';
import { supabase, currentUserId } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { PAL } from '@/lib/pal';
import { uploadAvatar, uploadCover } from '@/lib/uploads';
import { PhotoFrame, FrameEditor, toFit, CENTRED, type Fit } from '@/components/PhotoFrame';
import { Mascot } from '@/components/challenges/Mascot';
import { ANIMALS, animalOf, type Animal } from '@/lib/mascot';
import { ON_ACCENT } from '@/lib/glass';
import { useLayout } from '@/lib/useLayout';
import { useOverlayBack } from '@/lib/nav';
import { profileLink, hueOf, ME_KEY, COMMUNITY_PROFILES } from '@/lib/people';
import { startDm } from '@/lib/messages';
import { queryClient } from '@/lib/offline';
import { Icon } from '@/components/Icon';
import { useRouter } from 'next/navigation';
import { ProfileTimeline } from '@/components/ProfileTimeline';
import { HighlightsTray } from '@/components/stories/HighlightsTray';
import { StoryArchiveModal } from '@/components/stories/StoryArchiveModal';
import { useFollows } from '@/lib/follows';
import { FollowListModal } from '@/components/FollowListModal';

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

/** The controls that sit on top of the cover. Dark enough to read on any photo. */
const PILL: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 999,
  background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 10.5, fontWeight: 800,
  backdropFilter: 'blur(6px)',
};

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
    { id: 'slate', v: '#3A3550,#211F2C' }, { id: 'cyber', v: '#0F2027,#2C5364' },
    { id: 'neon', v: '#F72585,#7209B7' }, { id: 'aurora', v: '#0575E6,#00F260' },
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
    { id: 'spikes', v: 'M22 42 L26 22 L34 30 L42 16 L50 28 L58 16 L66 30 L74 22 L78 42 C78 30 65 24 50 24 C35 24 22 30 22 42 Z' },
    { id: 'fade', v: 'M26 38 C26 22 36 18 50 18 C64 18 74 22 74 38 C74 30 65 25 50 25 C35 25 26 30 26 38 Z' },
    { id: 'curtain', v: 'M22 46 C24 22 36 20 50 26 C64 20 76 22 78 46 C76 34 68 28 50 32 C32 28 24 34 22 46 Z' },
    { id: 'bald', v: '' },
  ],
  hairColor: [
    { id: 'ink', v: '#221F2E' }, { id: 'brown', v: '#5A3A26' }, { id: 'sand', v: '#C8964F' },
    { id: 'auburn', v: '#8E3B24' }, { id: 'violet', v: '#7C6CFF' }, { id: 'ice', v: '#E0F7FA' },
    { id: 'crimson', v: '#E63946' }, { id: 'emerald', v: '#2A9D8F' },
  ],
  eyes: [{ id: 'round', v: '3.6,3.6' }, { id: 'narrow', v: '4.2,2.4' }, { id: 'wide', v: '4.4,4.2' }, { id: 'focus', v: '4.6,1.8' }],
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
    { id: 'aviator', v: 'M28 46 L44 46 L42 58 L30 58 Z M56 46 L72 46 L70 58 L58 58 Z M44 49 L56 49' },
  ],
  hat: [
    { id: 'none', v: '' },
    { id: 'cap', v: 'M24 40c0-15 11-24 26-24s26 9 26 24H24z' },
    { id: 'beanie', v: 'M25 42c0-16 11-25 25-25s25 9 25 25z' },
    { id: 'headphones', v: 'M18 54 V44 C18 26 32 16 50 16 C68 16 82 26 82 44 V54 M14 46 H22 V58 H14 Z M78 46 H86 V58 H78 Z' },
    { id: 'headband', v: 'M22 36 C30 30 70 30 78 36 L78 42 C70 36 30 36 22 42 Z' },
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
  const [cover, setCover] = useState<string | null>(null);
  /** Where each picture sits inside its frame. Numbers, never a new file. */
  const [photoFit, setPhotoFit] = useState<Fit>(CENTRED);
  const [coverFit, setCoverFit] = useState<Fit>(CENTRED);
  /** Which frame is open for dragging. One at a time — two draggable pictures
   *  on screen is two things competing for the same gesture. */
  const [adjusting, setAdjusting] = useState<'photo' | 'cover' | null>(null);
  const [animal, setAnimal] = useState<Animal | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyCover, setBusyCover] = useState(false);
  const { following, followers } = useFollows();
  const [followListTab, setFollowListTab] = useState<'followers' | 'following' | null>(null);

  useEffect(() => {
    void (async () => {
      const id = await currentUserId().catch(() => null);
      if (!id) return;
      setUid(id);
      const { data: p } = await supabase.from('bd_profiles')
        .select('name,handle,bio,course,year,campus,avatar,photo_url,cover_url,photo_fit,cover_fit,animal')
        .eq('user_id', id).maybeSingle();
      if (!p) return;
      setName(p.name ?? ''); setHandle(p.handle ?? ''); setBio(p.bio ?? '');
      setCourse([p.course, p.year].filter(Boolean).join(' · ')); setCampus(p.campus ?? '');
      if (p.avatar && Object.keys(p.avatar).length) setAvatar({ ...DEFAULT_AVATAR, ...p.avatar });
      setPhoto(p.photo_url ?? null);
      setCover(p.cover_url ?? null);
      setPhotoFit(toFit(p.photo_fit));
      setCoverFit(toFit(p.cover_fit));
      setAnimal((p.animal as Animal | null) ?? null);
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
      // A new picture starts centred. Keeping the old frame would apply one
      // photo's cropping to a completely different photo.
      setPhotoFit(CENTRED);
      setAdjusting('photo');
      setDirty(true);
      toast('Picture updated — drag to frame it, then save');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function pickCover(file: File) {
    if (!uid) return toast('Sign in to change your cover');
    if (file.size > 8_000_000) return toast('That image is over 8 MB');
    setBusyCover(true);
    try {
      const url = await uploadCover(file);
      setCover(url);
      setCoverFit(CENTRED);
      setAdjusting('cover');
      setDirty(true);
      toast('Cover updated — drag to frame it, then save');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusyCover(false);
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
      .update({
        name, handle: handle || null, bio, avatar, photo_url: photo,
        cover_url: cover, photo_fit: photoFit, cover_fit: coverFit, animal,
      }).eq('user_id', uid);
    if (error) return toast(error.message);
    setDirty(false);
    toast('Profile saved');
  }

  const [showArchive, setShowArchive] = useState(false);

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

        {/* Stories Archive Modal Button */}
        <button
          onClick={() => setShowArchive(true)}
          className="hov k-squish"
          title="View stories archive"
          style={{
            marginLeft: 'auto', flex: 'none', display: 'flex', alignItems: 'center', gap: 7,
            padding: '10px 14px', borderRadius: 11, border: '1px solid var(--line2)',
            fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)', whiteSpace: 'nowrap',
          }}
        >
          <Icon name="archive" size={14} color="var(--accTx)" />
          Stories Archive
        </button>

        {/* Your link. This is how somebody gets to you on purpose - see the
            header of this file for why that matters to the inbox. */}
        <button
          onClick={() => {
            if (!myLink) { toast('Set a handle first — your link is built from it'); return; }
            if (navigator.share) { void navigator.share({ title: name || 'Basedly', url: myLink }); return; }
            void navigator.clipboard.writeText(myLink).then(() => { setCopied(true); toast('Link copied'); });
          }}
          className="hov" title={myLink ?? 'Set a handle to get a link'}
          style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 7, padding: '10px 14px', borderRadius: 11, border: '1px solid var(--line2)', fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)', whiteSpace: 'nowrap' }}>
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
        <div data-tour="profile-header" style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
          {/* The cover.
              A profile that is one square picture on a flat card is an ID
              badge. A banner is the strip every social profile has had for
              fifteen years, and it is the only part of this page that is
              purely yours to decorate. Empty, it is a soft wash of your accent
              rather than a grey box asking to be filled — nothing has gone
              wrong if you never add one.
              3:1 because it has to survive a 375px phone and a 1240px desktop
              at the same crop, and taller than that eats the screen on the
              phone. */}
          <div style={{
            position: 'relative', width: '100%', aspectRatio: '3',
            maxHeight: 220, overflow: 'hidden',
            background: cover ? 'var(--card2)'
              : `linear-gradient(120deg, color-mix(in srgb, var(--acc) 40%, transparent), color-mix(in srgb, ${hueOf(uid || 'x')} 30%, transparent))`,
          }}>
            <PhotoFrame src={cover} fit={coverFit} alt="Your cover picture" />

            <div style={{ position: 'absolute', right: 10, bottom: 10, display: 'flex', gap: 7 }}>
              {cover && (
                <button
                  onClick={() => setAdjusting(adjusting === 'cover' ? null : 'cover')}
                  className="k-squish"
                  aria-pressed={adjusting === 'cover'}
                  title="Reposition your cover"
                  style={PILL}>
                  <Icon name="hand" size={13} color="#fff" />
                  {adjusting === 'cover' ? 'Done' : 'Adjust'}
                </button>
              )}
              <label title={cover ? 'Change your cover' : 'Add a cover'} style={{ ...PILL, cursor: 'pointer', opacity: busyCover ? 0.5 : 1 }}>
                <Icon name={busyCover ? 'refresh' : 'photo'} size={13} color="#fff" />
                {busyCover ? 'Uploading…' : cover ? 'Change' : 'Add cover'}
                <input type="file" accept="image/*" hidden disabled={busyCover}
                  aria-label={cover ? 'Change your cover' : 'Add a cover'}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickCover(f); e.target.value = ''; }} />
              </label>
              {cover && (
                <button
                  onClick={() => { setCover(null); setCoverFit(CENTRED); setAdjusting(null); setDirty(true); toast('Cover removed'); }}
                  className="k-squish" aria-label="Remove your cover" title="Remove your cover"
                  style={{ ...PILL, padding: '6px 8px' }}>
                  <Icon name="close" size={12} color="#fff" />
                </button>
              )}
            </div>
          </div>

          {adjusting === 'cover' && cover && (
            <div style={{ padding: '13px 16px 0' }} className="rise">
              <div style={{ ...KICKER, marginBottom: 8 }}>Frame your cover</div>
              <FrameEditor src={cover} fit={coverFit} ratio={3} radius={12}
                onChange={(f) => { setCoverFit(f); setDirty(true); }} />
            </div>
          )}

          <div style={{ padding: '15px 16px' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ width: 132, height: 132, flex: 'none', position: 'relative', marginTop: -46 }}>
            <div style={{ width: 132, height: 132, borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--shl)', background: 'var(--card2)', border: '3px solid var(--card)' }}>
              {photo ? (
                <PhotoFrame src={photo} fit={photoFit} alt="Your profile picture" />
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
              <>
                <button onClick={() => { setPhoto(null); setPhotoFit(CENTRED); setAdjusting(null); setDirty(true); toast('Back to your drawn avatar'); }}
                  className="hov k-squish" aria-label="Remove your picture" title="Remove your picture"
                  style={{
                    position: 'absolute', left: -6, bottom: -6, width: 32, height: 32, borderRadius: 16,
                    background: 'var(--card)', border: '1px solid var(--line2)', display: 'grid', placeItems: 'center',
                  }}>
                  <Icon name="close" size={13} color="var(--tx2)" />
                </button>
                <button onClick={() => setAdjusting(adjusting === 'photo' ? null : 'photo')}
                  className="hov k-squish" aria-pressed={adjusting === 'photo'}
                  aria-label="Reposition your picture" title="Reposition your picture"
                  style={{
                    position: 'absolute', left: -6, top: -6, width: 32, height: 32, borderRadius: 16,
                    background: adjusting === 'photo' ? 'var(--acc)' : 'var(--card)',
                    border: '1px solid var(--line2)', display: 'grid', placeItems: 'center',
                  }}>
                  <Icon name="hand" size={13} color={adjusting === 'photo' ? ON_ACCENT : 'var(--tx2)'} />
                </button>
              </>
            )}
            </div>
          </div>

          {adjusting === 'photo' && photo && (
            <div style={{ marginTop: 14, maxWidth: 320 }} className="rise">
              <div style={{ ...KICKER, marginBottom: 8 }}>Frame your picture</div>
              <FrameEditor src={photo} fit={photoFit} ratio={1} radius={16}
                onChange={(f) => { setPhotoFit(f); setDirty(true); }} />
            </div>
          )}

          {/* Your creature.
              It was derived from your user id, which made it stable and made it
              nobody's choice — the one thing on a leaderboard that is visibly
              *you*, assigned by a hash. Picking one writes it to your profile,
              so everybody else's screen shows the animal you chose rather than
              the animal your id spelled. */}
          <div style={{ marginTop: 18, paddingTop: 15, borderTop: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={KICKER}>Your creature</div>
              <span style={{ fontSize: 11, color: 'var(--tx3)' }}>
                {animal ? 'Shown to everyone on challenges' : `Unset — you appear as a ${animalOf(uid || 'x')}`}
              </span>
              {animal && (
                <button onClick={() => { setAnimal(null); setDirty(true); }} className="hov"
                  style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 8, border: '1px solid var(--line2)', fontSize: 10.5, fontWeight: 700, color: 'var(--tx2)' }}>
                  Clear
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(64px,1fr))', gap: 8 }}>
              {ANIMALS.map((a) => {
                const on = animal === a;
                return (
                  <button key={a} onClick={() => { setAnimal(a); setDirty(true); }} aria-pressed={on}
                    className="k-squish" title={a}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                      padding: '10px 4px 8px', borderRadius: 14,
                      border: `1.5px solid ${on ? 'var(--acc)' : 'var(--line2)'}`,
                      background: on ? 'color-mix(in srgb, var(--acc) 14%, transparent)' : 'transparent',
                    }}>
                    <Mascot id={`pick-${a}`} animal={a} mood={on ? 'blazing' : 'keen'}
                      hue={hueOf(uid || a)} size={34} />
                    <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'capitalize', color: on ? 'var(--tx)' : 'var(--tx3)' }}>
                      {a}
                    </span>
                  </button>
                );
              })}
            </div>
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

        {/* Real Instagram Highlights Tray */}
        <div style={{ margin: '14px 0 6px' }}>
          {uid && <HighlightsTray userId={uid} isMe={true} me={uid} />}
        </div>

        {uid && <ProfileTimeline userId={uid} currentUserId={uid} phone={phone} />}

        {showArchive && uid && (
          <StoryArchiveModal me={uid} onClose={() => setShowArchive(false)} />
        )}

        {followListTab && (
          <FollowListModal initialTab={followListTab} onClose={() => setFollowListTab(null)} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ somebody else */

const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((s || '').trim());

/**
 * A profile reached by its link.
 */
function Visitor({ handle, phone }: { handle: string; phone: boolean }) {
  const router = useRouter();
  const { isFollowing, toggleFollow, getFollowerCount, getFollowingCount } = useFollows();
  const [who, setWho] = useState<{
    user_id: string; name: string; handle: string; bio: string; course: string; campus: string;
    photo: string | null; cover: string | null; photoFit: Fit; coverFit: Fit; animal: Animal | null;
  } | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void (async () => {
      const clean = (handle || '').trim().replace(/^@/, '');
      if (!clean) {
        if (active) setWho(null);
        return;
      }

      // 1. Try Supabase by UUID if clean is a valid UUID
      if (isUuid(clean)) {
        try {
          const { data } = await supabase
            .from('bd_profiles')
            .select('user_id,name,handle,bio,course,year,campus,photo_url,cover_url,photo_fit,cover_fit,animal')
            .eq('user_id', clean)
            .maybeSingle();

          if (data && active) {
            setWho({
              user_id: data.user_id,
              name: data.name ?? '',
              handle: data.handle ?? clean,
              bio: data.bio ?? '',
              course: [data.course, data.year].filter(Boolean).join(' · '),
              campus: data.campus ?? '',
              photo: data.photo_url ?? null,
              cover: data.cover_url ?? null,
              photoFit: toFit(data.photo_fit),
              coverFit: toFit(data.cover_fit),
              animal: (data.animal as Animal | null) ?? null,
            });
            return;
          }
        } catch {}
      }

      // 2. Try Supabase by handle
      try {
        const { data } = await supabase
          .from('bd_profiles')
          .select('user_id,name,handle,bio,course,year,campus,photo_url,cover_url,photo_fit,cover_fit,animal')
          .ilike('handle', clean)
          .maybeSingle();

        if (data && active) {
          setWho({
            user_id: data.user_id,
            name: data.name ?? '',
            handle: data.handle ?? clean,
            bio: data.bio ?? '',
            course: [data.course, data.year].filter(Boolean).join(' · '),
            campus: data.campus ?? '',
            photo: data.photo_url ?? null,
            cover: data.cover_url ?? null,
            photoFit: toFit(data.photo_fit),
            coverFit: toFit(data.cover_fit),
            animal: (data.animal as Animal | null) ?? null,
          });
          return;
        }
      } catch {}

      // 3. Try Supabase by name
      try {
        const { data } = await supabase
          .from('bd_profiles')
          .select('user_id,name,handle,bio,course,year,campus,photo_url,cover_url,photo_fit,cover_fit,animal')
          .ilike('name', clean)
          .maybeSingle();

        if (data && active) {
          setWho({
            user_id: data.user_id,
            name: data.name ?? '',
            handle: data.handle ?? clean,
            bio: data.bio ?? '',
            course: [data.course, data.year].filter(Boolean).join(' · '),
            campus: data.campus ?? '',
            photo: data.photo_url ?? null,
            cover: data.cover_url ?? null,
            photoFit: toFit(data.photo_fit),
            coverFit: toFit(data.cover_fit),
            animal: (data.animal as Animal | null) ?? null,
          });
          return;
        }
      } catch {}

      // 4. Try bd_people contacts
      try {
        const { data: person } = await supabase
          .from('bd_people')
          .select('id,name,category,email,note')
          .ilike('name', clean)
          .maybeSingle();

        if (person && active) {
          setWho({
            user_id: person.id,
            name: person.name,
            handle: person.name.toLowerCase().replace(/\s+/g, ''),
            bio: person.note || `Connected via Basedly ${person.category}.`,
            course: person.category,
            campus: person.email || 'Basedly Network',
            photo: null,
            cover: null,
            photoFit: { x: 50, y: 50, zoom: 1 },
            coverFit: { x: 50, y: 50, zoom: 1 },
            animal: animalOf(person.id),
          });
          return;
        }
      } catch {}

      // 5. Check predefined community members
      const presetKey = clean.toLowerCase();
      const communityUser = COMMUNITY_PROFILES[presetKey] || Object.values(COMMUNITY_PROFILES).find(
        (p) => p.handle?.toLowerCase() === presetKey || p.name.toLowerCase() === presetKey
      );

      if (communityUser && active) {
        setWho({
          user_id: communityUser.user_id,
          name: communityUser.name,
          handle: communityUser.handle || clean,
          bio: 'Active creator & discipline builder in the Basedly Community.',
          course: 'Productivity & Habits',
          campus: 'Basedly Arena',
          photo: communityUser.photo_url,
          cover: null,
          photoFit: toFit(communityUser.photo_fit),
          coverFit: { x: 50, y: 50, zoom: 1 },
          animal: communityUser.animal,
        });
        return;
      }

      // 6. Dynamic Mascot Profile for any user / ID on Basedly
      if (active) {
        const formattedName = clean.startsWith('user-')
          ? clean.slice(5)
          : clean.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        setWho({
          user_id: isUuid(clean) ? clean : `user-${clean}`,
          name: formattedName,
          handle: clean,
          bio: 'Building consistent habits, challenges, and goals on Basedly.',
          course: 'Basedly Member',
          campus: 'Global Campus',
          photo: null,
          cover: null,
          photoFit: { x: 50, y: 50, zoom: 1 },
          coverFit: { x: 50, y: 50, zoom: 1 },
          animal: animalOf(clean),
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [handle]);

  const pad = phone ? '14px 14px 24px' : '20px 24px 28px';

  if (who === undefined) {
    return <div style={{ padding: pad, fontSize: 12.5, color: 'var(--tx3)' }}>Looking for @{handle}…</div>;
  }

  if (who === null) {
    return (
      <div style={{ padding: pad, maxWidth: 640, marginInline: 'auto' }}>
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

  const isFollowed = isFollowing(who.handle) || (who.user_id ? isFollowing(who.user_id) : false);
  const followerCount = getFollowerCount(who.handle);
  const followingCount = getFollowingCount(who.handle);
  const initials = (who.name || who.handle).split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div style={{ padding: pad, maxWidth: 840, marginInline: 'auto' }}>
      <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
        {/* Cover */}
        <div style={{
          position: 'relative', width: '100%', aspectRatio: '3', maxHeight: 200, overflow: 'hidden',
          background: who.cover ? 'var(--card2)'
            : `linear-gradient(120deg, color-mix(in srgb, ${hueOf(who.user_id)} 42%, transparent), transparent)`,
        }}>
          <PhotoFrame src={who.cover} fit={who.coverFit} alt="" />
        </div>

        <div style={{ padding: '16px 20px' }}>
          {/* Instagram Header Layout */}
          <div style={{ display: 'flex', gap: phone ? 14 : 24, alignItems: 'flex-start' }}>
            {/* Left Circular Avatar with Story Ring */}
            <div style={{ position: 'relative', flex: 'none', marginTop: -42 }}>
              <div
                style={{
                  width: phone ? 88 : 110,
                  height: phone ? 88 : 110,
                  borderRadius: '50%',
                  padding: 3,
                  background: 'linear-gradient(135deg, var(--acc), #FF4365, #FFC24B)',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    background: 'var(--card)',
                    border: '3px solid var(--card)',
                  }}
                >
                  {who.photo ? (
                    <PhotoFrame src={who.photo} fit={who.photoFit} alt="" />
                  ) : (
                    <span style={{
                      width: '100%', height: '100%', display: 'grid', placeItems: 'center',
                      background: hueOf(who.user_id), fontSize: 26, fontWeight: 800, color: '#0C0F16',
                    }}>{initials}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Right Info & Stats */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, letterSpacing: '-.02em', color: 'var(--tx)' }}>
                  @{who.handle}
                </h1>
                <span style={{
                  padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 800,
                  background: 'color-mix(in srgb, var(--acc) 16%, transparent)', color: 'var(--accTx)',
                }}>
                  {who.animal ?? animalOf(who.user_id)}
                </span>
              </div>

              {/* Follower / Following Stats */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 6 }}>
                <span style={{ fontSize: 12.5, color: 'var(--tx2)' }}>
                  <strong style={{ color: 'var(--tx)', fontWeight: 800 }}>{followerCount}</strong> followers
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--tx2)' }}>
                  <strong style={{ color: 'var(--tx)', fontWeight: 800 }}>{followingCount}</strong> following
                </span>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={() => toggleFollow({ userId: who.user_id, handle: who.handle, name: who.name })}
                  className="acc k-squish"
                  style={{
                    padding: '8px 18px', borderRadius: 10,
                    background: isFollowed ? 'var(--card2)' : 'var(--acc)',
                    color: isFollowed ? 'var(--tx)' : 'var(--ink)',
                    fontSize: 12.5, fontWeight: 800, border: isFollowed ? '1px solid var(--line2)' : 'none',
                  }}
                >
                  {isFollowed ? 'Following ✓' : 'Follow +'}
                </button>
                <button
                  onClick={() => void startDm(who.user_id).then((id) => { if (id) router.push('/community/'); })}
                  className="hov k-squish"
                  style={{
                    padding: '8px 18px', borderRadius: 10, border: '1px solid var(--line2)',
                    background: 'var(--card2)', color: 'var(--tx)', fontSize: 12.5, fontWeight: 700,
                  }}
                >
                  Message
                </button>
                <button
                  onClick={() => { void navigator.clipboard?.writeText(window.location.href); toast('Profile link copied'); }}
                  className="hov k-squish"
                  style={{
                    width: 36, height: 36, borderRadius: 10, border: '1px solid var(--line2)',
                    display: 'grid', placeItems: 'center', background: 'var(--card2)',
                  }}
                >
                  <Icon name="share" size={14} color="var(--tx2)" />
                </button>
              </div>
            </div>
          </div>

          {/* User Bio & Meta */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--tx)' }}>{who.name || `@${who.handle}`}</div>
            {who.course && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accTx)', marginTop: 2 }}>{who.course}</div>}
            {who.campus && <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 1 }}>{who.campus}</div>}
            {who.bio && (
              <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--tx2)', margin: '8px 0 0', textWrap: 'pretty' }}>
                {who.bio}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Real Instagram Highlights Tray */}
      <div style={{ margin: '14px 0 6px' }}>
        {who.user_id && <HighlightsTray userId={who.user_id} isMe={false} me="" />}
      </div>

      {who.user_id && <ProfileTimeline userId={who.user_id} phone={phone} />}
    </div>
  );
}
