'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Icon } from '../Icon';
import { playClick } from '@/lib/audio';
import type { FrameSnap, HeapObj, Local } from '@/lib/java';

interface Java3DVisualizerProps {
  frames: FrameSnap[];
  heap: HeapObj[];
  series: number[];
  activeLine: number | null;
  stepNote?: string;
  phone?: boolean;
}

type ViewAngle = 'isometric' | 'front' | 'top' | 'free';
type VisMode = 'auto' | 'arrays' | 'stack' | 'matrix';

export function Java3DVisualizer({
  frames,
  heap,
  series,
  activeLine,
  stepNote,
  phone = false,
}: Java3DVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [yaw, setYaw] = useState<number>(0.75); // ~43 degrees
  const [pitch, setPitch] = useState<number>(0.55); // ~31 degrees
  const [zoom, setZoom] = useState<number>(1.0);
  const [visMode, setVisMode] = useState<VisMode>('auto');
  const [viewAngle, setViewAngle] = useState<ViewAngle>('isometric');
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);

  // Set camera angle preset
  const setPresetAngle = (angle: ViewAngle) => {
    playClick();
    setViewAngle(angle);
    if (angle === 'isometric') {
      setYaw(0.75);
      setPitch(0.55);
      setZoom(1.0);
    } else if (angle === 'front') {
      setYaw(0);
      setPitch(0.05);
      setZoom(1.0);
    } else if (angle === 'top') {
      setYaw(0);
      setPitch(1.52); // ~87 degrees
      setZoom(0.9);
    }
  };

  // Mouse & Touch Orbit Controls
  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !lastMousePosRef.current) return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    setViewAngle('free');
    setYaw((y) => y + dx * 0.008);
    setPitch((p) => Math.max(0.05, Math.min(1.52, p - dy * 0.008)));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    lastMousePosRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.5, Math.min(2.5, z - e.deltaY * 0.0015)));
  };

  // Detect 2D matrix in heap
  const matrixObj = heap.find((h) => h.type.includes('[][]') || (h.type.includes('[]') && h.cells && h.cells.length >= 16));
  const hasArrays = heap.some((h) => h.type.includes('[]') || (h.cells && h.cells.length > 0)) || series.length > 0;
  const effectiveMode = visMode === 'auto'
    ? matrixObj ? 'matrix' : hasArrays ? 'arrays' : 'stack'
    : visMode;

  // 3D Canvas Rendering Loop
  const renderScene = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = (canvas.width = canvas.parentElement?.clientWidth || 600);
    const height = (canvas.height = canvas.parentElement?.clientHeight || 380);

    // Clear canvas with subtle ambient dark tone
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2 + 30;

    // 3D Isometric projection math helper
    const project = (x: number, y: number, z: number) => {
      // Rotate around Y axis (Yaw)
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const x1 = x * cosY - z * sinY;
      const z1 = x * sinY + z * cosY;

      // Rotate around X axis (Pitch)
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);
      const y2 = y * cosP - z1 * sinP;
      const z2 = y * sinP + z1 * cosP;

      // Scale with Zoom
      const scale = (320 / (z2 + 600)) * zoom;
      const screenX = cx + x1 * scale * 1.8;
      const screenY = cy - y2 * scale * 1.8;

      return { x: screenX, y: screenY, z: z2, scale };
    };

    // Draw 3D Grid Plane / Floor
    ctx.strokeStyle = 'rgba(124, 108, 255, 0.08)';
    ctx.lineWidth = 1;
    const gridSize = 160;
    const gridStep = 40;

    for (let gx = -gridSize; gx <= gridSize; gx += gridStep) {
      const p1 = project(gx, 0, -gridSize);
      const p2 = project(gx, 0, gridSize);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    for (let gz = -gridSize; gz <= gridSize; gz += gridStep) {
      const p1 = project(-gridSize, 0, gz);
      const p2 = project(gridSize, 0, gz);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // Helper: Draw a 3D Shaded Voxel Box
    const drawVoxel = (
      bx: number,
      by: number,
      bz: number,
      bw: number,
      bh: number,
      bd: number,
      topColor: string,
      frontColor: string,
      sideColor: string,
      label?: string,
      subLabel?: string
    ) => {
      // 8 corners of box
      const p000 = project(bx - bw / 2, by, bz - bd / 2);
      const p100 = project(bx + bw / 2, by, bz - bd / 2);
      const p110 = project(bx + bw / 2, by + bh, bz - bd / 2);
      const p010 = project(bx - bw / 2, by + bh, bz - bd / 2);

      const p001 = project(bx - bw / 2, by, bz + bd / 2);
      const p101 = project(bx + bw / 2, by, bz + bd / 2);
      const p111 = project(bx + bw / 2, by + bh, bz + bd / 2);
      const p011 = project(bx - bw / 2, by + bh, bz + bd / 2);

      // Draw Front Face
      ctx.fillStyle = frontColor;
      ctx.beginPath();
      ctx.moveTo(p001.x, p001.y);
      ctx.lineTo(p101.x, p101.y);
      ctx.lineTo(p111.x, p111.y);
      ctx.lineTo(p011.x, p011.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.stroke();

      // Draw Side Face (Right)
      ctx.fillStyle = sideColor;
      ctx.beginPath();
      ctx.moveTo(p101.x, p101.y);
      ctx.lineTo(p100.x, p100.y);
      ctx.lineTo(p110.x, p110.y);
      ctx.lineTo(p111.x, p111.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Draw Top Face
      ctx.fillStyle = topColor;
      ctx.beginPath();
      ctx.moveTo(p011.x, p011.y);
      ctx.lineTo(p111.x, p111.y);
      ctx.lineTo(p110.x, p110.y);
      ctx.lineTo(p010.x, p010.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Text Labels
      if (label && p011.scale > 0.3) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${Math.max(9, Math.round(11 * p011.scale))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(label, (p011.x + p111.x + p110.x + p010.x) / 4, (p011.y + p111.y + p110.y + p010.y) / 4 + 3);
      }

      if (subLabel && p001.scale > 0.3) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = `bold ${Math.max(8, Math.round(9 * p001.scale))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(subLabel, (p001.x + p101.x) / 2, p001.y + 12);
      }
    };

    // MODE 1: 3D Array / Voxel Column Bars
    if (effectiveMode === 'arrays') {
      const primaryArray = heap.find((h) => h.cells && h.cells.length > 0);
      const cells = primaryArray?.cells || (series.length ? series.map(String) : ['42', '17', '89', '5', '63', '28', '71', '12', '54', '33']);
      const count = Math.min(cells.length, 24);
      const barWidth = 22;
      const barDepth = 22;
      const spacing = 32;
      const totalWidth = count * spacing;
      const startX = -totalWidth / 2 + spacing / 2;

      const numValues = cells.map((c) => Number(c) || 10);
      const maxVal = Math.max(...numValues.map(Math.abs), 1);

      // Depth sort bars from back to front for proper occlusion
      const barIndices = Array.from({ length: count }, (_, i) => i);
      barIndices.sort((a, b) => {
        const za = (startX + a * spacing) * Math.sin(yaw);
        const zb = (startX + b * spacing) * Math.sin(yaw);
        return zb - za;
      });

      barIndices.forEach((i) => {
        const val = numValues[i];
        const rawText = cells[i];
        const h = Math.max(12, Math.min(120, (Math.abs(val) / maxVal) * 90));
        const x = startX + i * spacing;

        const isHighlight = i === 0 || i === count - 1;
        const top = isHighlight ? '#34D9A0' : '#7C6CFF';
        const front = isHighlight ? '#1EA675' : '#5748D6';
        const side = isHighlight ? '#147A55' : '#3E32A3';

        drawVoxel(x, 0, 0, barWidth, h, barDepth, top, front, side, rawText, `[${i}]`);
      });
    }

    // MODE 2: 3D Matrix / Topography Grid
    else if (effectiveMode === 'matrix') {
      const rows = 6;
      const cols = 6;
      const cellSize = 24;
      const gridTotal = rows * cellSize;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const dist = Math.abs(r - 2.5) + Math.abs(c - 2.5);
          const elev = Math.max(8, (6 - dist) * 14);
          const x = -gridTotal / 2 + c * cellSize + cellSize / 2;
          const z = -gridTotal / 2 + r * cellSize + cellSize / 2;

          const hueVal = Math.round(200 - (elev / 80) * 160);
          const top = `hsl(${hueVal}, 85%, 60%)`;
          const front = `hsl(${hueVal}, 80%, 42%)`;
          const side = `hsl(${hueVal}, 80%, 30%)`;

          drawVoxel(x, 0, z, cellSize - 3, elev, cellSize - 3, top, front, side, `${Math.round(elev / 8)}`);
        }
      }
    }

    // MODE 3: 3D Call Stack Towers & Frames
    else {
      const stackList = frames.length ? [...frames].reverse() : [
        { sig: 'main(String[] args)', locals: [{ type: 'int[]', name: 'arr', text: 'int[10]' }, { type: 'int', name: 'n', text: '10' }] },
        { sig: 'printArray(int[] arr)', locals: [{ type: 'int', name: 'i', text: '0' }] },
      ];

      const frameHeight = 28;
      const frameWidth = 140;
      const frameDepth = 90;

      stackList.forEach((f, idx) => {
        const y = idx * (frameHeight + 14);
        const isTop = idx === stackList.length - 1;
        const top = isTop ? '#FFC24B' : '#7C6CFF';
        const front = isTop ? '#D99B26' : '#5748D6';
        const side = isTop ? '#A87413' : '#3E32A3';

        drawVoxel(0, y, 0, frameWidth, frameHeight, frameDepth, top, front, side, f.sig.split('(')[0], `Frame ${idx + 1}`);

        // Draw local variable capsules beside frame
        f.locals.slice(0, 3).forEach((loc: { type: string; name: string; text: string }, lIdx: number) => {
          const lx = frameWidth / 2 + 45;
          const lz = -30 + lIdx * 28;
          drawVoxel(lx, y + 4, lz, 55, 16, 22, '#34D9A0', '#1EA675', '#147A55', `${loc.name}=${loc.text}`);

          // Pointer Ray linking frame to local variable
          const pStart = project(frameWidth / 2, y + 10, lz);
          const pEnd = project(lx - 25, y + 10, lz);
          ctx.strokeStyle = 'rgba(52, 217, 160, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(pStart.x, pStart.y);
          ctx.lineTo(pEnd.x, pEnd.y);
          ctx.stroke();
        });
      });
    }
  }, [yaw, pitch, zoom, effectiveMode, frames, heap, series]);

  useEffect(() => {
    let animId: number;
    const loop = () => {
      renderScene();
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [renderScene]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 280,
        background: 'radial-gradient(circle at 50% 40%, #161825 0%, #0E0F16 100%)',
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid var(--line2)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 3D Canvas Ground */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        style={{
          width: '100%',
          flex: 1,
          display: 'block',
          cursor: 'grab',
          touchAction: 'none',
        }}
      />

      {/* Top Floating Controls Bar */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 12,
          right: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pointerEvents: 'none',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        {/* Mode Selector Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            padding: 3,
            borderRadius: 8,
            background: 'rgba(17, 18, 26, 0.85)',
            border: '1px solid var(--line2)',
            backdropFilter: 'blur(8px)',
            pointerEvents: 'auto',
          }}
        >
          {(
            [
              ['auto', 'Auto View'],
              ['arrays', '3D Array'],
              ['matrix', '3D Terrain'],
              ['stack', '3D Stack'],
            ] as [VisMode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => {
                playClick();
                setVisMode(m);
              }}
              className="k-squish"
              style={{
                padding: '4px 9px',
                borderRadius: 6,
                fontSize: 10.5,
                fontWeight: 700,
                border: 'none',
                background: visMode === m ? 'var(--acc)' : 'transparent',
                color: visMode === m ? 'var(--ink)' : 'var(--tx2)',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Camera Angles & Zoom Controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: 3,
            borderRadius: 8,
            background: 'rgba(17, 18, 26, 0.85)',
            border: '1px solid var(--line2)',
            backdropFilter: 'blur(8px)',
            pointerEvents: 'auto',
          }}
        >
          {(
            [
              ['isometric', '3D Orbit'],
              ['front', 'Front'],
              ['top', 'Top'],
            ] as [ViewAngle, string][]
          ).map(([a, label]) => (
            <button
              key={a}
              onClick={() => setPresetAngle(a)}
              className="k-squish"
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 700,
                border: 'none',
                background: viewAngle === a ? 'color-mix(in srgb, var(--acc) 25%, transparent)' : 'transparent',
                color: viewAngle === a ? 'var(--accTx)' : 'var(--tx3)',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}

          {/* Zoom Buttons */}
          <button
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
            title="Zoom In"
            className="hov k-squish"
            style={{
              width: 24,
              height: 24,
              borderRadius: 5,
              display: 'grid',
              placeItems: 'center',
              background: 'transparent',
              border: 'none',
              color: 'var(--tx2)',
              cursor: 'pointer',
            }}
          >
            <Icon name="plus" size={11} color="var(--tx2)" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
            title="Zoom Out"
            className="hov k-squish"
            style={{
              width: 24,
              height: 24,
              borderRadius: 5,
              display: 'grid',
              placeItems: 'center',
              background: 'transparent',
              border: 'none',
              color: 'var(--tx2)',
              cursor: 'pointer',
            }}
          >
            <Icon name="minus" size={11} color="var(--tx2)" />
          </button>
        </div>
      </div>

      {/* Bottom Status Caption */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 12,
          right: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pointerEvents: 'none',
          fontSize: 10.5,
          color: 'var(--tx3)',
          fontFamily: 'monospace',
        }}
      >
        <span>Drag to rotate 3D view · Scroll to zoom</span>
        {activeLine && (
          <span style={{ color: 'var(--accTx)', fontWeight: 700 }}>
            Executing Line {activeLine}
          </span>
        )}
      </div>
    </div>
  );
}
