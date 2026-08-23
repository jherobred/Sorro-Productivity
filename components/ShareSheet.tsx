'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useOverlayBack } from '@/lib/nav';
import { toast } from '@/lib/toast';
import { useLayout } from '@/lib/useLayout';
import { useProfiles, displayOf } from '@/lib/people';
import {
  useConversations, useMembers, useMessageActions, startDm, titleOf,
} from '@/lib/messages';
import { repostPost, isItemReposted, useReposts } from '@/lib/reposts';
import type { Item } from '@/lib/community';

export function ShareSheet({ item, me, onClose }: { item: Item; me: string; onClose: () => void }) {
  const { phone } = useLayout();
  useOverlayBack(true, onClose);

  const { data: profiles = {} } = useProfiles();
  const { data: convos = [] } = useConversations();
  const { data: members = [] } = useMembers();
  const A = useMessageActions(me);
  const reposts = useReposts();

  const [q, setQ] = useState('');
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [quoting, setQuoting] = useState(false);
  const [quoteThoughts, setQuoteThoughts] = useState('');

  const link = typeof location === 'undefined' ? '' : `${location.origin}/community/#${item.kind}-${item.id}`;
  const label = item.title || item.body || 'a post';
  const isReposted = isItemReposted(item.id, me);

  const nameOf = (id: string) => displayOf(profiles, id, me).label;

  const handleInstantRepost = () => {
    repostPost({
      itemId: item.id,
      kind: item.kind,
      authorId: item.author_id,
      userId: me,
    });
    onClose();
  };

  const handleQuoteRepost = () => {
    if (!quoteThoughts.trim()) {
      toast('Add a few words to your quote repost');
      return;
    }
    repostPost({
      itemId: item.id,
      kind: item.kind,
      authorId: item.author_id,
      userId: me,
      quoteText: quoteThoughts.trim(),
    });
    onClose();
  };

  /** Chats you already have, then everybody else you could start one with. */
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const chats = convos.map((c) => ({
      key: `c:${c.id}`, kind: 'chat' as const, id: c.id,
      label: titleOf(c, members, me, nameOf),
      face: members.find((m) => m.conversation_id === c.id && m.user_id !== me)?.user_id ?? me,
    }));
    const inChats = new Set(
      convos.filter((c) => !c.is_group)
        .flatMap((c) => members.filter((m) => m.conversation_id === c.id && m.user_id !== me).map((m) => m.user_id)),
    );
    const people = Object.values(profiles)
      .filter((p) => p.user_id !== me && !inChats.has(p.user_id))
      .map((p) => ({
        key: `p:${p.user_id}`, kind: 'person' as const, id: p.user_id,
        label: displayOf(profiles, p.user_id, me).label, face: p.user_id,
      }));
    return [...chats, ...people].filter((r) => !term || r.label.toLowerCase().includes(term));
  }, [convos, members, profiles, me, q]);

  const sendTo = async (row: { kind: 'chat' | 'person'; id: string; key: string; label: string }) => {
    const cid = row.kind === 'chat' ? row.id : await startDm(row.id);
    if (!cid) return;
    A.say(cid, note.trim(), { kind: item.kind, id: item.id });
    setSent((s) => new Set([...s, row.key]));
    toast(`Sent to ${row.label}`);
  };

  const native = async () => {
    try {
      await navigator.share?.({ title: label.slice(0, 60), text: label.slice(0, 140), url: link });
    } catch { /* dismissed */ }
  };

  const body = (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 140, background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: phone ? 'flex-end' : 'center', justifyContent: 'center', padding: phone ? 0 : 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Share"
        className="k-bloom" style={{
          width: 460, maxWidth: '100%', maxHeight: phone ? '86dvh' : '80dvh', display: 'flex', flexDirection: 'column',
          background: 'var(--card)', border: '1px solid var(--line2)',
          borderRadius: phone ? '18px 18px 0 0' : 18, boxShadow: 'var(--shl)', overflow: 'hidden',
        }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--line)' }}>
          <Icon name="send" size={15} color="var(--accTx)" />
          <h2 style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: '-.02em', flex: 1 }}>Share & Repost</h2>
          <button onClick={onClose} className="hov k-squish" aria-label="Close"
            style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
            <Icon name="close" size={14} color="var(--tx2)" />
          </button>
        </div>

        {/* Repost Options Banner */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', background: 'var(--card2)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 8 }}>
            Repost to your profile
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleInstantRepost}
              className="hov k-squish"
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '8px 12px', borderRadius: 10,
                border: `1px solid ${isReposted ? 'var(--acc)' : 'var(--line2)'}`,
                background: isReposted ? 'color-mix(in srgb, var(--acc) 16%, transparent)' : 'var(--card)',
                color: isReposted ? 'var(--accTx)' : 'var(--tx)', fontSize: 12, fontWeight: 700,
              }}
            >
              <Icon name="refresh" size={13} color={isReposted ? 'var(--accTx)' : 'var(--tx2)'} />
              {isReposted ? 'Reposted' : 'Instant Repost'}
            </button>
            <button
              onClick={() => setQuoting((v) => !v)}
              className="hov k-squish"
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '8px 12px', borderRadius: 10,
                border: `1px solid ${quoting ? 'var(--acc)' : 'var(--line2)'}`,
                background: quoting ? 'color-mix(in srgb, var(--acc) 16%, transparent)' : 'var(--card)',
                color: quoting ? 'var(--accTx)' : 'var(--tx)', fontSize: 12, fontWeight: 700,
              }}
            >
              <Icon name="edit" size={13} color={quoting ? 'var(--accTx)' : 'var(--tx2)'} />
              Quote Repost
            </button>
          </div>

          {quoting && (
            <div className="rise" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea
                value={quoteThoughts}
                onChange={(e) => setQuoteThoughts(e.target.value)}
                placeholder="Add your thoughts before reposting..."
                rows={2}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8,
                  border: '1px solid var(--acc)', background: 'var(--card)', color: 'var(--tx)',
                  fontSize: 12, lineHeight: 1.4, resize: 'none',
                }}
              />
              <button
                onClick={handleQuoteRepost}
                className="acc k-squish"
                style={{
                  alignSelf: 'flex-end', padding: '6px 14px', borderRadius: 8,
                  background: 'var(--acc)', color: 'var(--ink)', fontSize: 11.5, fontWeight: 800,
                }}
              >
                Post with Quote
              </button>
            </div>
          )}
        </div>

        <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx3)' }}>
            Send in Messages
          </div>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 36,
            borderRadius: 10, border: '1px solid var(--line2)', background: 'var(--card2)',
          }}>
            <Icon name="search" size={14} color="var(--tx3)" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people and chats"
              aria-label="Search people and chats"
              style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--tx)' }} />
          </label>

          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Say something (optional)"
            aria-label="Message to send with it"
            style={{
              width: '100%', minHeight: 36, padding: '9px 12px', borderRadius: 10,
              border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--tx)', fontSize: 12.5,
            }} />
        </div>

        <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 10px 6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {rows.length === 0 && (
            <div style={{ padding: '22px 8px', textAlign: 'center', fontSize: 11.5, color: 'var(--tx3)' }}>
              {q ? 'Nobody by that name.' : 'Nobody to send it to yet.'}
            </div>
          )}
          {rows.map((r) => {
            const done = sent.has(r.key);
            const who = displayOf(profiles, r.face, me);
            return (
              <button key={r.key} onClick={() => void sendTo(r)} disabled={done} className="hov"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 11,
                  textAlign: 'left', minHeight: 46, opacity: done ? 0.6 : 1,
                }}>
                <span aria-hidden style={{
                  width: 30, height: 30, flex: 'none', borderRadius: '50%', background: who.hue,
                  display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 700, color: '#0C0F16',
                }}>
                  {who.initials}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.label}
                </span>
                <span style={{
                  flex: 'none', padding: '4px 11px', borderRadius: 999, fontSize: 11, fontWeight: 800,
                  border: `1px solid ${done ? 'var(--line2)' : 'var(--acc)'}`,
                  color: done ? 'var(--tx3)' : 'var(--accTx)',
                }}>
                  {done ? 'Sent' : 'Send'}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '10px 16px 14px', borderTop: '1px solid var(--line)' }}>
          <button onClick={() => { void navigator.clipboard?.writeText(link); toast('Link copied'); }}
            className="hov k-squish" style={FOOT}>
            <Icon name="link" size={14} color="var(--tx2)" />Copy link
          </button>
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button onClick={() => void native()} className="hov k-squish" style={FOOT}>
              <Icon name="share" size={14} color="var(--tx2)" />More…
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(body, document.body);
}

const FOOT: React.CSSProperties = {
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  minHeight: 38, borderRadius: 11, border: '1px solid var(--line2)',
  fontSize: 12, fontWeight: 700, color: 'var(--tx2)',
};
