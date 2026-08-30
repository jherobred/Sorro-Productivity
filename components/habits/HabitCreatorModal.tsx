'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '@/components/Icon';
import { useOverlayBack } from '@/lib/nav';
import { PAL } from '@/lib/pal';
import {
  HABIT_PRESETS,
  HABIT_CATEGORIES,
  type Habit,
  type HabitCategory,
  type HabitFrequency,
  type HabitKind,
  type TimeOfDay,
  type HabitPreset,
} from '@/lib/habits';

const COLORS = [
  '#FF6B6B', '#FF85C0', '#FFA940', '#FFC24B', '#52C41A',
  '#36CFC9', '#34D9A0', '#38D6F2', '#7C6CFF', '#9254DE',
  '#F759AB', '#FA8C16',
];

const ICONS = [
  'check', 'flame', 'spark', 'trophy', 'star',
  'heart', 'gym', 'clock', 'book', 'droplet',
  'sun', 'moon', 'pen', 'money', 'task', 'plus',
];

export function HabitCreatorModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: Habit | null;
  onClose: () => void;
  onSave: (habit: Partial<Habit> & { id: string; name: string; color: string }) => void;
}) {
  useOverlayBack(true, onClose);

  const [tab, setTab] = useState<'preset' | 'custom'>(initial ? 'custom' : 'preset');
  const [name, setName] = useState(initial?.name ?? '');
  const [shortName, setShortName] = useState(initial?.short_name ?? '');
  const [showInHome, setShowInHome] = useState(initial?.show_in_home ?? true);
  const [category, setCategory] = useState<HabitCategory>(initial?.category ?? 'health');
  const [color, setColor] = useState(initial?.color ?? '#7C6CFF');
  const [icon, setIcon] = useState(initial?.icon ?? 'check');
  const [kind, setKind] = useState<HabitKind>(initial?.kind ?? 'bin');
  const [target, setTarget] = useState<number>(initial?.target ?? 1);
  const [targetUnit, setTargetUnit] = useState(initial?.target_unit ?? 'time');
  const [frequency, setFrequency] = useState<HabitFrequency>(initial?.frequency ?? 'daily');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(initial?.time_of_day ?? 'anytime');
  const [cue, setCue] = useState(initial?.cue ?? '');

  const applyPreset = (p: HabitPreset) => {
    setName(p.name);
    setShortName(p.name.split(' ')[0]);
    setShowInHome(true);
    setCategory(p.category);
    setColor(p.color);
    setIcon(p.icon);
    setKind(p.kind);
    setTarget(p.target);
    setTargetUnit(p.target_unit);
    setTimeOfDay(p.time_of_day);
    setCue(p.cue);
    setTab('custom');
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      short_name: shortName.trim() || name.trim().split(' ')[0],
      show_in_home: showInHome,
      color,
      kind,
      target: kind === 'bin' ? 1 : target,
      target_unit: targetUnit,
      category,
      frequency,
      time_of_day: timeOfDay,
      icon,
      cue,
    });
  };

  const body = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99,
        background: 'rgba(0,0,0,.65)',
        backdropFilter: 'blur(6px)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="k-bloom navsb"
        style={{
          width: 580,
          maxWidth: '100%',
          maxHeight: '88dvh',
          overflowY: 'auto',
          background: 'var(--card)',
          border: '1px solid var(--line2)',
          borderRadius: 20,
          padding: 20,
          boxShadow: 'var(--shl)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: `color-mix(in srgb, ${color} 20%, transparent)`,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name={(icon as IconName) || 'spark'} size={18} color={color} />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, letterSpacing: '-.02em', color: 'var(--tx)' }}>
                {initial ? 'Edit Habit' : 'Create New Habit'}
              </h2>
              <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                Build an atomic, repeatable routine
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="hov k-squish"
            aria-label="Close"
            style={{ width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center' }}
          >
            <Icon name="close" size={14} color="var(--tx2)" />
          </button>
        </div>

        {/* Tab switch */}
        {!initial && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, background: 'var(--card2)', padding: 4, borderRadius: 12 }}>
            <button
              onClick={() => setTab('preset')}
              style={{
                flex: 1,
                padding: '7px 12px',
                borderRadius: 9,
                fontSize: 12,
                fontWeight: 700,
                border: 'none',
                background: tab === 'preset' ? 'var(--card)' : 'transparent',
                color: tab === 'preset' ? 'var(--tx)' : 'var(--tx3)',
                boxShadow: tab === 'preset' ? 'var(--sh)' : 'none',
                cursor: 'pointer',
              }}
            >
              ⚡ Popular Presets
            </button>
            <button
              onClick={() => setTab('custom')}
              style={{
                flex: 1,
                padding: '7px 12px',
                borderRadius: 9,
                fontSize: 12,
                fontWeight: 700,
                border: 'none',
                background: tab === 'custom' ? 'var(--card)' : 'transparent',
                color: tab === 'custom' ? 'var(--tx)' : 'var(--tx3)',
                boxShadow: tab === 'custom' ? 'var(--sh)' : 'none',
                cursor: 'pointer',
              }}
            >
              🛠️ Custom Builder
            </button>
          </div>
        )}

        {tab === 'preset' && !initial ? (
          <div style={{ display: 'grid', gap: 9 }}>
            {HABIT_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p)}
                className="hov k-squish"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: '1px solid var(--line)',
                  background: 'var(--card2)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 11,
                    background: `color-mix(in srgb, ${p.color} 22%, transparent)`,
                    display: 'grid',
                    placeItems: 'center',
                    flex: 'none',
                  }}
                >
                  <Icon name={(p.icon as IconName) || 'check'} size={17} color={p.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx)' }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.cue}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 8,
                    background: `color-mix(in srgb, ${p.color} 16%, transparent)`,
                    color: p.color,
                  }}
                >
                  {p.kind === 'dur' ? `${p.target} mins` : p.kind === 'count' ? `${p.target} ${p.target_unit}` : 'Daily Check'}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Habit Name */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--tx2)', marginBottom: 5 }}>
                HABIT NAME
              </label>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!shortName || shortName === name.split(' ')[0]) {
                    setShortName(e.target.value.split(' ')[0] || '');
                  }
                }}
                placeholder="e.g. Read 20 Pages, Drink 2L Water, 100 Pushups..."
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid var(--line2)',
                  background: 'var(--card2)',
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: 'var(--tx)',
                }}
              />
            </div>

            {/* Home View Display Settings */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 1fr',
                gap: 10,
                background: 'var(--card2)',
                border: '1px solid var(--line2)',
                borderRadius: 12,
                padding: '10px 12px',
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--tx2)', marginBottom: 4 }}>
                  SHORTEST 1-WORD NAME (HOME)
                </label>
                <input
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value.trim().split(' ')[0] || '')}
                  placeholder="e.g. Water, Gym, Read"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 9,
                    border: '1px solid var(--line2)',
                    background: 'var(--card)',
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: 'var(--tx)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--tx2)', marginBottom: 6 }}>
                  HOME PHONE VIEW
                </label>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--tx)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showInHome}
                    onChange={(e) => setShowInHome(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: color, cursor: 'pointer' }}
                  />
                  Show in Home
                </label>
              </div>
            </div>

            {/* Category selection */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--tx2)', marginBottom: 6 }}>
                CATEGORY
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {HABIT_CATEGORIES.map((c) => {
                  const on = category === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategory(c.id)}
                      className="k-squish"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 11px',
                        borderRadius: 10,
                        fontSize: 11.5,
                        fontWeight: 700,
                        border: `1px solid ${on ? c.color : 'var(--line2)'}`,
                        background: on ? `color-mix(in srgb, ${c.color} 18%, transparent)` : 'var(--card2)',
                        color: on ? 'var(--tx)' : 'var(--tx3)',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.color }} />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Goal Type & Target */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--tx2)', marginBottom: 5 }}>
                  TRACKING TYPE
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, background: 'var(--card2)', padding: 3, borderRadius: 10 }}>
                  {(['bin', 'count', 'dur'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setKind(k);
                        if (k === 'dur') setTargetUnit('mins');
                        else if (k === 'count') setTargetUnit('times');
                        else setTargetUnit('day');
                      }}
                      style={{
                        padding: '6px 4px',
                        borderRadius: 7,
                        fontSize: 11,
                        fontWeight: 700,
                        border: 'none',
                        background: kind === k ? 'var(--card)' : 'transparent',
                        color: kind === k ? 'var(--tx)' : 'var(--tx3)',
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      {k === 'bin' ? 'Yes / No' : k === 'count' ? 'Count' : 'Timer'}
                    </button>
                  ))}
                </div>
              </div>

              {kind !== 'bin' && (
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--tx2)', marginBottom: 5 }}>
                    DAILY TARGET
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="number"
                      min={1}
                      value={target}
                      onChange={(e) => setTarget(Math.max(1, Number(e.target.value) || 1))}
                      style={{
                        width: 70,
                        padding: '8px 10px',
                        borderRadius: 10,
                        border: '1px solid var(--line2)',
                        background: 'var(--card2)',
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--tx)',
                      }}
                    />
                    <input
                      value={targetUnit}
                      onChange={(e) => setTargetUnit(e.target.value)}
                      placeholder="unit (e.g. mins, pages)"
                      style={{
                        flex: 1,
                        padding: '8px 10px',
                        borderRadius: 10,
                        border: '1px solid var(--line2)',
                        background: 'var(--card2)',
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--tx)',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Time of day & Frequency */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--tx2)', marginBottom: 5 }}>
                  TIME OF DAY
                </label>
                <select
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value as TimeOfDay)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--line2)',
                    background: 'var(--card2)',
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: 'var(--tx)',
                  }}
                >
                  <option value="anytime">☀️ Anytime throughout day</option>
                  <option value="morning">🌅 Morning routine</option>
                  <option value="afternoon">🌤️ Afternoon focus</option>
                  <option value="evening">🌙 Evening wind-down</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--tx2)', marginBottom: 5 }}>
                  FREQUENCY
                </label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as HabitFrequency)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--line2)',
                    background: 'var(--card2)',
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: 'var(--tx)',
                  }}
                >
                  <option value="daily">Every day (7 days/week)</option>
                  <option value="weekdays">Weekdays only (Mon–Fri)</option>
                  <option value="weekends">Weekends only (Sat–Sun)</option>
                  <option value="weekly">Weekly goal (1x/week)</option>
                </select>
              </div>
            </div>

            {/* Habit Stacking Trigger / Cue */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)' }}>
                  HABIT STACK CUE (OPTIONAL)
                </label>
                <span style={{ fontSize: 10, color: 'var(--accTx)' }}>Atomic Habits Rule</span>
              </div>
              <input
                value={cue}
                onChange={(e) => setCue(e.target.value)}
                placeholder='e.g. "After I pour my morning coffee, I will..."'
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--line2)',
                  background: 'var(--card2)',
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'var(--tx)',
                }}
              />
            </div>

            {/* Color & Icon Picker */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--tx2)', marginBottom: 6 }}>
                COLOR THEME
              </label>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: c,
                      border: color === c ? '3px solid #fff' : '2px solid transparent',
                      boxShadow: color === c ? '0 0 0 2px var(--acc)' : 'none',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Submit Action */}
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button
                type="button"
                onClick={onClose}
                className="hov k-squish"
                style={{
                  flex: 1,
                  padding: '11px',
                  borderRadius: 12,
                  border: '1px solid var(--line2)',
                  background: 'transparent',
                  color: 'var(--tx2)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!name.trim()}
                className="acc k-squish"
                style={{
                  flex: 2,
                  padding: '11px',
                  borderRadius: 12,
                  background: 'var(--acc)',
                  color: 'var(--ink)',
                  fontSize: 13,
                  fontWeight: 800,
                  border: 'none',
                  cursor: !name.trim() ? 'not-allowed' : 'pointer',
                  opacity: !name.trim() ? 0.5 : 1,
                }}
              >
                {initial ? 'Save Changes' : 'Create Habit'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // `main` carries the font-scale zoom and the page-entry transform, so it is
  // the containing block for anything fixed inside it. Portal to the body or
  // this overlay is positioned against the page, not the viewport.
  return typeof document === 'undefined' ? null : createPortal(body, document.body);
}
