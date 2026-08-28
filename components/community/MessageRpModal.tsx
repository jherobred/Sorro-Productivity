'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/Icon';
import { useRanked, RANKED } from '@/lib/challenges';
import { sendRp, encodeRpSendMessage, encodeRpAskMessage } from '@/lib/rpTransfers';
import { toast } from '@/lib/toast';
import { playCelebration, playClick } from '@/lib/audio';
import { useLayout } from '@/lib/useLayout';

export function MessageRpModal({
  recipientId,
  recipientName,
  conversationId,
  onClose,
  onSendMessage,
}: {
  recipientId: string;
  recipientName: string;
  conversationId: string;
  onClose: () => void;
  onSendMessage: (body: string) => void;
}) {
  const qc = useQueryClient();
  const { phone } = useLayout();
  const { data: ranked } = useRanked();
  const myRp = ranked?.rp ?? 0;

  const [mode, setMode] = useState<'send' | 'ask'>('send');
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

  const handleExecute = async () => {
    if (amount <= 0) {
      toast('Please enter a valid RP amount');
      return;
    }

    if (mode === 'send') {
      if (amount > myRp) {
        toast(`Insufficient RP (You have ${myRp.toLocaleString()} RP)`);
        return;
      }

      setBusy(true);
      try {
        const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const ok = await sendRp({
          toUserId: recipientId,
          amount,
          reason: note || 'Direct Message RP Transfer',
          conversationId,
        });

        if (ok) {
          await qc.invalidateQueries({ queryKey: RANKED });
          const msgBody = encodeRpSendMessage(amount, txId, note);
          onSendMessage(msgBody);
          toast(`💎 Sent ${amount.toLocaleString()} RP to ${recipientName}!`);
          onClose();
        }
      } finally {
        setBusy(false);
      }
    } else {
      // Ask / Request RP
      const reqId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const msgBody = encodeRpAskMessage(amount, reqId, note, false);
      playCelebration();
      onSendMessage(msgBody);
      toast(`💎 Requested ${amount.toLocaleString()} RP from ${recipientName}!`);
      onClose();
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
        aria-label="Send or Ask RP"
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
          gap: 14,
          color: '#F8FAFC',
        }}
      >
        {/* Header & Mode Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22 }}>💎</span>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 900, margin: 0, color: '#F8FAFC' }}>
                RP Transfer & Invoices
              </h2>
              <span style={{ fontSize: 11.5, color: '#94A3B8' }}>
                With <strong style={{ color: '#C7D2FE' }}>{recipientName}</strong>
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

        {/* Send vs Ask Segmented Control */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 4,
            padding: 3,
            borderRadius: 12,
            background: '#070B14',
            border: '1px solid #1E293B',
          }}
        >
          <button
            type="button"
            onClick={() => {
              playClick();
              setMode('send');
            }}
            style={{
              padding: '8px 12px',
              borderRadius: 9,
              fontSize: 12.5,
              fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
              background: mode === 'send' ? '#10B981' : 'transparent',
              color: mode === 'send' ? '#041F14' : '#94A3B8',
              boxShadow: mode === 'send' ? '0 2px 10px rgba(16, 185, 129, 0.4)' : 'none',
              transition: 'all .2s ease',
            }}
          >
            💸 Send RP
          </button>
          <button
            type="button"
            onClick={() => {
              playClick();
              setMode('ask');
            }}
            style={{
              padding: '8px 12px',
              borderRadius: 9,
              fontSize: 12.5,
              fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
              background: mode === 'ask' ? '#8B5CF6' : 'transparent',
              color: mode === 'ask' ? '#FFFFFF' : '#94A3B8',
              boxShadow: mode === 'ask' ? '0 2px 10px rgba(139, 92, 246, 0.4)' : 'none',
              transition: 'all .2s ease',
            }}
          >
            📥 Ask / Request RP
          </button>
        </div>

        {/* Available Balance Status */}
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            background: mode === 'send' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(139, 92, 246, 0.1)',
            border: mode === 'send' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(139, 92, 246, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#CBD5E1' }}>
            {mode === 'send' ? 'Transfer directly to partner' : 'Send an interactive invoice bubble'}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase' }}>Your Balance</div>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#38BDF8' }}>
              {myRp.toLocaleString()} RP 💎
            </div>
          </div>
        </div>

        {/* Preset Amount Chips */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                  padding: '8px 10px',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 900,
                  background: amount === val ? (mode === 'send' ? '#10B981' : '#8B5CF6') : 'rgba(255,255,255,0.05)',
                  border: amount === val ? '1.5px solid #FFFFFF' : '1px solid rgba(255,255,255,0.1)',
                  color: amount === val ? (mode === 'send' ? '#041F14' : '#FFFFFF') : '#CBD5E1',
                  cursor: 'pointer',
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
              max={mode === 'send' ? myRp : 100000}
              value={customInput}
              onChange={(e) => handleCustomChange(e.target.value)}
              placeholder="Enter RP amount"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                background: '#06080F',
                border: mode === 'send' ? '1.5px solid rgba(16, 185, 129, 0.4)' : '1.5px solid rgba(139, 92, 246, 0.4)',
                color: '#FFFFFF',
                fontSize: 15,
                fontWeight: 900,
                fontFamily: 'monospace',
              }}
            />
            <span style={{ position: 'absolute', right: 12, top: 11, fontSize: 12, fontWeight: 800, color: mode === 'send' ? '#34D399' : '#C084FC' }}>
              RP 💎
            </span>
          </div>
        </div>

        {/* Optional Note / Reason */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase' }}>
            {mode === 'send' ? 'Note (Optional)' : 'Reason / Invoice Details'}
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={mode === 'send' ? 'e.g. Thanks for the study notes!' : 'e.g. Tutoring session fee'}
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

        {/* Action Button */}
        <button
          type="button"
          disabled={busy || amount <= 0 || (mode === 'send' && amount > myRp)}
          onClick={handleExecute}
          className="k-squish"
          style={{
            marginTop: 4,
            padding: '13px 20px',
            borderRadius: 12,
            background:
              mode === 'send'
                ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
                : 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
            border: mode === 'send' ? '1.5px solid #34D399' : '1.5px solid #A78BFA',
            color: mode === 'send' ? '#041F14' : '#FFFFFF',
            fontSize: 14,
            fontWeight: 900,
            cursor: busy || (mode === 'send' && amount > myRp) ? 'not-allowed' : 'pointer',
            boxShadow:
              mode === 'send'
                ? '0 4px 18px rgba(16, 185, 129, 0.45)'
                : '0 4px 18px rgba(139, 92, 246, 0.45)',
          }}
        >
          {busy
            ? 'Transferring RP…'
            : mode === 'send'
            ? `Send ${amount.toLocaleString()} RP 💎`
            : `Request ${amount.toLocaleString()} RP 💎`}
        </button>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(modal, document.body);
}
