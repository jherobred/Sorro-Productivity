'use client';

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { RANKED } from './challenges';
import { toast } from './toast';
import { playCelebration } from './audio';
import { startDm } from './messages';

export type RpTransaction = {
  id: string;
  from_id: string;
  to_id: string;
  amount: number;
  reason?: string;
  post_id?: string;
  conversation_id?: string;
  created_at: string;
};

export type ListingKind = 'item' | 'service' | 'digital' | 'account' | 'other';

export type PostListing = {
  is_for_sale: boolean;
  price_rp: number;
  item_name: string;
  item_type: ListingKind;
  description?: string;
  delivery_info?: string;
  is_sold: boolean;
  buyer_id?: string;
  sold_at?: string;
};

export type PostRpSettings = {
  accept_rp: boolean;
  min_rp?: number;
  suggested_rp?: number;
  total_tipped: number;
  listing?: PostListing | null;
};

const POST_RP_STORAGE_KEY = 'sorro_post_rp_settings_v2';
const RP_REQUESTS_STORAGE_KEY = 'sorro_rp_requests_v1';
const CLAIMED_RP_KEY_PREFIX = 'sorro_claimed_rp_txs_';

// Read all post RP settings from persistent registry
function getStoredPostRpSettings(): Record<string, PostRpSettings> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(POST_RP_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoredPostRpSettings(settings: Record<string, PostRpSettings>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(POST_RP_STORAGE_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

/** Set post RP acceptance and listing settings */
export function setPostRpConfig(
  postId: string,
  config: {
    accept_rp: boolean;
    suggested_rp?: number;
    listing?: PostListing | null;
  }
) {
  const current = getStoredPostRpSettings();
  current[postId] = {
    accept_rp: config.accept_rp,
    suggested_rp: config.suggested_rp || 10,
    total_tipped: current[postId]?.total_tipped || 0,
    listing: config.listing !== undefined ? config.listing : current[postId]?.listing || null,
  };
  saveStoredPostRpSettings(current);
}

/** Get post RP settings, tips, and listing info */
export function getPostRpConfig(postId: string): PostRpSettings {
  const all = getStoredPostRpSettings();
  return all[postId] || { accept_rp: false, suggested_rp: 10, total_tipped: 0, listing: null };
}

/** Set marketplace listing for a post */
export function setPostListing(postId: string, listing: PostListing | null) {
  const current = getStoredPostRpSettings();
  const existing = current[postId] || { accept_rp: true, suggested_rp: 10, total_tipped: 0, listing: null };
  existing.listing = listing;
  if (listing && listing.is_for_sale) {
    existing.accept_rp = true;
  }
  current[postId] = existing;
  saveStoredPostRpSettings(current);
}

/** Get marketplace listing for a post */
export function getPostListing(postId: string): PostListing | null {
  const cfg = getPostRpConfig(postId);
  return cfg.listing || null;
}

/**
 * Buy a listed item or service on a post using RP
 */
export async function buyPostItem({
  postId,
  sellerId,
  price,
  itemName,
  deliveryInfo,
}: {
  postId: string;
  sellerId: string;
  price: number;
  itemName: string;
  deliveryInfo?: string;
}): Promise<boolean> {
  const myId = await currentUserId();
  if (!myId) {
    toast('Please sign in to make a purchase');
    return false;
  }

  if (myId === sellerId) {
    toast('You cannot purchase your own listing');
    return false;
  }

  const txId = `buy_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ok = await sendRp({
    toUserId: sellerId,
    amount: price,
    reason: `Purchased: ${itemName}`,
    postId,
    txId,
  });

  if (!ok) return false;

  // Mark listing as sold
  const all = getStoredPostRpSettings();
  const existing = all[postId];
  if (existing && existing.listing) {
    existing.listing.is_sold = true;
    existing.listing.buyer_id = myId;
    existing.listing.sold_at = new Date().toISOString();
    all[postId] = existing;
    saveStoredPostRpSettings(all);
  }

  // Send DM receipt with transaction to seller so recipient's account credits automatically
  try {
    const dmId = await startDm(sellerId);
    if (dmId) {
      const dmText = encodeRpSendMessage(
        price,
        txId,
        `🛍️ Purchased "${itemName}" for ${price.toLocaleString()} RP! ${deliveryInfo ? `Delivery: ${deliveryInfo}` : ''}`
      );
      await supabase.from('bd_messages').insert({
        conversation_id: dmId,
        author_id: myId,
        body: dmText,
      });
    }
  } catch (err) {
    console.error('Failed to notify seller in DM:', err);
  }

  return true;
}

/**
 * Execute an RP transfer from current user to a recipient (for tips, direct sends, purchases, or invoices).
 */
export async function sendRp({
  toUserId,
  amount,
  reason,
  postId,
  conversationId,
  txId: customTxId,
}: {
  toUserId: string;
  amount: number;
  reason?: string;
  postId?: string;
  conversationId?: string;
  txId?: string;
}): Promise<boolean> {
  if (amount <= 0) {
    toast('RP amount must be greater than 0');
    return false;
  }

  const myId = await currentUserId();
  if (!myId) {
    toast('Please sign in to send RP');
    return false;
  }

  if (myId === toUserId) {
    toast('Cannot transfer RP to yourself');
    return false;
  }

  try {
    // 1. Check sender's current RP balance
    const { data: myRanked } = await supabase
      .from('bd_ranked')
      .select('rp,peak_rp')
      .eq('user_id', myId)
      .maybeSingle();

    const senderCurrentRp = myRanked?.rp ?? 0;
    if (senderCurrentRp < amount) {
      toast(`Insufficient RP (You have ${senderCurrentRp.toLocaleString()} RP, need ${amount.toLocaleString()} RP)`);
      return false;
    }

    const newSenderRp = senderCurrentRp - amount;

    // 2. Deduct from sender
    const { error: senderErr } = await supabase
      .from('bd_ranked')
      .update({ rp: newSenderRp })
      .eq('user_id', myId);

    if (senderErr) throw senderErr;

    // 3. Attempt direct credit to recipient if permitted
    try {
      const { data: theirRanked } = await supabase
        .from('bd_ranked')
        .select('rp,peak_rp')
        .eq('user_id', toUserId)
        .maybeSingle();

      if (theirRanked) {
        await supabase
          .from('bd_ranked')
          .update({
            rp: (theirRanked.rp ?? 0) + amount,
            peak_rp: Math.max((theirRanked.rp ?? 0) + amount, theirRanked.peak_rp || 0),
          })
          .eq('user_id', toUserId);
      }
    } catch {
      // Direct recipient write may be blocked by Supabase RLS; auto-claim handles credit on recipient side!
    }

    // 4. Update post tip total if applicable
    if (postId) {
      const all = getStoredPostRpSettings();
      const existing = all[postId] || { accept_rp: true, suggested_rp: 10, total_tipped: 0, listing: null };
      existing.total_tipped = (existing.total_tipped || 0) + amount;
      all[postId] = existing;
      saveStoredPostRpSettings(all);
    }

    playCelebration();
    return true;
  } catch (err) {
    console.error('RP Transfer failed:', err);
    toast(err instanceof Error ? err.message : 'RP transfer failed');
    return false;
  }
}

/**
 * Send RP via a Post Send/Tip button and automatically notify the author via DM message
 */
export async function sendRpWithPostNotification({
  authorId,
  authorName,
  amount,
  postTitle,
  postId,
  note,
}: {
  authorId: string;
  authorName: string;
  amount: number;
  postTitle: string;
  postId: string;
  note?: string;
}): Promise<boolean> {
  const myId = await currentUserId();
  if (!myId) {
    toast('Please sign in to send RP');
    return false;
  }

  const txId = `tip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ok = await sendRp({
    toUserId: authorId,
    amount,
    reason: note || `Tipped on post: "${postTitle.slice(0, 40)}"`,
    postId,
    txId,
  });

  if (!ok) return false;

  // Send DM message notification to the author
  try {
    const dmId = await startDm(authorId);
    if (dmId) {
      const formattedNote = note
        ? `💎 Tipped ${amount.toLocaleString()} RP on "${postTitle.slice(0, 40)}": ${note}`
        : `💎 Tipped ${amount.toLocaleString()} RP on your post: "${postTitle.slice(0, 40)}"`;
      const body = encodeRpSendMessage(amount, txId, formattedNote);
      await supabase.from('bd_messages').insert({
        conversation_id: dmId,
        author_id: myId,
        body,
      });
    }
  } catch (err) {
    console.error('Could not send DM notification to author:', err);
  }

  return true;
}

/**
 * Message Tag Parsers and Encoders for RP, Money ($), and Post References
 */
export type RpMessageData =
  | { type: 'send_rp'; amount: number; txId: string; note: string }
  | { type: 'ask_rp'; amount: number; reqId: string; note: string; isPaid: boolean }
  | { type: 'send_money'; amount: number; txId: string; note: string }
  | { type: 'ask_money'; amount: number; reqId: string; note: string; isPaid: boolean }
  | { type: 'post_ref'; postId: string; title: string; imagePath?: string }
  | null;

export function encodeRpSendMessage(amount: number, txId: string, note: string = ''): string {
  return `[RP_SEND:${amount}:${txId}:${encodeURIComponent(note)}]`;
}

export function encodeRpAskMessage(amount: number, reqId: string, note: string = '', isPaid: boolean = false): string {
  return `[RP_ASK:${amount}:${reqId}:${encodeURIComponent(note)}:${isPaid ? 'paid' : 'pending'}]`;
}

export function encodeMoneySendMessage(amount: number, txId: string, note: string = ''): string {
  return `[MONEY_SEND:${amount}:${txId}:${encodeURIComponent(note)}]`;
}

export function encodeMoneyAskMessage(amount: number, reqId: string, note: string = '', isPaid: boolean = false): string {
  return `[MONEY_ASK:${amount}:${reqId}:${encodeURIComponent(note)}:${isPaid ? 'paid' : 'pending'}]`;
}

export function encodePostRefMessage(postId: string, title: string, imagePath?: string): string {
  return `[POST_REF:${postId}:${encodeURIComponent(title)}:${imagePath ? encodeURIComponent(imagePath) : ''}]`;
}

export function parseRpMessage(body: string): RpMessageData {
  if (!body) return null;

  // 1. RP Send
  const sendMatch = body.match(/\[RP_SEND:(\d+):([^:]+):?([^\]]*)\]/);
  if (sendMatch) {
    return {
      type: 'send_rp',
      amount: parseInt(sendMatch[1], 10),
      txId: sendMatch[2],
      note: decodeURIComponent(sendMatch[3] || ''),
    };
  }

  // 2. RP Ask / Request
  const askMatch = body.match(/\[RP_ASK:(\d+):([^:]+):?([^:]*):?(paid|pending)?\]/);
  if (askMatch) {
    return {
      type: 'ask_rp',
      amount: parseInt(askMatch[1], 10),
      reqId: askMatch[2],
      note: decodeURIComponent(askMatch[3] || ''),
      isPaid: askMatch[4] === 'paid' || isRequestPaidLocally(askMatch[2]),
    };
  }

  // 3. Money Send ($)
  const moneySendMatch = body.match(/\[MONEY_SEND:([\d\.]+):([^:]+):?([^\]]*)\]/);
  if (moneySendMatch) {
    return {
      type: 'send_money',
      amount: parseFloat(moneySendMatch[1]),
      txId: moneySendMatch[2],
      note: decodeURIComponent(moneySendMatch[3] || ''),
    };
  }

  // 4. Money Ask / Request ($)
  const moneyAskMatch = body.match(/\[MONEY_ASK:([\d\.]+):([^:]+):?([^:]*):?(paid|pending)?\]/);
  if (moneyAskMatch) {
    return {
      type: 'ask_money',
      amount: parseFloat(moneyAskMatch[1]),
      reqId: moneyAskMatch[2],
      note: decodeURIComponent(moneyAskMatch[3] || ''),
      isPaid: moneyAskMatch[4] === 'paid' || isRequestPaidLocally(moneyAskMatch[2]),
    };
  }

  // 5. Post Reference
  const postRefMatch = body.match(/\[POST_REF:([^:]+):([^:]+):?([^\]]*)\]/);
  if (postRefMatch) {
    return {
      type: 'post_ref',
      postId: postRefMatch[1],
      title: decodeURIComponent(postRefMatch[2] || ''),
      imagePath: postRefMatch[3] ? decodeURIComponent(postRefMatch[3]) : undefined,
    };
  }

  return null;
}

// Local tracking for paid status of RP and Money requests
export function markRequestPaidLocally(reqId: string) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(RP_REQUESTS_STORAGE_KEY);
    const set: string[] = raw ? JSON.parse(raw) : [];
    if (!set.includes(reqId)) {
      set.push(reqId);
      localStorage.setItem(RP_REQUESTS_STORAGE_KEY, JSON.stringify(set));
    }
  } catch { /* ignore */ }
}

export function isRequestPaidLocally(reqId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(RP_REQUESTS_STORAGE_KEY);
    const set: string[] = raw ? JSON.parse(raw) : [];
    return set.includes(reqId);
  } catch {
    return false;
  }
}

/**
 * Cross-Account Auto-Claim Hook:
 * Scans for incoming RP transfers sent to the current user and credits them reliably to bd_ranked!
 */
export function useClaimReceivedRp(me: string) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!me || typeof window === 'undefined') return;

    let active = true;
    const claimPending = async () => {
      try {
        const storageKey = CLAIMED_RP_KEY_PREFIX + me;
        const rawClaimed = localStorage.getItem(storageKey);
        const claimedSet = new Set<string>(rawClaimed ? JSON.parse(rawClaimed) : []);

        // Find incoming RP send messages where sender != me
        const { data: msgs, error } = await supabase
          .from('bd_messages')
          .select('id, author_id, body, created_at')
          .neq('author_id', me)
          .ilike('body', '%[RP_SEND:%')
          .order('created_at', { ascending: false })
          .limit(100);

        if (error || !msgs || !msgs.length) return;

        let addedRp = 0;
        const newClaimedIds: string[] = [];

        for (const m of msgs) {
          const parsed = parseRpMessage(m.body);
          if (parsed && parsed.type === 'send_rp' && !claimedSet.has(parsed.txId)) {
            addedRp += parsed.amount;
            claimedSet.add(parsed.txId);
            newClaimedIds.push(parsed.txId);
          }
        }

        if (addedRp > 0 && active) {
          const { data: cur } = await supabase
            .from('bd_ranked')
            .select('rp, peak_rp')
            .eq('user_id', me)
            .maybeSingle();

          const curRp = cur?.rp ?? 0;
          const newRp = curRp + addedRp;

          await supabase.from('bd_ranked').upsert({
            user_id: me,
            rp: newRp,
            peak_rp: Math.max(newRp, cur?.peak_rp || 0),
            season: 's1',
          });

          localStorage.setItem(storageKey, JSON.stringify(Array.from(claimedSet)));
          await qc.invalidateQueries({ queryKey: RANKED });
          toast(`✨ Received +${addedRp.toLocaleString()} RP!`);
        }
      } catch (err) {
        console.error('Error claiming incoming RP:', err);
      }
    };

    void claimPending();
    const interval = setInterval(claimPending, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [me, qc]);
}
