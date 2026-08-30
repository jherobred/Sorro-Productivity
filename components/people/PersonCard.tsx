'use client';

import { useRef, useState } from 'react';
import { Icon, type IconName } from '../Icon';
import { toast } from '@/lib/toast';
import { confirmAsk } from '@/lib/ask';
import { uploadTo, useSignedUrl, useSignedUrls } from '@/lib/uploads';

export type PersonLink = { label: string; url: string };
export type GalleryItem = { path: string; kind: 'image' | 'video' };

export type OsintData = {
  aliases?: string[];
  wallets?: { chain: string; address: string }[];
  pgp?: string;
  locations?: string[];
  organizations?: string[];
  networks?: string[]; // domains, IPs, WHOIS
  emails?: string[];
  phones?: string[];
  dossier_notes?: string;
  confidence?: 'confirmed' | 'probable' | 'unverified';
};

export type PersonRecord = {
  id: string;
  name: string;
  category: string;
  color: string;
  email: string;
  phone?: string | null;
  note: string;
  photo_path?: string | null;
  basedly_handle?: string | null;
  links?: PersonLink[] | null;
  gallery?: GalleryItem[] | null;
  osint?: OsintData | null;
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

const KICKER: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)',
};

const FIELD: React.CSSProperties = {
  width: '100%', padding: '8px 11px', borderRadius: 9, border: '1px solid var(--line2)',
  background: 'var(--card2)', fontSize: 12, color: 'var(--tx)', fontFamily: 'inherit',
  outline: 'none',
};

const SOCIAL_PLATFORMS: { label: string; icon: IconName; placeholder: string; prefix: (v: string) => string }[] = [
  {
    label: 'X (Twitter)',
    icon: 'chat',
    placeholder: '@handle or x.com/user',
    prefix: (v) => (v.startsWith('http') ? v : `https://x.com/${v.replace(/^@/, '')}`),
  },
  {
    label: 'Instagram',
    icon: 'photo',
    placeholder: '@handle or instagram.com/user',
    prefix: (v) => (v.startsWith('http') ? v : `https://instagram.com/${v.replace(/^@/, '')}`),
  },
  {
    label: 'LinkedIn',
    icon: 'people',
    placeholder: 'linkedin.com/in/username',
    prefix: (v) => (v.startsWith('http') ? v : `https://www.linkedin.com/in/${v.replace(/^@/, '').replace(/^in\//, '')}`),
  },
  {
    label: 'GitHub',
    icon: 'code',
    placeholder: 'username or github.com/user',
    prefix: (v) => (v.startsWith('http') ? v : `https://github.com/${v.replace(/^@/, '')}`),
  },
  {
    label: 'Telegram',
    icon: 'send',
    placeholder: '@username or t.me/user',
    prefix: (v) => (v.startsWith('http') ? v : `https://t.me/${v.replace(/^@/, '')}`),
  },
  {
    label: 'Discord',
    icon: 'chat',
    placeholder: 'username or discord.gg/code',
    prefix: (v) => (v.startsWith('http') ? v : `https://discord.com/users/${v}`),
  },
  {
    label: 'YouTube',
    icon: 'play',
    placeholder: 'youtube.com/@channel',
    prefix: (v) => (v.startsWith('http') ? v : `https://youtube.com/${v.startsWith('@') ? v : '@' + v}`),
  },
  {
    label: 'TikTok',
    icon: 'spark',
    placeholder: '@handle or tiktok.com/@user',
    prefix: (v) => (v.startsWith('http') ? v : `https://tiktok.com/@${v.replace(/^@/, '')}`),
  },
  {
    label: 'Facebook',
    icon: 'people',
    placeholder: 'facebook.com/username',
    prefix: (v) => (v.startsWith('http') ? v : `https://facebook.com/${v}`),
  },
  {
    label: 'Reddit',
    icon: 'chat',
    placeholder: 'u/username or reddit.com/u/user',
    prefix: (v) => (v.startsWith('http') ? v : `https://reddit.com/u/${v.replace(/^u\//, '')}`),
  },
  {
    label: 'Website',
    icon: 'link',
    placeholder: 'https://personal-site.com',
    prefix: (v) => (v.startsWith('http') ? v : `https://${v}`),
  },
  {
    label: 'Phone / WhatsApp',
    icon: 'phone',
    placeholder: '+1 234 567 8900',
    prefix: (v) => (v.startsWith('tel:') || v.startsWith('http') ? v : `tel:${v.replace(/\s+/g, '')}`),
  },
];

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
  const osint: OsintData = person.osint ?? {};

  const photoUrl = useSignedUrl('bd-files', person.photo_path);
  const galleryUrls = useSignedUrls('bd-files', gallery.map((g) => g.path));

  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(person.name === 'Untitled Person');
  const [activeTab, setActiveTab] = useState<'profile' | 'socials' | 'osint' | 'gallery'>('profile');
  const [showAllSocials, setShowAllSocials] = useState(false);

  // OSINT temporary inputs
  const [newAlias, setNewAlias] = useState('');
  const [newOrg, setNewOrg] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newNetwork, setNewNetwork] = useState('');
  const [newWalletChain, setNewWalletChain] = useState('ETH');
  const [newWalletAddr, setNewWalletAddr] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');

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

  const updateSocialLink = (label: string, rawVal: string, prefixFn: (v: string) => string) => {
    const val = rawVal.trim();
    const filtered = links.filter((l) => l.label.toLowerCase() !== label.toLowerCase());
    if (!val) {
      onPatch({ links: filtered });
    } else {
      const url = prefixFn(val);
      onPatch({ links: [...filtered, { label, url }] });
    }
  };

  const getSocialValue = (label: string): string => {
    const found = links.find((l) => l.label.toLowerCase() === label.toLowerCase());
    return found ? found.url : '';
  };

  const addCustomLink = () => {
    onPatch({ links: [...links, { label: 'Link', url: '' }] });
  };

  const updateCustomLink = (index: number, patch: Partial<PersonLink>) => {
    const next = [...links];
    next[index] = { ...next[index], ...patch };
    onPatch({ links: next });
  };

  const removeCustomLink = (index: number) => {
    const next = [...links];
    next.splice(index, 1);
    onPatch({ links: next });
  };

  // OSINT update helpers
  const patchOsint = (patch: Partial<OsintData>) => {
    const next: OsintData = { ...osint, ...patch };
    onPatch({ osint: next });
  };

  const primarySearchQuery = encodeURIComponent(
    `"${person.name}" ${person.basedly_handle ? `OR "${person.basedly_handle}"` : ''} ${
      osint.aliases?.length ? `OR "${osint.aliases[0]}"` : ''
    }`.trim()
  );

  const usernameQuery = (person.basedly_handle || osint.aliases?.[0] || person.name.toLowerCase().replace(/\s+/g, '')).replace(/^@/, '');

  return (
    <div style={{
      background: 'var(--card)', borderRadius: 16, padding: '18px 18px 20px',
      boxShadow: 'var(--sh)', minWidth: 0,
    }}>
      {/* Hidden file upload inputs */}
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

      {/* Header with Photo, Name & Delete */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
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
                fontSize: 18, fontWeight: 800, letterSpacing: '-.02em', textAlign: 'left',
                padding: '2px 4px', borderRadius: 6, maxWidth: '100%',
                color: person.name === 'Untitled Person' ? 'var(--tx3)' : 'var(--tx)',
              }}>
              {person.name || 'Untitled Person'}
            </button>
          )}
          <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{person.category}</span>
            {osint.confidence && (
              <span style={{
                fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 4,
                background: osint.confidence === 'confirmed' ? 'color-mix(in srgb, var(--pal-mint) 20%, transparent)' : 'color-mix(in srgb, var(--pal-amber) 20%, transparent)',
                color: osint.confidence === 'confirmed' ? 'var(--pal-mint)' : 'var(--pal-amber)',
              }}>
                {osint.confidence}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
          <button onClick={() => cameraInput.current?.click()} disabled={busy}
            className="hov" title="Take a photo" aria-label="Take a photo"
            style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center' }}>
            <Icon name="photo" size={14} color="var(--tx2)" />
          </button>
          <button onClick={() => void confirmAsk(`Move ${person.name} to Trash?`, {
            message: 'You can restore them anytime from the Trash archive.', confirmLabel: 'Move to Trash', danger: true,
          }).then((yes) => { if (yes) onDelete(); })}
            className="hov" title="Delete" aria-label={`Delete ${person.name}`}
            style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center' }}>
            <Icon name="trash" size={14} color="var(--tx2)" />
          </button>
        </div>
      </div>

      {/* Action shortcuts */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={onOpenProfile} className="hov k-squish" style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8,
          border: '1px solid var(--line2)', background: 'var(--card2)', fontSize: 11.5, fontWeight: 700,
        }}>
          <Icon name="people" size={12} color="var(--accTx)" />Profile
        </button>
        <button onClick={follow.toggle} className="acc k-squish" style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8,
          background: follow.on ? 'var(--card2)' : 'var(--acc)',
          color: follow.on ? 'var(--tx)' : 'var(--ink)',
          border: follow.on ? '1px solid var(--line2)' : 'none', fontSize: 11.5, fontWeight: 800,
        }}>{follow.on ? 'Following ✓' : 'Follow +'}</button>
        <button onClick={onMessage} className="hov k-squish" style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8,
          border: '1px solid var(--line2)', background: 'var(--card2)', fontSize: 11.5, fontWeight: 700,
        }}>
          <Icon name="send" size={12} color="var(--accTx)" />Message
        </button>
      </div>

      {/* Category Pills */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 16 }}>
        {cats.map((c) => (
          <button key={c} onClick={() => onPatch({ category: c, color: hueFor(c) })} style={{
            padding: '4px 9px', borderRadius: 7, fontSize: 11, fontWeight: 700,
            border: `1px solid ${person.category === c ? 'var(--acc)' : 'var(--line2)'}`,
            color: person.category === c ? 'var(--accTx)' : 'var(--tx2)',
            background: person.category === c ? 'color-mix(in srgb, var(--acc) 15%, transparent)' : 'transparent',
          }}>{c}</button>
        ))}
      </div>

      {/* Tabs navigation */}
      <div style={{
        display: 'flex', gap: 4, borderBottom: '1px solid var(--line2)', paddingBottom: 6, marginBottom: 14,
      }}>
        {[
          { id: 'profile', label: 'Contact', icon: 'people' as const },
          { id: 'socials', label: `Socials & Links (${links.length})`, icon: 'link' as const },
          { id: 'osint', label: 'OSINT & Dossier', icon: 'search' as const },
          { id: 'gallery', label: `Gallery (${gallery.length})`, icon: 'photo' as const },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className="hov"
            style={{
              padding: '6px 10px',
              borderRadius: 7,
              fontSize: 11.5,
              fontWeight: activeTab === tab.id ? 800 : 600,
              color: activeTab === tab.id ? 'var(--tx)' : 'var(--tx3)',
              background: activeTab === tab.id ? 'var(--card2)' : 'transparent',
              border: activeTab === tab.id ? '1px solid var(--line2)' : '1px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Icon name={tab.icon} size={12} color={activeTab === tab.id ? 'var(--accTx)' : 'var(--tx3)'} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: Profile & Core Contacts */}
      {activeTab === 'profile' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ ...KICKER, marginBottom: 6 }}>Primary Contact Info</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <InlineField
                label="Email Address"
                icon="send"
                value={person.email}
                placeholder="name@example.com"
                type="email"
                href={person.email ? `mailto:${person.email}` : undefined}
                onSave={(v) => onPatch({ email: v })}
              />
              <InlineField
                label="Phone / Mobile"
                icon="phone"
                value={person.phone ?? ''}
                placeholder="+1 234 567 8900"
                type="tel"
                href={person.phone ? `tel:${person.phone.replace(/\s+/g, '')}` : undefined}
                onSave={(v) => onPatch({ phone: v })}
              />
              <InlineField
                label="Basedly Profile"
                icon="focus"
                value={person.basedly_handle ?? ''}
                placeholder="@handle"
                href={person.basedly_handle ? `/profile/?u=${encodeURIComponent(person.basedly_handle.replace(/^@/, ''))}` : undefined}
                onSave={(v) => onPatch({ basedly_handle: v.replace(/^@/, '') })}
              />
            </div>
          </div>

          <div>
            <div style={{ ...KICKER, marginBottom: 6 }}>Notes & Memory</div>
            <textarea
              key={person.id}
              defaultValue={person.note}
              onBlur={(e) => e.target.value !== person.note && onPatch({ note: e.target.value })}
              rows={4}
              placeholder="How you met, what they're working on, what to follow up next…"
              style={{ ...FIELD, lineHeight: 1.6, resize: 'vertical' }}
            />
          </div>
        </div>
      )}

      {/* TAB 2: Social Media Platforms & Links (Editable right then and there!) */}
      {activeTab === 'socials' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={KICKER}>Social Media Platforms</div>
              <button
                type="button"
                onClick={() => setShowAllSocials(!showAllSocials)}
                className="hov"
                style={{ fontSize: 11, color: 'var(--accTx)', background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                {showAllSocials ? 'Show Top 6' : 'Show All Platforms'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {(showAllSocials ? SOCIAL_PLATFORMS : SOCIAL_PLATFORMS.slice(0, 6)).map((plat) => {
                const curVal = getSocialValue(plat.label);
                return (
                  <div key={plat.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      width: 110, flex: 'none', display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 11.5, fontWeight: 700, color: curVal ? 'var(--tx)' : 'var(--tx3)',
                    }}>
                      <Icon name={plat.icon} size={13} color={curVal ? 'var(--accTx)' : 'var(--tx3)'} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plat.label}</span>
                    </div>

                    <input
                      defaultValue={curVal}
                      placeholder={plat.placeholder}
                      onBlur={(e) => updateSocialLink(plat.label, e.target.value, plat.prefix)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      style={{ ...FIELD, flex: 1, minWidth: 0 }}
                    />

                    {curVal ? (
                      <a
                        href={normalise(curVal)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hov k-squish"
                        title={`Open ${plat.label}`}
                        style={{
                          width: 28, height: 28, borderRadius: 7, border: '1px solid var(--line2)',
                          background: 'var(--card2)', display: 'grid', placeItems: 'center', flex: 'none',
                        }}
                      >
                        <Icon name="link" size={12} color="var(--accTx)" />
                      </a>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Custom Links (Inline add & edit, no modals!) */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={KICKER}>Custom Links</div>
              <button
                type="button"
                onClick={addCustomLink}
                className="hov k-squish"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6,
                  border: '1px solid var(--line2)', background: 'var(--card2)', fontSize: 11, fontWeight: 700, color: 'var(--tx)',
                }}
              >
                <Icon name="plus" size={11} color="var(--accTx)" /> Add Custom Link
              </button>
            </div>

            {links.filter((l) => !SOCIAL_PLATFORMS.some((sp) => sp.label.toLowerCase() === l.label.toLowerCase())).length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--tx3)', padding: '6px 0' }}>
                No custom links yet. Click &quot;Add Custom Link&quot; to edit inline.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {links.map((link, idx) => {
                const isSocial = SOCIAL_PLATFORMS.some((sp) => sp.label.toLowerCase() === link.label.toLowerCase());
                if (isSocial) return null;
                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      defaultValue={link.label}
                      placeholder="Label (e.g. Portfolio)"
                      onBlur={(e) => updateCustomLink(idx, { label: e.target.value.trim() || 'Link' })}
                      style={{ ...FIELD, width: 100, flex: 'none', fontWeight: 700 }}
                    />
                    <input
                      defaultValue={link.url}
                      placeholder="https://..."
                      onBlur={(e) => updateCustomLink(idx, { url: normalise(e.target.value) })}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      style={{ ...FIELD, flex: 1, minWidth: 0 }}
                    />
                    {link.url && (
                      <a
                        href={normalise(link.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hov k-squish"
                        style={{
                          width: 28, height: 28, borderRadius: 7, border: '1px solid var(--line2)',
                          background: 'var(--card2)', display: 'grid', placeItems: 'center', flex: 'none',
                        }}
                      >
                        <Icon name="link" size={12} color="var(--accTx)" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => removeCustomLink(idx)}
                      className="hov"
                      title="Remove link"
                      style={{
                        width: 28, height: 28, borderRadius: 7, border: 'none', background: 'transparent',
                        display: 'grid', placeItems: 'center', flex: 'none', color: 'var(--tx3)', cursor: 'pointer',
                      }}
                    >
                      <Icon name="close" size={12} color="var(--tx3)" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: OSINT & Intelligence Suite */}
      {activeTab === 'osint' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Quick OSINT Search Launchers */}
          <div>
            <div style={{ ...KICKER, marginBottom: 6 }}>One-Click OSINT Search Launchers</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: 6 }}>
              <a
                href={`https://www.google.com/search?q=${primarySearchQuery}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hov k-squish"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 9px', borderRadius: 8,
                  border: '1px solid var(--line2)', background: 'var(--card2)', fontSize: 11, fontWeight: 700,
                  color: 'var(--tx)', textDecoration: 'none',
                }}
              >
                <Icon name="search" size={12} color="var(--pal-sky)" /> Google Dork
              </a>

              <a
                href={`https://whatsmyname.app/?q=${encodeURIComponent(usernameQuery)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hov k-squish"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 9px', borderRadius: 8,
                  border: '1px solid var(--line2)', background: 'var(--card2)', fontSize: 11, fontWeight: 700,
                  color: 'var(--tx)', textDecoration: 'none',
                }}
              >
                <Icon name="people" size={12} color="var(--pal-amber)" /> WhatsMyName
              </a>

              <a
                href={`https://web.archive.org/web/*/${encodeURIComponent(usernameQuery)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hov k-squish"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 9px', borderRadius: 8,
                  border: '1px solid var(--line2)', background: 'var(--card2)', fontSize: 11, fontWeight: 700,
                  color: 'var(--tx)', textDecoration: 'none',
                }}
              >
                <Icon name="clock" size={12} color="var(--pal-mint)" /> Wayback Machine
              </a>

              <a
                href={`https://github.com/search?q=${primarySearchQuery}&type=users`}
                target="_blank"
                rel="noopener noreferrer"
                className="hov k-squish"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 9px', borderRadius: 8,
                  border: '1px solid var(--line2)', background: 'var(--card2)', fontSize: 11, fontWeight: 700,
                  color: 'var(--tx)', textDecoration: 'none',
                }}
              >
                <Icon name="code" size={12} color="var(--pal-violet)" /> GitHub Search
              </a>

              <a
                href={`https://x.com/search?q=${primarySearchQuery}&f=user`}
                target="_blank"
                rel="noopener noreferrer"
                className="hov k-squish"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 9px', borderRadius: 8,
                  border: '1px solid var(--line2)', background: 'var(--card2)', fontSize: 11, fontWeight: 700,
                  color: 'var(--tx)', textDecoration: 'none',
                }}
              >
                <Icon name="chat" size={12} color="var(--pal-cyan)" /> X / Twitter Find
              </a>

              <a
                href={`https://intelx.io/?s=${encodeURIComponent(person.email || usernameQuery)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hov k-squish"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 9px', borderRadius: 8,
                  border: '1px solid var(--line2)', background: 'var(--card2)', fontSize: 11, fontWeight: 700,
                  color: 'var(--tx)', textDecoration: 'none',
                }}
              >
                <Icon name="lock" size={12} color="var(--pal-coral)" /> IntelX Breaches
              </a>
            </div>
          </div>

          {/* Aliases & Usernames */}
          <div>
            <div style={{ ...KICKER, marginBottom: 6 }}>Aliases, Nicknames & Usernames</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
              {(osint.aliases ?? []).map((alias, i) => (
                <span
                  key={i}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6,
                    background: 'var(--card2)', border: '1px solid var(--line2)', fontSize: 11.5, fontWeight: 700,
                  }}
                >
                  <span>{alias}</span>
                  <button
                    type="button"
                    onClick={() => patchOsint({ aliases: (osint.aliases ?? []).filter((_, idx) => idx !== i) })}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--tx3)', padding: 0 }}
                  >✕</button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newAlias.trim()) {
                    patchOsint({ aliases: [...(osint.aliases ?? []), newAlias.trim()] });
                    setNewAlias('');
                  }
                }}
                placeholder="Add alias / handle (press Enter)"
                style={{ ...FIELD, flex: 1 }}
              />
              <button
                type="button"
                onClick={() => {
                  if (newAlias.trim()) {
                    patchOsint({ aliases: [...(osint.aliases ?? []), newAlias.trim()] });
                    setNewAlias('');
                  }
                }}
                className="hov k-squish"
                style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--line2)', fontSize: 11.5, fontWeight: 700 }}
              >Add</button>
            </div>
          </div>

          {/* Crypto Wallets & PGP */}
          <div>
            <div style={{ ...KICKER, marginBottom: 6 }}>Crypto Wallets & PGP Public Key</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
              {(osint.wallets ?? []).map((w, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, padding: '4px 7px', borderRadius: 5, background: 'var(--card2)', border: '1px solid var(--line2)' }}>
                    {w.chain}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {w.address}
                  </span>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(w.address); toast(`Copied ${w.chain} address`); }}
                    className="hov"
                    title="Copy address"
                    style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--line2)', background: 'var(--card2)', display: 'grid', placeItems: 'center' }}
                  >
                    <Icon name="copy" size={11} color="var(--tx2)" />
                  </button>
                  <button
                    type="button"
                    onClick={() => patchOsint({ wallets: (osint.wallets ?? []).filter((_, idx) => idx !== i) })}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--tx3)' }}
                  >✕</button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <select
                value={newWalletChain}
                onChange={(e) => setNewWalletChain(e.target.value)}
                style={{ ...FIELD, width: 80, flex: 'none', fontWeight: 800 }}
              >
                <option value="ETH">ETH</option>
                <option value="BTC">BTC</option>
                <option value="SOL">SOL</option>
                <option value="USDT">USDT</option>
              </select>
              <input
                value={newWalletAddr}
                onChange={(e) => setNewWalletAddr(e.target.value)}
                placeholder="Wallet address (0x...)"
                style={{ ...FIELD, flex: 1, fontFamily: 'monospace' }}
              />
              <button
                type="button"
                onClick={() => {
                  if (newWalletAddr.trim()) {
                    patchOsint({ wallets: [...(osint.wallets ?? []), { chain: newWalletChain, address: newWalletAddr.trim() }] });
                    setNewWalletAddr('');
                  }
                }}
                className="hov k-squish"
                style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--line2)', fontSize: 11.5, fontWeight: 700 }}
              >Add</button>
            </div>

            {/* PGP Fingerprint */}
            <input
              defaultValue={osint.pgp ?? ''}
              placeholder="PGP Fingerprint / Key ID"
              onBlur={(e) => patchOsint({ pgp: e.target.value.trim() })}
              style={{ ...FIELD, fontFamily: 'monospace', fontSize: 11.5 }}
            />
          </div>

          {/* Affiliations, Locations, Domains & IPs */}
          <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ ...KICKER, marginBottom: 5 }}>Organizations / Workplaces</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 5 }}>
                {(osint.organizations ?? []).map((org, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 5, background: 'var(--card2)', border: '1px solid var(--line2)', fontSize: 11 }}>
                    {org}
                    <button type="button" onClick={() => patchOsint({ organizations: (osint.organizations ?? []).filter((_, idx) => idx !== i) })} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--tx3)' }}>✕</button>
                  </span>
                ))}
              </div>
              <input
                value={newOrg}
                onChange={(e) => setNewOrg(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newOrg.trim()) {
                    patchOsint({ organizations: [...(osint.organizations ?? []), newOrg.trim()] });
                    setNewOrg('');
                  }
                }}
                placeholder="Add org / company"
                style={FIELD}
              />
            </div>

            <div>
              <div style={{ ...KICKER, marginBottom: 5 }}>Known Locations & Cities</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 5 }}>
                {(osint.locations ?? []).map((loc, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 5, background: 'var(--card2)', border: '1px solid var(--line2)', fontSize: 11 }}>
                    {loc}
                    <button type="button" onClick={() => patchOsint({ locations: (osint.locations ?? []).filter((_, idx) => idx !== i) })} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--tx3)' }}>✕</button>
                  </span>
                ))}
              </div>
              <input
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newLocation.trim()) {
                    patchOsint({ locations: [...(osint.locations ?? []), newLocation.trim()] });
                    setNewLocation('');
                  }
                }}
                placeholder="Add city / region"
                style={FIELD}
              />
            </div>
          </div>

          {/* Dossier Log & Confidence Assessment */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <div style={KICKER}>Intelligence Dossier & Findings</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--tx3)', fontWeight: 700 }}>Confidence:</span>
                <select
                  value={osint.confidence ?? 'probable'}
                  onChange={(e) => patchOsint({ confidence: e.target.value as OsintData['confidence'] })}
                  style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: 'var(--card2)', border: '1px solid var(--line2)', color: 'var(--tx)' }}
                >
                  <option value="confirmed">Confirmed</option>
                  <option value="probable">Probable</option>
                  <option value="unverified">Unverified</option>
                </select>
              </div>
            </div>
            <textarea
              defaultValue={osint.dossier_notes ?? ''}
              onBlur={(e) => patchOsint({ dossier_notes: e.target.value })}
              rows={4}
              placeholder="Investigation logs, known associates, verified identities, timestamps, sources…"
              style={{ ...FIELD, lineHeight: 1.55, resize: 'vertical' }}
            />
          </div>
        </div>
      )}

      {/* TAB 4: Gallery */}
      {activeTab === 'gallery' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
            <div style={KICKER}>Gallery Photos & Media</div>
            <button onClick={() => galleryInput.current?.click()} disabled={busy}
              className="hov" aria-label="Add photos or video" title="Add photos or video"
              style={{ marginLeft: 'auto', width: 22, height: 22, borderRadius: 7, display: 'grid', placeItems: 'center' }}>
              <Icon name="plus" size={13} color="var(--tx3)" />
            </button>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: `repeat(${phone ? 3 : 4}, 1fr)`, gap: 6,
          }}>
            {gallery.length === 0 && (
              <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--tx3)', padding: '12px 0' }}>
                No photos or video yet. Tap + to upload images or videos.
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
        </div>
      )}
    </div>
  );
}

/** An inline field: editable right then and there with 1-click link/action */
function InlineField({
  label, icon, value, placeholder, type = 'text', href, onSave,
}: {
  label: string;
  icon: IconName;
  value: string;
  placeholder: string;
  type?: string;
  href?: string;
  onSave: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 110, flex: 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: value ? 'var(--tx)' : 'var(--tx3)' }}>
        <Icon name={icon} size={13} color={value ? 'var(--accTx)' : 'var(--tx3)'} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      <input
        type={type}
        defaultValue={value}
        placeholder={placeholder}
        onBlur={(e) => onSave(e.target.value.trim())}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        style={{ ...FIELD, flex: 1, minWidth: 0 }}
      />
      {value && href && (
        <a
          href={href}
          className="hov k-squish"
          title={`Open ${label}`}
          style={{
            width: 28, height: 28, borderRadius: 7, border: '1px solid var(--line2)',
            background: 'var(--card2)', display: 'grid', placeItems: 'center', flex: 'none',
          }}
        >
          <Icon name="link" size={12} color="var(--accTx)" />
        </a>
      )}
    </div>
  );
}

/**
 * A person's face at any size, falling back to their initials.
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
