'use client';

import { useEffect, useState } from 'react';
import { supabase, currentUserId } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { PAL } from '@/lib/pal';
import { useLayout } from '@/lib/useLayout';

/**
 * Ported from Basedly.dc.html markup 663–758. The avatar is drawn as layered
 * SVG exactly as the prototype does; README flags the illustrated art as an
 * asset still to be sourced, so these vector parts are the same placeholder.
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
  const [avatar, setAvatar] = useState<Avatar>(DEFAULT_AVATAR);
  const [cat, setCat] = useState<AvKey>('bg');
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [course, setCourse] = useState('');
  const [campus, setCampus] = useState('');
  const [dirty, setDirty] = useState(false);
  const [uid, setUid] = useState('');

  useEffect(() => {
    void (async () => {
      const id = await currentUserId().catch(() => null);
      if (!id) return;
      setUid(id);
      const { data: p } = await supabase.from('bd_profiles')
        .select('name,handle,bio,course,year,campus,avatar').eq('user_id', id).maybeSingle();
      if (!p) return;
      setName(p.name ?? ''); setHandle(p.handle ?? ''); setBio(p.bio ?? '');
      setCourse([p.course, p.year].filter(Boolean).join(' · ')); setCampus(p.campus ?? '');
      if (p.avatar && Object.keys(p.avatar).length) setAvatar({ ...DEFAULT_AVATAR, ...p.avatar });
    })();
  }, []);

  const set = (k: AvKey, id: string) => { setAvatar((a) => ({ ...a, [k]: id })); setDirty(true); };

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
      .update({ name, handle: handle || null, bio, avatar }).eq('user_id', uid);
    if (error) return toast(error.message);
    setDirty(false);
    toast('Profile saved');
  }

  const [bg0, bg1] = pick(avatar, 'bg').v.split(',');
  const skin = pick(avatar, 'skin').v;
  const hairColor = pick(avatar, 'hairColor').v;
  const [eyeRx, eyeRy] = pick(avatar, 'eyes').v.split(',');

  return (
    <div style={{ padding: phone ? '16px 14px 26px' : '20px 24px 30px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.025em' }}>Profile</div>
        <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>Your face across Basedly</div>
        <button onClick={surprise} className="hov"
          style={{ marginLeft: 'auto', flex: 'none', padding: '10px 16px', borderRadius: 11, border: '1px solid var(--line2)', fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)', whiteSpace: 'nowrap' }}>
          Surprise me
        </button>
        <button onClick={save} className="acc" style={{
          flex: 'none', padding: '10px 18px', borderRadius: 11,
          background: dirty ? 'var(--acc)' : 'var(--card2)', color: dirty ? '#0A0912' : 'var(--tx3)',
          fontSize: 12.5, fontWeight: 800, transition: 'background .24s, color .24s',
        }}>
          {dirty ? 'Save changes' : 'Saved'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : '1fr 1fr', gap: 12, alignItems: 'start' }}>
        <div style={CARD}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ width: 132, height: 132, flex: 'none', borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--sh)' }}>
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

        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
            <div style={KICKER}>Build your avatar</div>
            <div style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--tx3)' }}>{AV_ORDER.length} categories</div>
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
      </div>
    </div>
  );
}
