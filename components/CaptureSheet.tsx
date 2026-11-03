'use client';

import { useState } from 'react';
import { supabase, currentUserId } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { queryClient } from '@/lib/offline';
import { parseAmount } from '@/lib/money';

/** Ported from the original prototype markup 2652–2687 (capture sheet). */

export type CaptureKind = 'task' | 'note' | 'money';
const TITLES: Record<CaptureKind, string> = {
  task: 'New task', note: 'New note', money: 'New expense',
};

const chip = (on: boolean): React.CSSProperties => ({
  padding: '6px 12px', borderRadius: 999,
  border: `1px solid ${on ? 'var(--acc)' : 'var(--line2)'}`,
  color: on ? 'var(--acc)' : 'var(--tx2)',
  fontSize: 11.5, fontWeight: 600,
});

export function CaptureSheet({ kind, onClose }: { kind: CaptureKind; onClose: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    const v = text.trim();
    if (!v) return onClose();
    setBusy(true);
    try {
      const user_id = await currentUserId();
      // Postgrest resolves with `{ error }` instead of throwing. Unread, a
      // refused insert toasted success and closed the sheet on the typing.
      if (kind === 'task') {
        const { data: list } = await supabase.from('bd_lists').select('id').order('position').limit(1).maybeSingle();
        const { error } = await supabase.from('bd_tasks').insert({ user_id, title: v, list_id: list?.id ?? null });
        if (error) throw error;
        toast(`Task added${list ? '' : ''}`);
        void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      } else if (kind === 'money') {
        const { error } = await supabase.from('bd_transactions').insert({
          user_id, name: 'Quick expense', amount_centavos: parseAmount(v), category: 'Food',
        });
        if (error) throw error;
        toast('Expense logged');
        void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      } else {
        const { error } = await supabase.from('bd_scratch').insert({ user_id, text: v, tag: 'Note', color: '#38D6F2' });
        if (error) throw error;
        toast('Note kept');
        void queryClient.invalidateQueries({ queryKey: ['scratch'] });
      }
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save');
      setBusy(false);
    }
  }

  return (
    <>
      <div onClick={onClose} className="fade"
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.44)', zIndex: 40 }} />
      <div className="sheet" style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 41,
        background: 'var(--card)', borderRadius: '22px 22px 0 0',
        padding: '14px 22px calc(24px + env(safe-area-inset-bottom))',
        maxWidth: 720, margin: '0 auto',
      }}>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--line2)', margin: '0 auto 14px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{TITLES[kind]}</div>
          <div style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, padding: '5px 11px',
            borderRadius: 999, border: '1px solid var(--line2)', fontSize: 10.5, fontWeight: 600, color: 'var(--tx3)',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--acc)' }} />Dictating
          </div>
        </div>

        {kind === 'money' ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--tx3)' }}>₱</span>
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()} inputMode="decimal" placeholder="75"
              style={{ flex: 1, fontSize: 30, fontWeight: 800, color: 'var(--tx)', fontVariantNumeric: 'tabular-nums' }} />
          </div>
        ) : (
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder={kind === 'task' ? 'What needs doing?' : 'Note title'}
            style={{ width: '100%', fontSize: 17, fontWeight: 600, color: 'var(--tx)', paddingBottom: 12, borderBottom: '1px solid var(--line)' }} />
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 14 }}>
          {(kind === 'task'
            ? ['School', 'Today', 'High', 'Time-block 60m']
            : kind === 'note'
              ? ['3rd year › CS 191', 'Attach file']
              : ['Food', 'Cash', 'Scan receipt']
          ).map((c, i) => <div key={c} style={chip(i === 0)}>{c}</div>)}
        </div>

        <div style={{ display: 'flex', gap: 9, marginTop: 20 }}>
          <button onClick={save} disabled={busy} className="acc"
            style={{ padding: '11px 20px', borderRadius: 11, background: 'var(--acc)', color: 'var(--accent-ink)', fontSize: 13, fontWeight: 800, opacity: busy ? 0.6 : 1 }}>
            Save
          </button>
          <button onClick={onClose} className="hov"
            style={{ padding: '11px 20px', borderRadius: 11, border: '1px solid var(--line2)', fontSize: 13, fontWeight: 700, color: 'var(--tx2)' }}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
