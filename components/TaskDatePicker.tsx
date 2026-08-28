'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { PAL } from '@/lib/pal';

interface TaskDatePickerProps {
  initialDate: string | null;
  initialTime?: string | null;
  onSave: (due_on: string | null, due_at: string | null) => void;
  onClose: () => void;
  anchorRect?: { top: number; left: number; bottom: number; right: number } | null;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAYS_HEADER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function TaskDatePicker({
  initialDate,
  initialTime,
  onSave,
  onClose,
  anchorRect,
}: TaskDatePickerProps) {
  // Parse initial date
  const now = new Date();
  const init = initialDate ? new Date(initialDate + 'T00:00:00') : now;

  const [viewYear, setViewYear] = useState(init.getFullYear());
  const [viewMonth, setViewMonth] = useState(init.getMonth()); // 0-11
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate);
  const [selectedTime, setSelectedTime] = useState<string>(initialTime || '');
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');

  const cardRef = useRef<HTMLDivElement>(null);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleClick = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    const timer = setTimeout(() => {
      window.addEventListener('pointerdown', handleClick);
    }, 10);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('pointerdown', handleClick);
    };
  }, [onClose]);

  // Calendar math
  const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const formatYMD = (year: number, month: number, day: number) => {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  };

  const isToday = (year: number, month: number, day: number) => {
    return (
      year === now.getFullYear() &&
      month === now.getMonth() &&
      day === now.getDate()
    );
  };

  const handleSave = () => {
    if (!selectedDate) {
      onSave(null, null);
      onClose();
      return;
    }
    let due_at: string | null = null;
    if (selectedTime) {
      const d = new Date(`${selectedDate}T${selectedTime}`);
      if (!isNaN(d.getTime())) {
        due_at = d.toISOString();
      }
    }
    onSave(selectedDate, due_at);
    onClose();
  };

  const handleClear = () => {
    setSelectedDate(null);
    setSelectedTime('');
    onSave(null, null);
    onClose();
  };

  // Build grid days (previous padding, current month, next padding)
  const gridCells: { day: number; current: boolean; ymd: string }[] = [];

  // Prev month padding
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const m = viewMonth === 0 ? 11 : viewMonth - 1;
    const y = viewMonth === 0 ? viewYear - 1 : viewYear;
    gridCells.push({ day, current: false, ymd: formatYMD(y, m, day) });
  }

  // Current month
  for (let day = 1; day <= daysInMonth; day++) {
    gridCells.push({ day, current: true, ymd: formatYMD(viewYear, viewMonth, day) });
  }

  // Next month padding to fill up to 35 or 42 cells
  const remaining = 35 - gridCells.length >= 0 ? 35 - gridCells.length : 42 - gridCells.length;
  for (let day = 1; day <= remaining; day++) {
    const m = viewMonth === 11 ? 0 : viewMonth + 1;
    const y = viewMonth === 11 ? viewYear + 1 : viewYear;
    gridCells.push({ day, current: false, ymd: formatYMD(y, m, day) });
  }

  // Position calculation (centered or anchored)
  let topStyle: number | string = '50%';
  let leftStyle: number | string = '50%';
  let transformStyle = 'translate(-50%, -50%)';

  if (anchorRect && typeof window !== 'undefined') {
    const popWidth = 320;
    const popHeight = 440;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = anchorRect.left;
    if (left + popWidth > vw - 16) {
      left = Math.max(16, vw - popWidth - 16);
    }

    let top = anchorRect.bottom + 8;
    if (top + popHeight > vh - 16) {
      top = Math.max(16, anchorRect.top - popHeight - 8);
    }

    topStyle = top;
    leftStyle = left;
    transformStyle = 'none';
  }

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        ref={cardRef}
        className="k-bloom"
        style={{
          position: 'absolute',
          top: topStyle,
          left: leftStyle,
          transform: transformStyle,
          width: 320,
          background: 'var(--card, #1E1F22)',
          borderRadius: 24,
          padding: '20px 20px 16px',
          boxShadow: '0 18px 48px rgba(0, 0, 0, 0.55), 0 0 0 1px var(--line2, rgba(255,255,255,0.12))',
          border: '1px solid var(--line2, rgba(255,255,255,0.12))',
          color: 'var(--tx, #E3E3E3)',
          userSelect: 'none',
        }}
      >
        {/* Header: Month Year + Arrows */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--tx)' }}>
            {MONTH_NAMES[viewMonth]} {viewYear}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={prevMonth}
              className="hov k-squish"
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
              title="Previous month"
            >
              <Icon name="chev" size={14} color="var(--tx2)" style={{ transform: 'rotate(90deg)' }} />
            </button>
            <button
              onClick={nextMonth}
              className="hov k-squish"
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
              title="Next month"
            >
              <Icon name="chev" size={14} color="var(--tx2)" style={{ transform: 'rotate(-90deg)' }} />
            </button>
          </div>
        </div>

        {/* Days of Week Header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: 6 }}>
          {DAYS_HEADER.map((d, i) => (
            <div key={i} style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3, #8E918F)', padding: '4px 0' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Calendar Day Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: 14 }}>
          {gridCells.map((cell, idx) => {
            const isSelected = selectedDate === cell.ymd;
            const today = isToday(viewYear, cell.current ? viewMonth : (cell.day > 15 ? viewMonth - 1 : viewMonth + 1), cell.day);

            return (
              <button
                key={idx}
                onClick={() => setSelectedDate(cell.ymd)}
                style={{
                  width: 36,
                  height: 36,
                  margin: '0 auto',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12.5,
                  fontWeight: isSelected ? 800 : (today ? 700 : 500),
                  border: today && !isSelected ? '1px solid var(--acc, #A8C7FA)' : 'none',
                  background: isSelected
                    ? 'var(--acc, #A8C7FA)'
                    : 'transparent',
                  color: isSelected
                    ? '#040C1A'
                    : (cell.current ? 'var(--tx, #E3E3E3)' : 'var(--tx3, #5E6268)'),
                  cursor: 'pointer',
                  transition: 'background .15s, color .15s',
                }}
              >
                {cell.day}
              </button>
            );
          })}
        </div>

        {/* Set Time Row */}
        <div style={{ marginBottom: 10 }}>
          <div
            onClick={() => setTimePickerOpen((v) => !v)}
            className="hov"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 12px',
              borderRadius: 10,
              background: 'var(--card2, #282A2C)',
              cursor: 'pointer',
            }}
          >
            <Icon name="clock" size={16} color="var(--tx2)" />
            <span style={{ fontSize: 13, fontWeight: 500, color: selectedTime ? 'var(--tx)' : 'var(--tx3)', flex: 1 }}>
              {selectedTime ? `Time: ${selectedTime}` : 'Set time'}
            </span>
            {selectedTime && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTime('');
                }}
                style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', padding: 2 }}
              >
                <Icon name="close" size={12} color="var(--tx3)" />
              </button>
            )}
          </div>

          {timePickerOpen && (
            <div style={{ display: 'flex', gap: 6, marginTop: 6, padding: '0 4px', flexWrap: 'wrap' }}>
              {['09:00', '12:00', '15:00', '18:00', '20:00'].map((tm) => (
                <button
                  key={tm}
                  onClick={() => {
                    setSelectedTime(tm);
                    setTimePickerOpen(false);
                  }}
                  className="k-squish"
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    background: selectedTime === tm ? 'var(--acc)' : 'var(--card2)',
                    color: selectedTime === tm ? '#040C1A' : 'var(--tx2)',
                    border: '1px solid var(--line2)',
                    cursor: 'pointer',
                  }}
                >
                  {tm}
                </button>
              ))}
              <input
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                style={{
                  padding: '3px 6px',
                  borderRadius: 6,
                  fontSize: 11,
                  background: 'var(--card2)',
                  color: 'var(--tx)',
                  border: '1px solid var(--line2)',
                  outline: 'none',
                }}
              />
            </div>
          )}
        </div>

        {/* Repeat Row */}
        <div style={{ marginBottom: 18 }}>
          <div
            onClick={() => {
              const modes: ('none' | 'daily' | 'weekly' | 'monthly')[] = ['none', 'daily', 'weekly', 'monthly'];
              const idx = modes.indexOf(repeatMode);
              setRepeatMode(modes[(idx + 1) % modes.length]);
            }}
            className="hov"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 12px',
              borderRadius: 10,
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            <Icon name="spark" size={16} color="var(--tx2)" />
            <span style={{ fontSize: 13, fontWeight: 500, color: repeatMode !== 'none' ? 'var(--tx)' : 'var(--tx3)' }}>
              {repeatMode === 'none' ? 'Repeat' : `Repeats: ${repeatMode}`}
            </span>
          </div>
        </div>

        {/* Action Footer: Trash on left, Cancel & Done on right */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--line2)' }}>
          <button
            onClick={handleClear}
            className="hov k-squish"
            title="Clear date and time"
            aria-label="Clear date and time"
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <Icon name="trash" size={16} color="var(--tx2)" />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={onClose}
              className="hov k-squish"
              style={{
                padding: '8px 14px',
                borderRadius: 18,
                background: 'transparent',
                border: 'none',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--tx2)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="k-squish"
              style={{
                padding: '8px 20px',
                borderRadius: 20,
                background: 'var(--acc, #A8C7FA)',
                color: '#040C1A',
                border: 'none',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
