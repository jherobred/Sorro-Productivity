'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/Icon';
import { useRanked, RANKED } from '@/lib/challenges';
import { buyPostItem, encodeRpSendMessage, type PostListing } from '@/lib/rpTransfers';
import { startDm } from '@/lib/messages';
import { toast } from '@/lib/toast';
import { playCelebration } from '@/lib/audio';
import { useLayout } from '@/lib/useLayout';

export function BuyItemModal({
  postId,
  sellerId,
  sellerName,
  listing,
  onClose,
  onSuccess,
}: {
  postId: string;
  sellerId: string;
  sellerName: string;
  listing: PostListing;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const qc = useQueryClient();
  const { phone } = useLayout();
  const { data: ranked } = useRanked();
  const myRp = ranked?.rp ?? 0;

  const [note, setNote] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);

  const price = listing.price_rp;
  const canAfford = myRp >= price;

  const handlePurchase = async () => {
    if (!canAfford) {
      toast(`Insufficient RP (You have ${myRp.toLocaleString()} RP, need ${price.toLocaleString()} RP)`);
      return;
    }

    setBusy(true);
    try {
      const ok = await buyPostItem({
        postId,
        sellerId,
        price,
        itemName: listing.item_name,
        deliveryInfo: note.trim() ? `${listing.delivery_info ? `${listing.delivery_info} | ` : ''}Note: "${note.trim()}"` : listing.delivery_info,
      });

      if (ok) {
        await qc.invalidateQueries({ queryKey: RANKED });
        playCelebration();
        toast(`🎉 Successfully purchased "${listing.item_name}" for ${price.toLocaleString()} RP!`);
        if (onSuccess) onSuccess();
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
        background: 'rgba(0,0,0,0.78)',
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
        aria-label="Buy Item with RP"
        className="k-bloom"
        style={{
          width: 450,
          maxWidth: '100%',
          borderRadius: phone ? '20px 20px 0 0' : 20,
          background: 'linear-gradient(180deg, #151A28 0%, #0A0D15 100%)',
          border: '1.5px solid #10B981',
          boxShadow: '0 20px 50px rgba(0,0,0,0.85), 0 0 35px rgba(16, 185, 129, 0.25)',
          padding: '22px 24px 26px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          color: '#F8FAFC',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: 24 }}>🛍️</span>
            <div>
              <h2 style={{ fontSize: 16.5, fontWeight: 900, margin: 0, color: '#F8FAFC' }}>
                Purchase with RP
              </h2>
              <span style={{ fontSize: 11.5, color: '#94A3B8' }}>
                Buying from seller <strong style={{ color: '#6EE7B7' }}>{sellerName}</strong>
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

        {/* Item Summary Card */}
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(6,78,59,0.2) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{
              fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
              color: '#34D399', background: 'rgba(16,185,129,0.25)', padding: '2px 8px', borderRadius: 6,
            }}>
              {listing.item_type.toUpperCase()} FOR SALE
            </span>
            <span style={{ fontSize: 16, fontWeight: 900, color: '#FDE047', fontFamily: 'monospace' }}>
              💎 {price.toLocaleString()} RP
            </span>
          </div>

          <div style={{ fontSize: 15, fontWeight: 900, color: '#F1F5F9' }}>
            {listing.item_name}
          </div>

          {listing.description && (
            <div style={{ fontSize: 12, lineHeight: 1.5, color: '#CBD5E1' }}>
              {listing.description}
            </div>
          )}

          {listing.delivery_info && (
            <div style={{
              fontSize: 11.5, color: '#6EE7B7', background: 'rgba(0,0,0,0.3)',
              padding: '6px 10px', borderRadius: 8, marginTop: 4,
            }}>
              📦 <strong>Delivery / Instructions:</strong> {listing.delivery_info}
            </div>
          )}
        </div>

        {/* Wallet & Balance Comparison */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderRadius: 12,
            background: '#070B14',
            border: '1px solid #1E293B',
          }}
        >
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase' }}>Your Balance</div>
            <div style={{ fontSize: 13.5, fontWeight: 900, color: canAfford ? '#38BDF8' : '#EF4444' }}>
              {myRp.toLocaleString()} RP 💎
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase' }}>After Purchase</div>
            <div style={{ fontSize: 13.5, fontWeight: 900, color: canAfford ? '#34D399' : '#94A3B8' }}>
              {canAfford ? `${(myRp - price).toLocaleString()} RP` : 'Insufficient Funds'}
            </div>
          </div>
        </div>

        {/* Optional Buyer Note */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase' }}>
            Note to Seller (Optional)
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. My preferred delivery contact / scheduling preference"
            maxLength={100}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 10,
              background: '#06080F',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#F8FAFC',
              fontSize: 12.5,
            }}
          />
        </div>

        {/* Confirm Button */}
        <button
          type="button"
          disabled={busy || !canAfford || listing.is_sold}
          onClick={handlePurchase}
          className="k-squish"
          style={{
            marginTop: 4,
            padding: '13px 20px',
            borderRadius: 12,
            background: busy || !canAfford || listing.is_sold
              ? 'rgba(255,255,255,0.1)'
              : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
            border: '1.5px solid #34D399',
            color: busy || !canAfford || listing.is_sold ? '#94A3B8' : '#041F14',
            fontSize: 14,
            fontWeight: 900,
            cursor: busy || !canAfford || listing.is_sold ? 'not-allowed' : 'pointer',
            boxShadow: canAfford ? '0 4px 20px rgba(16, 185, 129, 0.4)' : 'none',
          }}
        >
          {busy
            ? 'Processing Purchase…'
            : listing.is_sold
            ? 'Item Already Sold'
            : !canAfford
            ? 'Insufficient RP Balance'
            : `Confirm Purchase · ${price.toLocaleString()} RP 💎`}
        </button>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(modal, document.body);
}
