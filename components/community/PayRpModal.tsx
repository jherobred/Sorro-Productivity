'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/Icon';
import { useRanked, RANKED } from '@/lib/challenges';
import { sendRpWithPostNotification } from '@/lib/rpTransfers';
import { toast } from '@/lib/toast';
import { playClick } from '@/lib/audio';
import { useLayout } from '@/lib/useLayout';

export function PayRpModal({
  postId,
  authorId,
  authorName,
  postTitle,
  onClose,
  onSuccess,
}: {
  postId: string;
  authorId: string;
  authorName: string;
  postTitle?: string;
  onClose: () => void;
  onSuccess?: (amount: number) => void;
}) {
  const qc = useQueryClient();
  const { phone } = useLayout();
  const { data: ranked } = useRanked();
  const myRp = ranked?.rp ?? 0;

  const [amount, setAmount] = useState<number>(25);
  const [customInput, setCustomInput] = useState<string>('25');
  const [note, setNote] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);

  const PRESETS = [5, 10, 25, 50, 100, 250, 500, 1000, 5000];

  const handlePreset = (val: number) => {
    playClick();
    setAmount(val);
    setCustomInput(String(val));
  };

  const handleCustomChange = (val: string) => {
    setCustomInput(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 0) {
      setAmount(num);
    }
  };

  const handlePay = async () => {
    if (amount <= 0) {
      toast('Please enter a valid RP amount');
      return;
    }
    if (amount > myRp) {
      toast(`Insufficient RP (You have ${myRp.toLocaleString()} RP)`);
      return;
    }

    setBusy(true);
    try {
      const ok = await sendRpWithPostNotification({
        authorId,
        authorName,
        amount,
        postTitle: postTitle || 'Community Post',
        postId,
        note: note.trim(),
      });

      if (ok) {
        await qc.invalidateQueries({ queryKey: RANKED });
        toast(`💎 Sent ${amount.toLocaleString()} RP to ${authorName}! Notification sent in chat.`);
        if (onSuccess) onSuccess(amount);
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  const modal = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: phone ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: phone ? 0 : 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Pay / Tip with RP"
        className="k-bloom"
        style={{
          width: 440,
          maxWidth: '100%',
          borderRadius: phone ? '20px 20px 0 0' : 20,
          background: 'linear-gradient(180deg, #181926 0%, #0F101A 100%)',
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 30px rgba(99, 102, 241, 0.2)',
          padding: '22px 24px 26px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          color: '#F8FAFC',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>💎</span>
            <div>
              <h2 style={{ fontSize: 16.5, fontWeight: 900, margin: 0, color: '#F8FAFC' }}>
                Pay / Tip with RP
              </h2>
              <span style={{ fontSize: 12, color: '#94A3B8' }}>
                Rewarding <strong style={{ color: '#818CF8' }}>{authorName}</strong>
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hov k-squish"
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            <Icon name="close" size={14} color="#94A3B8" />
          </button>
        </div>

        {/* Balance preview */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderRadius: 12,
            background: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(129, 140, 248, 0.3)',
          }}
        >
          <span style={{ fontSize: 12, color: '#C7D2FE', fontWeight: 600 }}>Your RP Balance</span>
          <span style={{ fontSize: 14, fontWeight: 900, color: '#FDE047', fontFamily: 'monospace' }}>
            💎 {myRp.toLocaleString()} RP
          </span>
        </div>

        {/* Preset chips */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase' }}>
            Choose Amount
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PRESETS.map((p) => {
              const on = amount === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePreset(p)}
                  className="k-squish"
                  style={{
                    flex: '1 0 calc(25% - 6px)',
                    minWidth: 55,
                    padding: '8px 6px',
                    borderRadius: 10,
                    fontSize: 12.5,
                    fontWeight: 900,
                    background: on ? '#6366F1' : 'rgba(255,255,255,0.05)',
                    border: on ? '1.5px solid #818CF8' : '1px solid rgba(255,255,255,0.1)',
                    color: on ? '#FFFFFF' : '#CBD5E1',
                    cursor: 'pointer',
                    transition: 'all .15s ease',
                  }}
                >
                  +{p} 💎
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase' }}>
            Or Custom Amount (Unlimited)
          </span>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type="number"
              min={1}
              value={customInput}
              onChange={(e) => handleCustomChange(e.target.value)}
              placeholder="e.g. 500000"
              style={{
                width: '100%',
                padding: '10px 45px 10px 14px',
                borderRadius: 10,
                background: '#07080F',
                border: '1px solid rgba(255,255,255,0.14)',
                color: '#F8FAFC',
                fontSize: 15,
                fontWeight: 900,
                fontFamily: 'monospace',
              }}
            />
            <span style={{ position: 'absolute', right: 12, fontSize: 15, pointerEvents: 'none' }}>💎</span>
          </div>
        </div>

        {/* Optional Note */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase' }}>
            Add a Note (Optional)
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Great insight! Thanks for sharing."
            maxLength={100}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 10,
              background: '#07080F',
              border: '1px solid rgba(255,255,255,0.14)',
              color: '#F8FAFC',
              fontSize: 12.5,
            }}
          />
        </div>

        {/* Submit */}
        <button
          type="button"
          disabled={busy || amount <= 0 || amount > myRp}
          onClick={handlePay}
          className="k-squish"
          style={{
            marginTop: 4,
            padding: '12px 20px',
            borderRadius: 12,
            background: busy || amount <= 0 || amount > myRp
              ? 'rgba(255,255,255,0.1)'
              : 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
            border: '1.5px solid #818CF8',
            color: busy || amount <= 0 || amount > myRp ? '#94A3B8' : '#FFFFFF',
            fontSize: 13.5,
            fontWeight: 900,
            cursor: busy || amount <= 0 || amount > myRp ? 'not-allowed' : 'pointer',
            boxShadow: amount <= myRp ? '0 4px 16px rgba(99, 102, 241, 0.4)' : 'none',
          }}
        >
          {busy
            ? 'Sending RP…'
            : amount > myRp
            ? 'Insufficient Balance'
            : `Send ${amount.toLocaleString()} RP & Notify 💎`}
        </button>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(modal, document.body);
}
