'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { playClick, playTick } from '@/lib/audio';

interface MathSketchpadProps {
  onInsert: (dataUrl: string) => void;
  onClose: () => void;
}

const COLORS = [
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Cyan', hex: '#38D6F2' },
  { name: 'Mint', hex: '#34D9A0' },
  { name: 'Amber', hex: '#FFC24B' },
  { name: 'Coral', hex: '#FF6B6B' },
  { name: 'Violet', hex: '#B07CFF' },
];

const SIZES = [
  { name: 'Fine', px: 2 },
  { name: 'Medium', px: 3.5 },
  { name: 'Thick', px: 6 },
];

export function MathSketchpad({ onInsert, onClose }: MathSketchpadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState('#38D6F2');
  const [size, setSize] = useState(3.5);
  const [history, setHistory] = useState<ImageData[]>([]);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // Setup High-DPI canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parent = canvas.parentElement;
    const w = parent?.clientWidth || 560;
    const h = 320;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Dark grid background
    ctx.fillStyle = '#141620';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 20; x < w; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 20; y < h; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    setHistory([ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  }, []);

  const getCanvasCoords = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    isDrawing.current = true;
    const coords = getCanvasCoords(e);
    lastPos.current = coords;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.arc(coords.x, coords.y, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = tool === 'eraser' ? '#141620' : color;
    ctx.fill();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing.current || !lastPos.current) return;
    const coords = getCanvasCoords(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(coords.x, coords.y);
    ctx.strokeStyle = tool === 'eraser' ? '#141620' : color;
    ctx.lineWidth = tool === 'eraser' ? size * 4 : size;
    ctx.stroke();

    lastPos.current = coords;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    lastPos.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setHistory((prev) => [...prev.slice(-12), ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  };

  const handleUndo = () => {
    if (history.length <= 1) return;
    playClick();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const newHistory = history.slice(0, -1);
    const prevSnapshot = newHistory[newHistory.length - 1];
    if (prevSnapshot) {
      ctx.putImageData(prevSnapshot, 0, 0);
      setHistory(newHistory);
    }
  };

  const handleClear = () => {
    playTick();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.parentElement?.clientWidth || 560;
    const h = 320;
    ctx.fillStyle = '#141620';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 20; x < w; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 20; y < h; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    setHistory((prev) => [...prev.slice(-12), ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    playClick();
    const dataUrl = canvas.toDataURL('image/png');
    onInsert(dataUrl);
  };

  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--line2)',
        borderRadius: 16,
        padding: 16,
        boxShadow: 'var(--shl)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        maxWidth: 600,
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'color-mix(in srgb, var(--acc) 18%, transparent)', display: 'grid', placeItems: 'center' }}>
            <Icon name="spark" size={15} color="var(--accTx)" />
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--tx)' }}>Math Equation Sketchpad</div>
            <div style={{ fontSize: 11, color: 'var(--tx3)' }}>Draw formulas, diagrams, and handwriting</div>
          </div>
        </div>
        <button onClick={onClose} className="hov k-squish" style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--tx3)', fontSize: 16, cursor: 'pointer' }}>
          ✕
        </button>
      </div>

      {/* Toolbar Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Tool Mode */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--card2)', padding: 3, borderRadius: 9, border: '1px solid var(--line2)' }}>
          <button
            onClick={() => setTool('pen')}
            className="k-squish"
            style={{
              padding: '5px 10px',
              borderRadius: 7,
              border: 'none',
              fontSize: 11.5,
              fontWeight: 700,
              background: tool === 'pen' ? 'var(--acc)' : 'transparent',
              color: tool === 'pen' ? 'var(--ink)' : 'var(--tx2)',
              cursor: 'pointer',
            }}
          >
            Pen
          </button>
          <button
            onClick={() => setTool('eraser')}
            className="k-squish"
            style={{
              padding: '5px 10px',
              borderRadius: 7,
              border: 'none',
              fontSize: 11.5,
              fontWeight: 700,
              background: tool === 'eraser' ? 'var(--acc)' : 'transparent',
              color: tool === 'eraser' ? 'var(--ink)' : 'var(--tx2)',
              cursor: 'pointer',
            }}
          >
            Eraser
          </button>
        </div>

        {/* Color Palette */}
        {tool === 'pen' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 4px' }}>
            {COLORS.map((c) => (
              <button
                key={c.hex}
                onClick={() => setColor(c.hex)}
                title={c.name}
                className="k-squish"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: c.hex,
                  border: color === c.hex ? '2px solid #FFFFFF' : '1px solid var(--line2)',
                  boxShadow: color === c.hex ? '0 0 8px ' + c.hex : 'none',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        )}

        {/* Brush Size */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--card2)', padding: 3, borderRadius: 9, border: '1px solid var(--line2)', marginLeft: 'auto' }}>
          {SIZES.map((s) => (
            <button
              key={s.name}
              onClick={() => setSize(s.px)}
              className="k-squish"
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                border: 'none',
                fontSize: 11,
                fontWeight: 700,
                background: size === s.px ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: size === s.px ? 'var(--tx)' : 'var(--tx3)',
                cursor: 'pointer',
              }}
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* Undo & Clear */}
        <button onClick={handleUndo} title="Undo last stroke" className="hov k-squish" style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--line2)', color: 'var(--tx2)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
          Undo
        </button>
        <button onClick={handleClear} title="Clear canvas" className="hov k-squish" style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--line2)', color: 'var(--pal-coral)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
          Clear
        </button>
      </div>

      {/* Canvas Area */}
      <div style={{ width: '100%', height: 320, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line2)' }}>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ width: '100%', height: '100%', display: 'block', cursor: tool === 'eraser' ? 'cell' : 'crosshair', touchAction: 'none' }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        <button onClick={onClose} className="hov k-squish" style={{ padding: '8px 16px', borderRadius: 9, background: 'transparent', border: '1px solid var(--line2)', color: 'var(--tx2)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          Cancel
        </button>
        <button onClick={handleSave} className="acc k-squish" style={{ padding: '8px 20px', borderRadius: 9, background: 'var(--acc)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 800, border: 'none', cursor: 'pointer' }}>
          Insert Sketch to Note
        </button>
      </div>
    </div>
  );
}
