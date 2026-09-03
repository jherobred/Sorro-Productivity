'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Icon, type IconName } from '../Icon';
import { playClick, playTick } from '@/lib/audio';

interface NoteSketchpadProps {
  initialImage?: string;
  onInsert: (dataUrl: string) => void;
  onClose: () => void;
}

type Tool =
  | 'pen'
  | 'pencil'
  | 'brush'
  | 'highlighter'
  | 'eraser'
  | 'line'
  | 'arrow'
  | 'double_arrow'
  | 'rect'
  | 'circle'
  | 'triangle'
  | 'star'
  | 'text';

type BgStyle = 'dark_grid' | 'light_paper' | 'blueprint' | 'dot_matrix' | 'lined' | 'solid_dark' | 'transparent';

const PALETTE = [
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Light Gray', hex: '#D1D5DB' },
  { name: 'Charcoal', hex: '#374151' },
  { name: 'Black', hex: '#111827' },
  { name: 'Coral Red', hex: '#FF6B6B' },
  { name: 'Rose Pink', hex: '#F472B6' },
  { name: 'Orange', hex: '#FF9A3C' },
  { name: 'Amber Yellow', hex: '#FFC24B' },
  { name: 'Mint Green', hex: '#34D9A0' },
  { name: 'Emerald', hex: '#10B981' },
  { name: 'Cyan Sky', hex: '#38BDF8' },
  { name: 'Electric Blue', hex: '#3B82F6' },
  { name: 'Violet Purple', hex: '#B07CFF' },
  { name: 'Deep Lavender', hex: '#7C6CFF' },
];

const STROKE_SIZES = [
  { name: 'Fine', px: 1.5 },
  { name: 'Thin', px: 3 },
  { name: 'Medium', px: 6 },
  { name: 'Thick', px: 12 },
  { name: 'Marker', px: 24 },
  { name: 'Broad', px: 38 },
];

export function NoteSketchpad({ initialImage, onInsert, onClose }: NoteSketchpadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#38BDF8');
  const [size, setSize] = useState(3.5);
  const [fillShape, setFillShape] = useState(false);
  const [bgStyle, setBgStyle] = useState<BgStyle>('dark_grid');
  const [opacity, setOpacity] = useState(1);
  const [textInput, setTextInput] = useState<{ x: number; y: number; text: string } | null>(null);
  const [stylusOnly, setStylusOnly] = useState(false);
  const penDetected = useRef(false);

  const historyRef = useRef<ImageData[]>([]);
  const historyIdxRef = useRef<number>(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const isDrawing = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const strokePoints = useRef<{ x: number; y: number }[]>([]);

  // Update undo/redo state
  const updateUndoRedo = () => {
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(historyIdxRef.current < historyRef.current.length - 1);
  };

  // Push snapshot to history
  const pushHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    historyRef.current = historyRef.current.slice(0, historyIdxRef.current + 1);
    historyRef.current.push(data);
    if (historyRef.current.length > 50) historyRef.current.shift();
    historyIdxRef.current = historyRef.current.length - 1;
    updateUndoRedo();
  }, []);

  // Draw background texture on canvas
  const drawBackground = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, style: BgStyle) => {
    ctx.save();
    ctx.clearRect(0, 0, w, h);

    if (style === 'transparent') {
      ctx.restore();
      return;
    }

    if (style === 'light_paper') {
      ctx.fillStyle = '#F8F9FB';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.lineWidth = 1;
      for (let x = 20; x < w; x += 22) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 20; y < h; y += 22) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    } else if (style === 'blueprint') {
      ctx.fillStyle = '#0F2537';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.lineWidth = 1;
      for (let x = 16; x < w; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 16; y < h; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    } else if (style === 'lined') {
      ctx.fillStyle = '#141620';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      for (let y = 26; y < h; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    } else if (style === 'dot_matrix') {
      ctx.fillStyle = '#11121A';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      for (let x = 18; x < w; x += 20) {
        for (let y = 18; y < h; y += 20) {
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (style === 'solid_dark') {
      ctx.fillStyle = '#101118';
      ctx.fillRect(0, 0, w, h);
    } else {
      // dark_grid
      ctx.fillStyle = '#13141F';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let x = 20; x < w; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 20; y < h; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    }

    ctx.restore();
  }, []);

  // Initialize Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!canvas || !overlay) return;

    const parent = canvas.parentElement;
    const w = parent?.clientWidth ? Math.max(320, parent.clientWidth) : 680;
    const h = 420;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    overlay.width = w * dpr;
    overlay.height = h * dpr;
    overlay.style.width = `${w}px`;
    overlay.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    const octx = overlay.getContext('2d');
    if (!ctx || !octx) return;

    ctx.scale(dpr, dpr);
    octx.scale(dpr, dpr);

    drawBackground(ctx, w, h, bgStyle);

    if (initialImage) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
        pushHistory();
      };
      img.src = initialImage;
    } else {
      pushHistory();
    }
  }, []);

  const getCanvasCoords = (e: React.PointerEvent) => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return { x: 0, y: 0 };
    const rect = overlay.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  // Drawing helpers
  const drawArrow = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, double: boolean = false) => {
    const headlen = Math.max(10, size * 2.5);
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // To Arrow Head
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();

    // From Arrow Head (if double-ended)
    if (double) {
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(fromX + headlen * Math.cos(angle - Math.PI / 6), fromY + headlen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(fromX + headlen * Math.cos(angle + Math.PI / 6), fromY + headlen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    }
  };

  const drawStar = (ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerR: number, innerR: number) => {
    let rot = (Math.PI / 2) * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerR);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerR;
      y = cy + Math.sin(rot) * outerR;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerR;
      y = cy + Math.sin(rot) * innerR;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerR);
    ctx.closePath();
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (textInput) return;
    const coords = getCanvasCoords(e);
    isDrawing.current = true;
    startPos.current = coords;
    lastPos.current = coords;
    strokePoints.current = [coords];

    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}

    if (tool === 'text') {
      setTextInput({ x: coords.x, y: coords.y, text: '' });
      isDrawing.current = false;
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (tool === 'pen' || tool === 'pencil' || tool === 'brush' || tool === 'highlighter' || tool === 'eraser') {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (tool === 'eraser') {
        ctx.strokeStyle = bgStyle === 'light_paper' ? '#F8F9FB' : bgStyle === 'transparent' ? 'rgba(0,0,0,0)' : '#13141F';
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = size * 3;
        ctx.beginPath();
        ctx.arc(coords.x, coords.y, size * 1.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (tool === 'highlighter') {
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = size * 4;
        ctx.beginPath();
        ctx.arc(coords.x, coords.y, size * 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (tool === 'pencil') {
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = Math.max(1, size * 0.7);
        ctx.beginPath();
        ctx.arc(coords.x, coords.y, size * 0.35, 0, Math.PI * 2);
        ctx.fill();
      } else if (tool === 'brush') {
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.globalAlpha = opacity;
        ctx.lineWidth = size * 2.5;
        ctx.beginPath();
        ctx.arc(coords.x, coords.y, size * 1.25, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // pen
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.globalAlpha = opacity;
        ctx.lineWidth = size;
        ctx.beginPath();
        ctx.arc(coords.x, coords.y, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing.current || !lastPos.current || !startPos.current) return;
    const coords = getCanvasCoords(e);
    strokePoints.current.push(coords);

    const canvas = canvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!canvas || !overlay) return;
    const ctx = canvas.getContext('2d');
    const octx = overlay.getContext('2d');
    if (!ctx || !octx) return;

    const w = overlay.clientWidth;
    const h = overlay.clientHeight;

    // Direct drawing for freehand brushes
    if (tool === 'pen' || tool === 'pencil' || tool === 'brush' || tool === 'highlighter' || tool === 'eraser') {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (tool === 'eraser') {
        ctx.strokeStyle = bgStyle === 'light_paper' ? '#F8F9FB' : bgStyle === 'transparent' ? 'rgba(0,0,0,0)' : '#13141F';
        ctx.lineWidth = size * 3;
      } else if (tool === 'highlighter') {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = size * 4;
      } else if (tool === 'pencil') {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = Math.max(1, size * 0.7);
      } else if (tool === 'brush') {
        ctx.strokeStyle = color;
        ctx.globalAlpha = opacity;
        ctx.lineWidth = size * 2.5;
      } else {
        ctx.strokeStyle = color;
        ctx.globalAlpha = opacity;
        ctx.lineWidth = size;
      }

      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
      ctx.restore();

      lastPos.current = coords;
      return;
    }

    // Shape preview on overlay canvas
    octx.clearRect(0, 0, w, h);
    octx.save();
    octx.strokeStyle = color;
    octx.fillStyle = fillShape ? color : 'transparent';
    octx.lineWidth = size;
    octx.globalAlpha = opacity;
    octx.lineCap = 'round';
    octx.lineJoin = 'round';

    const sx = startPos.current.x;
    const sy = startPos.current.y;
    const ex = coords.x;
    const ey = coords.y;

    if (tool === 'line') {
      octx.beginPath();
      octx.moveTo(sx, sy);
      octx.lineTo(ex, ey);
      octx.stroke();
    } else if (tool === 'arrow') {
      drawArrow(octx, sx, sy, ex, ey, false);
    } else if (tool === 'double_arrow') {
      drawArrow(octx, sx, sy, ex, ey, true);
    } else if (tool === 'rect') {
      const rx = Math.min(sx, ex);
      const ry = Math.min(sy, ey);
      const rw = Math.abs(ex - sx);
      const rh = Math.abs(ey - sy);
      octx.beginPath();
      octx.rect(rx, ry, rw, rh);
      if (fillShape) octx.fill();
      octx.stroke();
    } else if (tool === 'circle') {
      const rx = Math.abs(ex - sx) / 2;
      const ry = Math.abs(ey - sy) / 2;
      const cx = Math.min(sx, ex) + rx;
      const cy = Math.min(sy, ey) + ry;
      octx.beginPath();
      octx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (fillShape) octx.fill();
      octx.stroke();
    } else if (tool === 'triangle') {
      octx.beginPath();
      octx.moveTo(sx + (ex - sx) / 2, sy);
      octx.lineTo(ex, ey);
      octx.lineTo(sx, ey);
      octx.closePath();
      if (fillShape) octx.fill();
      octx.stroke();
    } else if (tool === 'star') {
      const r = Math.hypot(ex - sx, ey - sy);
      drawStar(octx, sx, sy, 5, r, r * 0.45);
      if (fillShape) octx.fill();
      octx.stroke();
    }

    octx.restore();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDrawing.current) return;
    isDrawing.current = false;

    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    const canvas = canvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!canvas || !overlay) return;
    const ctx = canvas.getContext('2d');
    const octx = overlay.getContext('2d');
    if (!ctx || !octx) return;

    const w = overlay.clientWidth;
    const h = overlay.clientHeight;

    // If we were drawing a shape, commit from overlay to base canvas
    if (startPos.current && lastPos.current && tool !== 'pen' && tool !== 'pencil' && tool !== 'brush' && tool !== 'highlighter' && tool !== 'eraser') {
      const coords = getCanvasCoords(e);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = fillShape ? color : 'transparent';
      ctx.lineWidth = size;
      ctx.globalAlpha = opacity;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const sx = startPos.current.x;
      const sy = startPos.current.y;
      const ex = coords.x;
      const ey = coords.y;

      if (tool === 'line') {
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      } else if (tool === 'arrow') {
        drawArrow(ctx, sx, sy, ex, ey, false);
      } else if (tool === 'double_arrow') {
        drawArrow(ctx, sx, sy, ex, ey, true);
      } else if (tool === 'rect') {
        const rx = Math.min(sx, ex);
        const ry = Math.min(sy, ey);
        const rw = Math.abs(ex - sx);
        const rh = Math.abs(ey - sy);
        ctx.beginPath();
        ctx.rect(rx, ry, rw, rh);
        if (fillShape) ctx.fill();
        ctx.stroke();
      } else if (tool === 'circle') {
        const rx = Math.abs(ex - sx) / 2;
        const ry = Math.abs(ey - sy) / 2;
        const cx = Math.min(sx, ex) + rx;
        const cy = Math.min(sy, ey) + ry;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (fillShape) ctx.fill();
        ctx.stroke();
      } else if (tool === 'triangle') {
        ctx.beginPath();
        ctx.moveTo(sx + (ex - sx) / 2, sy);
        ctx.lineTo(ex, ey);
        ctx.lineTo(sx, ey);
        ctx.closePath();
        if (fillShape) ctx.fill();
        ctx.stroke();
      } else if (tool === 'star') {
        const r = Math.hypot(ex - sx, ey - sy);
        drawStar(ctx, sx, sy, 5, r, r * 0.45);
        if (fillShape) ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
      octx.clearRect(0, 0, w, h);
    }

    startPos.current = null;
    lastPos.current = null;
    strokePoints.current = [];
    pushHistory();
  };

  // Undo / Redo
  const handleUndo = () => {
    if (historyIdxRef.current <= 0) return;
    playClick();
    historyIdxRef.current -= 1;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const snap = historyRef.current[historyIdxRef.current];
    if (snap) ctx.putImageData(snap, 0, 0);
    updateUndoRedo();
  };

  const handleRedo = () => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    playClick();
    historyIdxRef.current += 1;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const snap = historyRef.current[historyIdxRef.current];
    if (snap) ctx.putImageData(snap, 0, 0);
    updateUndoRedo();
  };

  const handleClear = () => {
    playTick();
    const canvas = canvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!canvas || !overlay) return;
    const ctx = canvas.getContext('2d');
    const octx = overlay.getContext('2d');
    if (!ctx || !octx) return;

    const w = overlay.clientWidth;
    const h = overlay.clientHeight;

    octx.clearRect(0, 0, w, h);
    drawBackground(ctx, w, h, bgStyle);
    pushHistory();
  };

  // Commit text tool input onto canvas
  const commitText = () => {
    if (!textInput || !textInput.text.trim()) {
      setTextInput(null);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.font = `800 ${Math.max(14, size * 3.5)}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(textInput.text, textInput.x, textInput.y + Math.max(14, size * 3.5));
    ctx.restore();

    setTextInput(null);
    pushHistory();
  };

  
  const handleSaveAndInsert = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png', 0.95);
    onInsert(dataUrl);
  };

  // Power User Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveAndInsert();
      } else if (e.key.toLowerCase() === 'p') {
        setTool('pen');
      } else if (e.key.toLowerCase() === 'e') {
        setTool('eraser');
      } else if (e.key.toLowerCase() === 'h') {
        setTool('highlighter');
      } else if (e.key.toLowerCase() === 'b') {
        setTool('brush');
      } else if (e.key.toLowerCase() === 'r') {
        setTool('rect');
      } else if (e.key.toLowerCase() === 'c') {
        setTool('circle');
      } else if (e.key === '[') {
        setSize((s) => Math.max(1, s - 1));
      } else if (e.key === ']') {
        setSize((s) => Math.min(40, s + 1));
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo, handleSaveAndInsert, onClose]);

  const toolBtn = (t: Tool, icon: IconName, label: string) => {
    const active = tool === t;
    return (
      <button
        key={t}
        onClick={() => { setTool(t); playClick(); }}
        className="hov k-squish"
        title={label}
        aria-pressed={active}
        style={{
          height: 30,
          padding: '0 8px',
          borderRadius: 8,
          border: `1px solid ${active ? 'var(--acc)' : 'var(--line2)'}`,
          background: active ? 'color-mix(in srgb, var(--acc) 20%, var(--card2))' : 'var(--card2)',
          color: active ? 'var(--accTx, #FFFFFF)' : 'var(--tx2)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 11,
          fontWeight: active ? 800 : 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <Icon name={icon} size={13} color={active ? 'var(--accTx, #FFFFFF)' : 'var(--tx2)'} />
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="k-bloom"
      style={{
        width: '100vw',
        height: '100vh',
        maxWidth: '100vw',
        maxHeight: '100vh',
        overflow: 'hidden',
        background: 'var(--panel, #12111A)',
        border: 'none',
        borderRadius: 0,
        boxShadow: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '12px 18px',
        color: 'var(--tx)',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'color-mix(in srgb, var(--acc) 20%, transparent)', display: 'grid', placeItems: 'center' }}>
            <Icon name="pen" size={15} color="var(--accTx, #38BDF8)" />
          </div>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.02em', margin: 0 }}>Note Paint & Sketch Studio</h2>
            <p style={{ fontSize: 10.5, color: 'var(--tx3)', margin: 0 }}>Draw annotations, diagrams, formulas, and freehand sketches</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            className="hov k-squish"
            title="Undo"
            style={{
              width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center',
              border: '1px solid var(--line2)', background: 'var(--card2)', cursor: canUndo ? 'pointer' : 'default', opacity: canUndo ? 1 : 0.4,
            }}
          >
            <Icon name="undo" size={13} color="var(--tx2)" />
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedo}
            className="hov k-squish"
            title="Redo"
            style={{
              width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center',
              border: '1px solid var(--line2)', background: 'var(--card2)', cursor: canRedo ? 'pointer' : 'default', opacity: canRedo ? 1 : 0.4,
            }}
          >
            <Icon name="redo" size={13} color="var(--tx2)" />
          </button>
          <button
            onClick={handleClear}
            className="hov k-squish"
            title="Clear canvas"
            style={{
              padding: '0 8px', height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4,
              border: '1px solid var(--line2)', background: 'var(--card2)', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--pal-coral, #FF6B6B)',
            }}
          >
            <Icon name="trash" size={12} color="var(--pal-coral, #FF6B6B)" />
            Clear
          </button>
          <button
            onClick={onClose}
            className="hov k-squish"
            title="Close"
            style={{
              width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center',
              border: '1px solid var(--line2)', background: 'var(--card2)', cursor: 'pointer',
            }}
          >
            <Icon name="close" size={14} color="var(--tx2)" />
          </button>
        </div>
      </div>

      {/* Main Toolbars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--card)', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--line2)' }}>
        {/* Row 1: Drawing & Shape Tools */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', marginRight: 2 }}>Tools</span>
          {toolBtn('pen', 'pen', 'Pen')}
          {toolBtn('pencil', 'pen', 'Pencil')}
          {toolBtn('brush', 'spark', 'Brush')}
          {toolBtn('highlighter', 'pen', 'Highlighter')}
          {toolBtn('eraser', 'trash', 'Eraser')}
          <span style={{ width: 1, height: 18, background: 'var(--line2)', margin: '0 2px' }} />
          {toolBtn('line', 'minus', 'Line')}
          {toolBtn('arrow', 'chevronRight', 'Arrow')}
          {toolBtn('double_arrow', 'sort', 'Bi-Arrow')}
          {toolBtn('rect', 'grid', 'Box')}
          {toolBtn('circle', 'focus', 'Circle')}
          {toolBtn('triangle', 'play', 'Triangle')}
          {toolBtn('star', 'star', 'Star')}
          {toolBtn('text', 'text', 'Text')}
        </div>

        {/* Row 2: Color Palette + Thickness + Fill + Background */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', paddingTop: 6, borderTop: '1px solid var(--line2)' }}>
          {/* Colors */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            {PALETTE.map((c) => (
              <button
                key={c.hex}
                onClick={() => { setColor(c.hex); if (tool === 'eraser') setTool('pen'); }}
                title={c.name}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: c.hex,
                  border: color === c.hex ? '2px solid #FFFFFF' : '1.5px solid rgba(255,255,255,0.15)',
                  boxShadow: color === c.hex ? `0 0 8px ${c.hex}` : 'none',
                  cursor: 'pointer',
                  transform: color === c.hex ? 'scale(1.2)' : 'scale(1)',
                  transition: 'transform .12s ease',
                  padding: 0,
                }}
              />
            ))}
            {/* Native Color Picker */}
            <label
              title="Custom Color Picker"
              style={{
                position: 'relative', width: 22, height: 22, borderRadius: '50%', overflow: 'hidden', cursor: 'pointer',
                border: '1.5px solid var(--line2)', display: 'grid', placeItems: 'center',
                background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
              }}
            >
              <input
                type="color"
                value={color}
                onChange={(e) => { setColor(e.target.value); if (tool === 'eraser') setTool('pen'); }}
                style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
              />
            </label>
          </div>

          {/* Stroke Widths & Settings */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Size Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'var(--card2)', padding: 2, borderRadius: 8 }}>
              {STROKE_SIZES.map((s) => (
                <button
                  key={s.name}
                  onClick={() => setSize(s.px)}
                  className="k-squish"
                  title={`${s.name} (${s.px}px)`}
                  style={{
                    height: 22,
                    padding: '0 6px',
                    borderRadius: 6,
                    border: 'none',
                    background: size === s.px ? 'var(--acc)' : 'transparent',
                    color: size === s.px ? 'var(--accTx, #FFFFFF)' : 'var(--tx3)',
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {s.px}px
                </button>
              ))}
            </div>

            {/* Fill Toggle */}
            <button
              onClick={() => setFillShape(!fillShape)}
              className="hov k-squish"
              title="Toggle Shape Fill"
              style={{
                height: 26,
                padding: '0 8px',
                borderRadius: 7,
                border: `1px solid ${fillShape ? 'var(--acc)' : 'var(--line2)'}`,
                background: fillShape ? 'color-mix(in srgb, var(--acc) 20%, var(--card2))' : 'var(--card2)',
                color: fillShape ? 'var(--accTx, #FFFFFF)' : 'var(--tx3)',
                fontSize: 10.5,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Icon name="grid" size={11} color={fillShape ? 'var(--accTx, #FFFFFF)' : 'var(--tx3)'} />
              Fill: {fillShape ? 'Solid' : 'Outline'}
            </button>

            {/* Background Style Switcher */}
            <select
              value={bgStyle}
              onChange={(e) => {
                const s = e.target.value as BgStyle;
                setBgStyle(s);
                const canvas = canvasRef.current;
                if (canvas) {
                  const ctx = canvas.getContext('2d');
                  if (ctx) drawBackground(ctx, canvas.clientWidth, canvas.clientHeight, s);
                }
              }}
              style={{
                height: 26,
                padding: '0 6px',
                borderRadius: 7,
                border: '1px solid var(--line2)',
                background: 'var(--card2)',
                color: 'var(--tx2)',
                fontSize: 10.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <option value="dark_grid">Dark Grid</option>
              <option value="light_paper">Light Paper</option>
              <option value="blueprint">Blueprint</option>
              <option value="dot_matrix">Dot Matrix</option>
              <option value="lined">Lined</option>
              <option value="solid_dark">Solid Charcoal</option>
              <option value="transparent">Transparent</option>
            </select>
          </div>
        </div>
      </div>

      {/* Canvas Area Container */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          flex: 1,
          minHeight: 0,
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px solid var(--line2)',
          boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.4)',
          cursor: tool === 'text' ? 'text' : 'crosshair',
          touchAction: 'none',
        }}
      >
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
        <canvas
          ref={overlayCanvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%' }}
        />

        {/* Text Annotation Input Box */}
        {textInput && (
          <div
            style={{
              position: 'absolute',
              left: textInput.x,
              top: textInput.y,
              zIndex: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'var(--panel)',
              padding: 4,
              borderRadius: 8,
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              border: '1px solid var(--acc)',
            }}
          >
            <input
              type="text"
              autoFocus
              value={textInput.text}
              placeholder="Type annotation..."
              onChange={(e) => setTextInput({ ...textInput, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitText();
                if (e.key === 'Escape') setTextInput(null);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color,
                fontSize: Math.max(14, size * 3.5),
                fontWeight: 700,
                minWidth: 160,
              }}
            />
            <button
              onClick={commitText}
              style={{
                background: 'var(--acc)',
                color: 'var(--accTx, #FFFFFF)',
                border: 'none',
                borderRadius: 6,
                padding: '3px 8px',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--tx3)' }}>
          {tool === 'text' ? 'Click canvas to type annotation.' : 'Draw freely with pencil, shapes, highlighter, and colors.'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={onClose}
            className="hov k-squish"
            style={{
              padding: '8px 16px',
              borderRadius: 10,
              border: '1px solid var(--line2)',
              background: 'var(--card2)',
              fontSize: 12.5,
              fontWeight: 700,
              color: 'var(--tx2)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSaveAndInsert}
            className="k-squish"
            style={{
              padding: '8px 20px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--acc, #7C6CFF)',
              color: 'var(--accTx, #FFFFFF)',
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 14px color-mix(in srgb, var(--acc) 40%, transparent)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name="check" size={14} color="var(--accTx, #FFFFFF)" />
            Insert Sketch into Note
          </button>
        </div>
      </div>
    </div>
  );
}
