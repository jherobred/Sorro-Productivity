'use client';

import { useTap } from '@/hooks/useTap';
import type { Meal } from '@/lib/body';

export type FoodPreset = {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  photo_path: string;
  slot: string;
};

export const DEFAULT_PRESETS: FoodPreset[] = [
  { name: 'Silog', kcal: 520, protein: 38, carbs: 62, fat: 18, photo_path: '/food/silog.svg', slot: 'Breakfast' },
  { name: 'Sinigang', kcal: 310, protein: 22, carbs: 30, fat: 9, photo_path: '/food/sinigang.svg', slot: 'Lunch' },
  { name: 'Inihaw', kcal: 590, protein: 44, carbs: 24, fat: 32, photo_path: '/food/inihaw.svg', slot: 'Dinner' },
  { name: 'Isaw', kcal: 180, protein: 14, carbs: 8, fat: 10, photo_path: '/food/isaw.svg', slot: 'Snack' },
  { name: 'Ensalada', kcal: 140, protein: 6, carbs: 16, fat: 5, photo_path: '/food/ensalada.svg', slot: 'Side' },
  { name: 'Pritong Isda', kcal: 430, protein: 36, carbs: 12, fat: 26, photo_path: '/food/pritong-isda.svg', slot: 'Dinner' },
];

/**
 * Visual Food Photo Card matching Canva design.
 */
export function FoodPhotoCard({
  name,
  kcal,
  photo_path,
  onLogAgain,
  onEdit,
}: {
  name: string;
  kcal: number;
  photo_path: string;
  onLogAgain: () => void;
  onEdit?: () => void;
}) {
  const tap = useTap(onLogAgain);

  return (
    <button
      {...tap}
      aria-label={`Log ${name} (${kcal} kcal)`}
      className="k-squish"
      style={{
        position: 'relative',
        borderRadius: 14,
        overflow: 'hidden',
        aspectRatio: '1 / 0.84',
        background: 'var(--card2)',
        border: '1px solid var(--line2)',
        cursor: 'pointer',
        padding: 0,
        textAlign: 'left',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
        transition: 'transform .15s ease, border-color .15s ease',
      }}
    >
      {/* Photo Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo_path}
        alt={name}
        loading="lazy"
        decoding="async"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />

      {/* Bottom Gradient and Info Overlay */}
      <span
        style={{
          position: 'absolute',
          inset: 'auto 0 0 0',
          padding: '24px 8px 6px',
          background: 'linear-gradient(180deg, transparent 0%, rgba(10,9,16,0.92) 60%, rgba(10,9,16,0.98) 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: '#FFFFFF',
            lineHeight: 1.2,
            letterSpacing: '-.01em',
            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
          }}
        >
          {name}
        </span>
        <span
          className="num"
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.7)',
            marginTop: 2,
          }}
        >
          {kcal.toLocaleString()} kcal
        </span>
      </span>
    </button>
  );
}
