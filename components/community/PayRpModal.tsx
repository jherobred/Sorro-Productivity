'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/Icon';
import { useRanked, RANKED } from '@/lib/challenges';
import { sendRp } from '@/lib/rpTransfers';
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

  const PRESETS = [5, 10, 25, 50, 100, 250];

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
      const ok = await sendRp({
        toUserId: authorId,
        amount,
        reason: note || `Tip for post: ${postTitle || 'Community Post'}`,
        postId,
      });

      if (ok) {
        await qc.invalidateQueries({ queryKey: RANKED });
        toast(`💎 Sent ${amount.toLocaleString()} RP to ${authorName}!`);
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
        aria-label="Pay with RP"
        className="k-bloom"
        style={{
          width: 440,
          maxWidth: '100%',
          borderRadius: phone ? '20px 20px 0 0' : 20,
          background: 'linear-gradient(180deg, #131722 0%, #0B0E17 100%)',
          border: '1.5px solid rgba(129, 140, 248, 0.35)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 30px rgba(99, 102, 241, 0.2)',
          padding: '20px 22px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          color: '#F8FAFC',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22 }}>💎</span>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 900, margin: 0, color: '#F8FAFC' }}>
                Pay / Tip with RP
              </h2>
              <span style={{ fontSize: 11.5, color: '#94A3B8' }}>
                Reward <strong style={{ color: '#C7D2FE' }}>{authorName}</strong> for their post
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

        {/* Post Summary & Available Balance */}
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(129, 140, 248, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#818CF8', textTransform: 'uppercase' }}>Target Post</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#F1F5F9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {postTitle || 'Community Contribution'}
            </div>
          </div>
          <div style={{ textAlign: 'right', flex: 'none' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase' }}>Your Balance</div>
            <div style={{ fontSize: 13.5, fontWeight: 900, color: '#38BDF8' }}>
              {myRp.toLocaleString()} RP 💎
            </div>
          </div>
        </div>

        {/* Preset Amount Chips */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase' }}>
            Select RP Amount
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {PRESETS.map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => handlePreset(val)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  fontSize: 12.5,
                  fontWeight: 900,
                  background: amount === val ? 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)' : 'rgba(255,255,255,0.05)',
                  border: amount === val ? '1.5px solid #818CF8' : '1px solid rgba(255,255,255,0.1)',
                  color: amount === val ? '#FFFFFF' : '#CBD5E1',
                  cursor: 'pointer',
                  boxShadow: amount === val ? '0 2px 10px rgba(99, 102, 241, 0.4)' : 'none',
                }}
              >
                {val} RP 💎
              </button>
            ))}
          </div>
        </div>

        {/* Custom RP Input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase' }}>
            Custom Amount
          </span>
          <div style={{ position: 'relative' }}>
            <input
              type="number"
              min="1"
              max={myRp}
              value={customInput}
              onChange={(e) => handleCustomChange(e.target.value)}
              placeholder="Enter RP amount"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                background: '#06080F',
                border: '1.5px solid rgba(129, 140, 248, 0.4)',
                color: '#FFFFFF',
                fontSize: 15,
                fontWeight: 900,
                fontFamily: 'monospace',
              }}
            />
            <span style={{ position: 'absolute', right: 12, top: 11, fontSize: 12, fontWeight: 800, color: '#818CF8' }}>
              RP 💎
            </span>
          </div>
        </div>

        {/* Optional Note / Message */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase' }}>
            Optional Note
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Great tip! Thanks for sharing."
            maxLength={80}
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: 10,
              background: '#06080F',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#F8FAFC',
              fontSize: 12.5,
            }}
          />
        </div>

        {/* Pay Button */}
        <button
          type="button"
          disabled={busy || amount <= 0 || amount > myRp}
          onClick={handlePay}
          className="k-squish"
          style={{
            marginTop: 4,
            padding: '13px 20px',
            borderRadius: 12,
            background: busy || amount > myRp ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #6366F1 0%, #4338CA 100%)',
            border: '1.5px solid #818CF8',
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: 900,
            cursor: busy || amount > myRp ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 18px rgba(99, 102, 241, 0.45)',
          }}
        >
          {busy ? 'Processing RP Transfer…' : `Pay ${amount.toLocaleString()} RP 💎`}
        </button>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(modal, document.body);
}
