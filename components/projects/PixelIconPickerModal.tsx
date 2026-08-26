'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon';
import { useOverlayBack } from '@/lib/nav';
import { useLayout } from '@/lib/useLayout';
import { PIXEL_FOLDER_ICONS, PixelFolderIcon } from './PixelFolderIcons';
import { playClick } from '@/lib/audio';

interface PixelIconPickerModalProps {
  currentIcon?: string;
  projectName: string;
  onSelect: (iconId: string) => void;
  onClose: () => void;
}

export function PixelIconPickerModal({
  currentIcon = '',
  projectName,
  onSelect,
  onClose,
}: PixelIconPickerModalProps) {
  const { phone } = useLayout();
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  useOverlayBack(true, onClose);

  const categories = ['All', 'Precious', 'Tech', 'Magic', 'Arcade', 'Fantasy', 'Retro'];

  const filtered = selectedCategory === 'All'
    ? PIXEL_FOLDER_ICONS
    : PIXEL_FOLDER_ICONS.filter((i) => i.category === selectedCategory);

  const handlePick = (id: string) => {
    playClick();
    onSelect(id);
    onClose();
  };

  const body = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 98,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
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
        aria-label="Choose 8-bit shiny folder icon"
        className="k-bloom"
        style={{
          width: 520,
          maxWidth: '100%',
          maxHeight: '88dvh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--card)',
          border: '1px solid var(--line2)',
          borderRadius: phone ? '20px 20px 0 0' : 20,
          boxShadow: 'var(--shl)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'color-mix(in srgb, var(--acc) 18%, transparent)', display: 'grid', placeItems: 'center' }}>
              <Icon name="spark" size={16} color="var(--accTx)" />
            </div>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--tx)', letterSpacing: '-.02em' }}>
                8-Bit Shiny Folder Icons
              </div>
              <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                Select an animated retro icon for “{projectName}”
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="hov k-squish"
            aria-label="Close"
            style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--tx2)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
          >
            <Icon name="close" size={15} color="var(--tx2)" />
          </button>
        </div>

        {/* Category Filter Chips */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 18px 6px', flexShrink: 0 }}>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setSelectedCategory(c)}
              className="k-squish"
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                border: `1px solid ${selectedCategory === c ? 'var(--acc)' : 'var(--line2)'}`,
                background: selectedCategory === c ? 'color-mix(in srgb, var(--acc) 16%, transparent)' : 'transparent',
                color: selectedCategory === c ? 'var(--accTx)' : 'var(--tx3)',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Icons Grid */}
        <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 18px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(136px, 1fr))', gap: 10 }}>
          {filtered.map((item) => {
            const isSel = currentIcon === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handlePick(item.id)}
                className="hov k-squish"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  padding: '14px 10px 12px',
                  borderRadius: 14,
                  border: `1.5px solid ${isSel ? 'var(--acc)' : 'var(--line2)'}`,
                  background: isSel ? 'color-mix(in srgb, var(--acc) 10%, var(--card2))' : 'var(--card2)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  boxShadow: isSel ? '0 0 12px color-mix(in srgb, var(--acc) 25%, transparent)' : 'none',
                  transition: 'all .18s ease',
                }}
              >
                <div style={{ padding: '6px 0', transform: 'scale(1.08)' }}>
                  <PixelFolderIcon iconId={item.id} size={52} />
                </div>
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 1 }}>
                    {item.category}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: '1px solid var(--line)' }}>
          <button
            onClick={() => handlePick('')}
            className="hov k-squish"
            style={{
              padding: '7px 12px',
              borderRadius: 9,
              background: 'transparent',
              border: '1px solid var(--line2)',
              fontSize: 11.5,
              fontWeight: 700,
              color: 'var(--tx3)',
              cursor: 'pointer',
            }}
          >
            Reset to Default Folder
          </button>
          <button
            onClick={onClose}
            className="hov k-squish"
            style={{
              padding: '7px 16px',
              borderRadius: 9,
              background: 'var(--card2)',
              border: '1px solid var(--line2)',
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--tx)',
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(body, document.body);
}
