'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useOverlayBack } from '@/lib/nav';
import { toast } from '@/lib/toast';
import { useLayout } from '@/lib/useLayout';
import { uploadTo } from '@/lib/uploads';
import { TAGS, MAX_IMAGES } from '@/lib/community';
import type { ListingKind, PostListing } from '@/lib/rpTransfers';

export type Draft = {
  title: string;
  body: string;
  tag: string;
  images: string[];
  accept_rp?: boolean;
  suggested_rp?: number;
  listing?: PostListing | null;
};

const LISTING_TYPES: { id: ListingKind; label: string; icon: string }[] = [
  { id: 'item', label: 'Item / Merch', icon: '📦' },
  { id: 'service', label: 'Service / Help', icon: '🛠️' },
  { id: 'digital', label: 'Digital / Code', icon: '💻' },
  { id: 'account', label: 'Account / Asset', icon: '🎮' },
  { id: 'other', label: 'Other', icon: '✨' },
];

export function Composer({ onClose, onPost }: {
  onClose: () => void;
  onPost: (v: Draft) => void;
}) {
  const { phone } = useLayout();
  useOverlayBack(true, onClose);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tag, setTag] = useState('');
  const [acceptRp, setAcceptRp] = useState<boolean>(true);
  const [isSelling, setIsSelling] = useState<boolean>(false);
  const [listingType, setListingType] = useState<ListingKind>('item');
  const [priceRp, setPriceRp] = useState<number>(50);
  const [deliveryInfo, setDeliveryInfo] = useState<string>('');
  const [images, setImages] = useState<{ path: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => { first.current?.focus(); }, []);

  const live = useRef<{ path: string; url: string }[]>([]);
  live.current = images;
  useEffect(() => () => { for (const i of live.current) URL.revokeObjectURL(i.url); }, []);

  const attach = async (files: File[]) => {
    const pics = files.filter((f) => f.type.startsWith('image/'));
    if (!pics.length) { toast('That is not an image'); return; }

    const room = MAX_IMAGES - images.length;
    if (room <= 0) { toast(`${MAX_IMAGES} pictures is the limit`); return; }
    const taking = pics.slice(0, room);
    if (pics.length > room) toast(`Added ${room} — ${MAX_IMAGES} is the limit`);

    setBusy(true);
    try {
      for (const f of taking) {
        const path = await uploadTo('bd-feed', f);
        setImages((p) => [...p, { path, url: URL.createObjectURL(f) }]);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const send = () => {
    const ready = title.trim() || body.trim() || images.length;
    if (!ready || busy) return;

    const listingObj: PostListing | null = isSelling ? {
      is_for_sale: true,
      price_rp: Number(priceRp) || 10,
      item_name: title.trim() || 'Marketplace Item',
      item_type: listingType,
      description: body.trim(),
      delivery_info: deliveryInfo.trim(),
      is_sold: false,
    } : null;

    onPost({
      title: title.trim(),
      body: body.trim(),
      tag,
      images: images.map((x) => x.path),
      accept_rp: acceptRp || isSelling,
      listing: listingObj,
    });
    onClose();
  };

  const ready = !!(title.trim() || body.trim() || images.length);
  const hint = !ready
    ? 'Add a title, a few words, or a picture'
    : isSelling
    ? `Selling for ${priceRp.toLocaleString()} RP 💎`
    : images.length
    ? `${images.length} of ${MAX_IMAGES} pictures`
    : 'Ready';

  const body_ = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,.68)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: phone ? 'flex-end' : 'center', justifyContent: 'center',
        padding: phone ? 0 : 16,
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="New post"
        className="k-bloom"
        style={{
          width: 580, maxWidth: '100%',
          maxHeight: phone ? '92dvh' : '90vh',
          borderRadius: phone ? '20px 20px 0 0' : 20,
          background: 'var(--card)',
          border: '1px solid var(--line2)',
          boxShadow: 'var(--sh-dialog)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--line)',
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-.02em', color: 'var(--tx)', margin: 0 }}>
            {isSelling ? '🛍️ Sell an Item or Service' : 'New Post'}
          </h2>
          <button onClick={onClose} aria-label="Close" className="hov"
            style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
            <Icon name="close" size={14} color="var(--tx2)" />
          </button>
        </div>

        <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input ref={first} value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder={isSelling ? "Item or Service Title" : "Title (optional)"} aria-label="Title"
            style={{ width: '100%', minHeight: 42, fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--tx)' }} />

          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={images.length ? 3 : 4}
            aria-label="Body"
            placeholder={isSelling ? "Describe what you're selling, specifications, condition, etc…" : "Say more (optional)"}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--line2)',
              background: 'var(--card2)', fontSize: 12.5, lineHeight: 1.6, color: 'var(--tx)', resize: 'vertical',
            }} />

          {images.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 8 }}>
              {images.map((im, i) => (
                <div key={im.path} style={{
                  position: 'relative', aspectRatio: '1', borderRadius: 12, overflow: 'hidden', background: 'var(--card2)',
                }}>
                  <img src={im.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  {i === 0 && images.length > 1 && (
                    <span style={{
                      position: 'absolute', left: 6, top: 6, padding: '2px 7px', borderRadius: 6,
                      background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 9, fontWeight: 800, letterSpacing: '.06em',
                    }}>COVER</span>
                  )}
                  <button onClick={() => setImages((p) => p.filter((x) => x.path !== im.path))}
                    className="hov" aria-label={`Remove picture ${i + 1}`}
                    style={{
                      position: 'absolute', right: 5, top: 5, width: 26, height: 26, borderRadius: 8,
                      display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.6)',
                    }}>
                    <Icon name="close" size={12} color="#fff" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {images.length < MAX_IMAGES && (
            <label style={{
              display: 'grid', placeItems: 'center', gap: 8,
              padding: images.length ? '14px 16px' : '24px 16px', textAlign: 'center',
              border: '1.5px dashed var(--line2)', borderRadius: 14, cursor: 'pointer', opacity: busy ? 0.5 : 1,
            }}>
              <Icon name="image" size={images.length ? 16 : 22} color="var(--tx3)" />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)' }}>
                {busy ? 'Uploading…' : images.length ? 'Add another photo' : 'Add pictures / media (optional)'}
              </span>
              <input type="file" accept="image/*" multiple hidden
                onChange={(e) => { void attach(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
            </label>
          )}

          {/* Tags */}
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 7 }}>
              Tag — optional
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['', ...TAGS] as const).map((t) => {
                const on = tag === t;
                return (
                  <button key={t || 'none'} onClick={() => setTag(t)} aria-pressed={on} className="k-chip"
                    style={{
                      padding: '5px 12px', borderRadius: 999, minHeight: 30, fontSize: 11, fontWeight: 700,
                      border: `1px solid ${on ? 'var(--acc)' : 'var(--line2)'}`,
                      background: on ? 'color-mix(in srgb, var(--acc) 16%, transparent)' : 'transparent',
                      color: on ? 'var(--accTx)' : t ? 'var(--tx2)' : 'var(--tx3)',
                    }}>
                    {t || 'No tag'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Marketplace / Selling Section */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 14,
              background: isSelling ? 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(6,78,59,0.2) 100%)' : 'var(--card2)',
              border: isSelling ? '1.5px solid #10B981' : '1px solid var(--line2)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              transition: 'all .2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>🛍️</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx)' }}>
                    Sell Item / Service / Digital Good
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                    Accept RP payments directly on this post
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsSelling(!isSelling)}
                className="k-squish"
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  fontSize: 11.5,
                  fontWeight: 800,
                  background: isSelling ? '#10B981' : 'var(--card)',
                  border: isSelling ? '1px solid #34D399' : '1px solid var(--line)',
                  color: isSelling ? '#041F14' : 'var(--tx2)',
                  cursor: 'pointer',
                }}
              >
                {isSelling ? 'Active ✓' : 'Enable Selling'}
              </button>
            </div>

            {isSelling && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                {/* Type Selection */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 5 }}>
                    Listing Category
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {LISTING_TYPES.map((lt) => {
                      const on = listingType === lt.id;
                      return (
                        <button
                          key={lt.id}
                          type="button"
                          onClick={() => setListingType(lt.id)}
                          className="k-squish"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '4px 10px',
                            borderRadius: 8,
                            fontSize: 11,
                            fontWeight: 700,
                            background: on ? '#10B981' : 'var(--card)',
                            border: on ? '1px solid #34D399' : '1px solid var(--line2)',
                            color: on ? '#041F14' : 'var(--tx2)',
                            cursor: 'pointer',
                          }}
                        >
                          <span>{lt.icon}</span>
                          <span>{lt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Price in RP */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 5 }}>
                    Price in RP 💎
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="number"
                      min={1}
                      max={100000}
                      value={priceRp}
                      onChange={(e) => setPriceRp(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      style={{
                        width: 110,
                        padding: '6px 10px',
                        borderRadius: 8,
                        background: 'var(--card)',
                        border: '1px solid var(--line2)',
                        fontSize: 14,
                        fontWeight: 900,
                        color: '#FDE047',
                        fontFamily: 'monospace',
                      }}
                    />
                    {[25, 50, 100, 250, 500, 1000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setPriceRp(preset)}
                        className="k-squish"
                        style={{
                          padding: '4px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          background: priceRp === preset ? 'rgba(16,185,129,0.2)' : 'var(--card)',
                          border: priceRp === preset ? '1px solid #10B981' : '1px solid var(--line2)',
                          color: priceRp === preset ? '#34D399' : 'var(--tx3)',
                          cursor: 'pointer',
                        }}
                      >
                        {preset} RP
                      </button>
                    ))}
                  </div>
                </div>

                {/* Delivery / Instructions */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 4 }}>
                    Delivery / Order Instructions (Optional)
                  </div>
                  <input
                    type="text"
                    value={deliveryInfo}
                    onChange={(e) => setDeliveryInfo(e.target.value)}
                    placeholder="e.g. DM me for key code / Instant download / Physical pickup at library"
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: 8,
                      background: 'var(--card)',
                      border: '1px solid var(--line2)',
                      fontSize: 12,
                      color: 'var(--tx)',
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* RP Currency Acceptance Card (if not selling) */}
          {!isSelling && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 14,
                background: acceptRp ? 'rgba(99, 102, 241, 0.12)' : 'var(--card2)',
                border: acceptRp ? '1.5px solid rgba(129, 140, 248, 0.4)' : '1px solid var(--line2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                transition: 'all .2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 20 }}>💎</span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--tx)' }}>
                    Accept RP Tips & Rewards
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                    Allow readers to reward you with RP
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setAcceptRp(!acceptRp)}
                aria-pressed={acceptRp}
                className="k-squish"
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  fontSize: 11.5,
                  fontWeight: 800,
                  background: acceptRp ? '#6366F1' : 'var(--card)',
                  border: acceptRp ? '1px solid #818CF8' : '1px solid var(--line)',
                  color: acceptRp ? '#FFFFFF' : 'var(--tx2)',
                  cursor: 'pointer',
                }}
              >
                {acceptRp ? 'Tips On ✓' : 'Disabled'}
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderTop: '1px solid var(--line)' }}>
          <span style={{ fontSize: 11, color: 'var(--tx3)', flex: 1, minWidth: 0 }}>{hint}</span>
          <button onClick={send} disabled={!ready || busy} className="acc k-squish"
            style={{
              minHeight: 38, padding: '0 20px', borderRadius: 11, flex: 'none',
              background: isSelling ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)' : 'var(--acc)',
              color: isSelling ? '#041F14' : '#0A0912', fontSize: 12.5, fontWeight: 800,
              opacity: ready && !busy ? 1 : 0.45,
            }}>
            {isSelling ? 'List for Sale 🛍️' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(body_, document.body);
}
