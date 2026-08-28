'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { RANKED } from './challenges';
import { toast } from './toast';
import { playCelebration } from './audio';

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

export type PostRpSettings = {
  accept_rp: boolean;
  min_rp?: number;
  suggested_rp?: number;
  total_tipped: number;
};

const POST_RP_STORAGE_KEY = 'basedly_post_rp_settings_v1';
const RP_REQUESTS_STORAGE_KEY = 'basedly_rp_requests_v1';

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

/** Set post RP acceptance settings */
export function setPostRpConfig(postId: string, config: { accept_rp: boolean; suggested_rp?: number }) {
  const current = getStoredPostRpSettings();
  current[postId] = {
    accept_rp: config.accept_rp,
    suggested_rp: config.suggested_rp || 10,
    total_tipped: current[postId]?.total_tipped || 0,
  };
  saveStoredPostRpSettings(current);
}

/** Get post RP settings and total tips */
export function getPostRpConfig(postId: string): PostRpSettings {
  const all = getStoredPostRpSettings();
  return all[postId] || { accept_rp: false, suggested_rp: 10, total_tipped: 0 };
}

/**
 * Execute an RP transfer from current user to a recipient (for tips, direct sends, or invoices).
 */
export async function sendRp({
  toUserId,
  amount,
  reason,
  postId,
  conversationId,
}: {
  toUserId: string;
  amount: number;
  reason?: string;
  postId?: string;
  conversationId?: string;
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
      toast(`Insufficient RP (You have ${senderCurrentRp} RP, need ${amount} RP)`);
      return false;
    }

    const newSenderRp = senderCurrentRp - amount;

    // 2. Deduct from sender
    const { error: senderErr } = await supabase
      .from('bd_ranked')
      .update({ rp: newSenderRp })
      .eq('user_id', myId);

    if (senderErr) throw senderErr;

    // 3. Credit recipient
    const { data: theirRanked } = await supabase
      .from('bd_ranked')
      .select('rp,peak_rp')
      .eq('user_id', toUserId)
      .maybeSingle();

    const recipientCurrentRp = theirRanked?.rp ?? 0;
    const newRecipientRp = recipientCurrentRp + amount;

    if (theirRanked) {
      await supabase
        .from('bd_ranked')
        .update({
          rp: newRecipientRp,
          peak_rp: Math.max(newRecipientRp, theirRanked.peak_rp || 0),
        })
        .eq('user_id', toUserId);
    } else {
      await supabase.from('bd_ranked').insert({
        user_id: toUserId,
        rp: amount,
        peak_rp: amount,
        wins: 0,
        losses: 0,
        season: 's1',
      });
    }

    // 4. Update post tip total if applicable
    if (postId) {
      const all = getStoredPostRpSettings();
      const existing = all[postId] || { accept_rp: true, suggested_rp: 10, total_tipped: 0 };
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
 * Message Tag Parsers for Sending and Asking RP inside Direct Messages
 */
export type RpMessageData =
  | { type: 'send'; amount: number; txId: string; note: string }
  | { type: 'ask'; amount: number; reqId: string; note: string; isPaid: boolean }
  | null;

export function encodeRpSendMessage(amount: number, txId: string, note: string = ''): string {
  return `[RP_SEND:${amount}:${txId}:${encodeURIComponent(note)}]`;
}

export function encodeRpAskMessage(amount: number, reqId: string, note: string = '', isPaid: boolean = false): string {
  return `[RP_ASK:${amount}:${reqId}:${encodeURIComponent(note)}:${isPaid ? 'paid' : 'pending'}]`;
}

export function parseRpMessage(body: string): RpMessageData {
  if (!body) return null;

  const sendMatch = body.match(/\[RP_SEND:(\d+):([^:]+):?([^\]]*)\]/);
  if (sendMatch) {
    return {
      type: 'send',
      amount: parseInt(sendMatch[1], 10),
      txId: sendMatch[2],
      note: decodeURIComponent(sendMatch[3] || ''),
    };
  }

  const askMatch = body.match(/\[RP_ASK:(\d+):([^:]+):?([^:]*):?(paid|pending)?\]/);
  if (askMatch) {
    return {
      type: 'ask',
      amount: parseInt(askMatch[1], 10),
      reqId: askMatch[2],
      note: decodeURIComponent(askMatch[3] || ''),
      isPaid: askMatch[4] === 'paid' || isRequestPaidLocally(askMatch[2]),
    };
  }

  return null;
}

// Local tracking for paid status of RP requests
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
