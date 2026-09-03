'use client';

import { useState } from 'react';
import { Icon } from './Icon';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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
}: TaskDatePickerProps) {
  const now = new Date();
  const init = initialDate ? new Date(initialDate + 'T00:00:00') : now;

  const [viewYear, setViewYear] = useState(init.getFullYear());
  const [viewMonth, setViewMonth] = useState(init.getMonth()); // 0-11
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate);
  const [selectedTime, setSelectedTime] = useState<string>(initialTime || '');
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');

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

  // Build grid days
  const gridCells: { day: number; current: boolean; ymd: string }[] = [];

  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const m = viewMonth === 0 ? 11 : viewMonth - 1;
    const y = viewMonth === 0 ? viewYear - 1 : viewYear;
    gridCells.push({ day, current: false, ymd: formatYMD(y, m, day) });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    gridCells.push({ day, current: true, ymd: formatYMD(viewYear, viewMonth, day) });
  }

  const remaining = 35 - gridCells.length >= 0 ? 35 - gridCells.length : 42 - gridCells.length;
  for (let day = 1; day <= remaining; day++) {
    const m = viewMonth === 11 ? 0 : viewMonth + 1;
    const y = viewMonth === 11 ? viewYear + 1 : viewYear;
    gridCells.push({ day, current: false, ymd: formatYMD(y, m, day) });
  }

  // Quick preset dates
  const setQuickDate = (offsetDays: number) => {
    const target = new Date();
    target.setDate(target.getDate() + offsetDays);
    setSelectedDate(formatYMD(target.getFullYear(), target.getMonth(), target.getDate()));
    setViewYear(target.getFullYear());
    setViewMonth(target.getMonth());
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        hideClose
        className="w-[340px] max-w-[94vw] p-5 rounded-[22px] border-[var(--line2)] bg-[var(--card)] text-[var(--tx)] shadow-[var(--shl)] focus:outline-none"
      >
        <DialogTitle className="sr-only">Select Due Date and Time</DialogTitle>

        {/* Quick presets */}
        <div className="flex items-center gap-1.5 pb-2 border-b border-[var(--line)]">
          <button
            type="button"
            onClick={() => setQuickDate(0)}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--card2)] hover:bg-[var(--hov)] text-[var(--tx2)] hover:text-[var(--tx)] transition-colors border border-[var(--line)]"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setQuickDate(1)}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--card2)] hover:bg-[var(--hov)] text-[var(--tx2)] hover:text-[var(--tx)] transition-colors border border-[var(--line)]"
          >
            Tomorrow
          </button>
          <button
            type="button"
            onClick={() => setQuickDate(7)}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--card2)] hover:bg-[var(--hov)] text-[var(--tx2)] hover:text-[var(--tx)] transition-colors border border-[var(--line)]"
          >
            +1 Week
          </button>
        </div>

        {/* Month Navigation Header */}
        <div className="flex items-center justify-between pt-1">
          <div className="text-[14.5px] font-bold tracking-tight text-[var(--tx)]">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={prevMonth}
              className="w-7 h-7 rounded-full grid place-items-center text-[var(--tx2)] hover:text-[var(--tx)] hover:bg-[var(--hov)] transition-colors"
              title="Previous month"
            >
              <Icon name="chev" size={13} color="currentColor" style={{ transform: 'rotate(90deg)' }} />
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="w-7 h-7 rounded-full grid place-items-center text-[var(--tx2)] hover:text-[var(--tx)] hover:bg-[var(--hov)] transition-colors"
              title="Next month"
            >
              <Icon name="chev" size={13} color="currentColor" style={{ transform: 'rotate(-90deg)' }} />
            </button>
          </div>
        </div>

        {/* Days of Week Header */}
        <div className="grid grid-cols-7 text-center">
          {DAYS_HEADER.map((d, i) => (
            <div key={i} className="text-[10.5px] font-bold text-[var(--tx3)] py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar Day Grid */}
        <div className="grid grid-cols-7 gap-1">
          {gridCells.map((cell, idx) => {
            const isSelected = selectedDate === cell.ymd;
            const today = isToday(
              viewYear,
              cell.current ? viewMonth : (cell.day > 15 ? viewMonth - 1 : viewMonth + 1),
              cell.day
            );

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedDate(cell.ymd)}
                className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center text-xs transition-all ${
                  isSelected
                    ? 'bg-[var(--acc)] text-[var(--ink)] font-extrabold shadow-sm scale-105'
                    : today
                    ? 'border border-[var(--acc)] text-[var(--tx)] font-bold'
                    : cell.current
                    ? 'text-[var(--tx)] font-medium hover:bg-[var(--hov)]'
                    : 'text-[var(--tx3)] opacity-40 hover:opacity-80'
                }`}
              >
                {cell.day}
              </button>
            );
          })}
        </div>

        {/* Time Selector */}
        <div className="pt-2 border-t border-[var(--line)]">
          <div
            onClick={() => setTimePickerOpen((v) => !v)}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[var(--card2)] border border-[var(--line)] cursor-pointer hover:bg-[var(--hov)] transition-colors"
          >
            <Icon name="clock" size={14} color="var(--tx2)" />
            <span className="text-xs font-medium text-[var(--tx)] flex-1">
              {selectedTime ? `Time: ${selectedTime}` : 'Add time (optional)'}
            </span>
            {selectedTime && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTime('');
                }}
                className="text-[var(--tx3)] hover:text-[var(--tx)] p-0.5"
              >
                <Icon name="close" size={12} color="currentColor" />
              </button>
            )}
          </div>

          {timePickerOpen && (
            <div className="flex gap-1.5 mt-2 flex-wrap items-center">
              {['09:00', '12:00', '15:00', '18:00', '21:00'].map((tm) => (
                <button
                  key={tm}
                  type="button"
                  onClick={() => {
                    setSelectedTime(tm);
                    setTimePickerOpen(false);
                  }}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold border transition-colors ${
                    selectedTime === tm
                      ? 'bg-[var(--acc)] text-[var(--ink)] border-[var(--acc)]'
                      : 'bg-[var(--card2)] text-[var(--tx2)] border-[var(--line)] hover:bg-[var(--hov)]'
                  }`}
                >
                  {tm}
                </button>
              ))}
              <input
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="px-2 py-0.5 rounded-md text-xs bg-[var(--card2)] text-[var(--tx)] border border-[var(--line)] outline-none"
              />
            </div>
          )}
        </div>

        {/* Repeat Selector */}
        <div
          onClick={() => {
            const modes: ('none' | 'daily' | 'weekly' | 'monthly')[] = ['none', 'daily', 'weekly', 'monthly'];
            const idx = modes.indexOf(repeatMode);
            setRepeatMode(modes[(idx + 1) % modes.length]);
          }}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl cursor-pointer hover:bg-[var(--hov)] transition-colors text-xs text-[var(--tx3)] hover:text-[var(--tx)]"
        >
          <Icon name="spark" size={14} color="var(--tx2)" />
          <span>{repeatMode === 'none' ? 'Does not repeat' : `Repeats ${repeatMode}`}</span>
        </div>

        {/* Action Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--line)]">
          <button
            type="button"
            onClick={handleClear}
            className="w-8 h-8 rounded-lg grid place-items-center text-[var(--tx3)] hover:text-red-400 hover:bg-[var(--hov)] transition-colors"
            title="Clear date and time"
          >
            <Icon name="trash" size={15} color="currentColor" />
          </button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-xs font-semibold text-[var(--tx2)]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              className="text-xs font-bold bg-[var(--acc)] text-[var(--ink)] hover:bg-[var(--acc)]/90 shadow-sm"
            >
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
