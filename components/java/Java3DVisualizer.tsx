'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Icon } from '../Icon';
import { playClick } from '@/lib/audio';
import type { FrameSnap, HeapObj } from '@/lib/java';

interface Java3DVisualizerProps {
  frames: FrameSnap[];
  heap: HeapObj[];
  series: number[];
  activeLine: number | null;
  stepNote?: string;
  phone?: boolean;
}

type ViewAngle = 'isometric' | 'front' | 'top' | 'free';
type VisMode = 'auto' | 'arrays' | 'tree' | 'matrix' | 'hanoi' | 'stack';

export function Java3DVisualizer({
  frames,
  heap,
  series,
  activeLine,
  stepNote,
  phone = false,
}: Java3DVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [yaw, setYaw] = useState<number>(0.75); // ~43 deg
  const [pitch, setPitch] = useState<number>(0.55); // ~31 deg
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
      setPitch(1.52);
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

  // Detect data structures to determine auto mode
  const matrixObj = heap.find(
    (h) => h.type.includes('[][]') || (h.type.includes('[]') && h.cells && h.cells.length >= 16)
  );
  const hasTreeNodes = heap.some(
    (h) => h.type.toLowerCase().includes('node') || h.type.toLowerCase().includes('tree')
  );
  const isHanoi = frames.some(
    (f) => f.sig.toLowerCase().includes('hanoi') || f.sig.toLowerCase().includes('solve')
  );
  const hasArrays =
    heap.some((h) => h.type.includes('[]') || (h.cells && h.cells.length > 0)) || series.length > 0;

  const effectiveMode =
    visMode === 'auto'
      ? matrixObj
        ? 'matrix'
        : hasTreeNodes
        ? 'tree'
        : isHanoi
        ? 'hanoi'
        : hasArrays
        ? 'arrays'
        : 'stack'
      : visMode;

  // 3D Canvas Rendering Loop
  const renderScene = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parent = canvas.parentElement;
    const clientW = parent?.clientWidth || 600;
    const clientH = parent?.clientHeight || 380;
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

    if (canvas.width !== clientW * dpr || canvas.height !== clientH * dpr) {
      canvas.width = clientW * dpr;
      canvas.height = clientH * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const width = clientW;
    const height = clientH;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2 + 25;

    // 3D Isometric projection math helper
    const project = (x: number, y: number, z: number) => {
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const x1 = x * cosY - z * sinY;
      const z1 = x * sinY + z * cosY;

      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);
      const y2 = y * cosP - z1 * sinP;
      const z2 = y * sinP + z1 * cosP;

      const scale = (340 / (z2 + 620)) * zoom;
      const screenX = cx + x1 * scale * 1.8;
      const screenY = cy - y2 * scale * 1.8;

      return { x: screenX, y: screenY, z: z2, scale };
    };

    // Draw 3D Floor Grid Plane
    ctx.strokeStyle = 'rgba(124, 108, 255, 0.09)';
    ctx.lineWidth = 1;
    const gridSize = 180;
    const gridStep = 36;

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
      subLabel?: string,
      highlight = false
    ) => {
      const p000 = project(bx - bw / 2, by, bz - bd / 2);
      const p100 = project(bx + bw / 2, by, bz - bd / 2);
      const p110 = project(bx + bw / 2, by + bh, bz - bd / 2);
      const p010 = project(bx - bw / 2, by + bh, bz - bd / 2);

      const p001 = project(bx - bw / 2, by, bz + bd / 2);
      const p101 = project(bx + bw / 2, by, bz + bd / 2);
      const p111 = project(bx + bw / 2, by + bh, bz + bd / 2);
      const p011 = project(bx - bw / 2, by + bh, bz + bd / 2);

      // Glow shadow if highlighted
      if (highlight) {
        ctx.save();
        ctx.shadowColor = topColor;
        ctx.shadowBlur = 16;
      }

      // Draw Front Face
      ctx.fillStyle = frontColor;
      ctx.beginPath();
      ctx.moveTo(p001.x, p001.y);
      ctx.lineTo(p101.x, p101.y);
      ctx.lineTo(p111.x, p111.y);
      ctx.lineTo(p011.x, p011.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
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

      if (highlight) {
        ctx.restore();
      }

      // Text Labels
      if (label && p011.scale > 0.3) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${Math.max(9, Math.round(11 * p011.scale))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(label, (p011.x + p111.x + p110.x + p010.x) / 4, (p011.y + p111.y + p110.y + p010.y) / 4 + 3);
      }

      if (subLabel && p001.scale > 0.3) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `bold ${Math.max(8, Math.round(9 * p001.scale))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(subLabel, (p001.x + p101.x) / 2, p001.y + 13);
      }
    };

    // Helper: Draw 3D Sphere Node
    const drawSphereNode = (
      sx: number,
      sy: number,
      sz: number,
      radius: number,
      fillColor: string,
      label: string,
      highlight = false
    ) => {
      const p = project(sx, sy, sz);
      const r = radius * p.scale * 1.8;

      ctx.save();
      if (highlight) {
        ctx.shadowColor = fillColor;
        ctx.shadowBlur = 18;
      }

      const grad = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r);
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.3, fillColor);
      grad.addColorStop(1, 'rgba(10, 12, 18, 0.9)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(4, r), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (label && p.scale > 0.3) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${Math.max(9, Math.round(11 * p.scale))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(label, p.x, p.y + 4);
      }
      ctx.restore();
    };

    // Helper: Draw 3D Cylinder / Peg
    const drawPeg = (px: number, py: number, pz: number, radius: number, height: number, color: string) => {
      const top = project(px, py + height, pz);
      const bot = project(px, py, pz);
      const r = radius * top.scale * 1.8;

      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(3, r * 2);
      ctx.beginPath();
      ctx.moveTo(bot.x, bot.y);
      ctx.lineTo(top.x, top.y);
      ctx.stroke();
    };

    // Helper: Draw 3D Line Connector
    const drawLine3D = (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      color: string,
      width = 2
    ) => {
      const p1 = project(x1, y1, z1);
      const p2 = project(x2, y2, z2);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    };

    // ==========================================
    // GRAPHIC MODE 1: 3D Array / Sorting Columns
    // ==========================================
    if (effectiveMode === 'arrays') {
      const primaryArray = heap.find((h) => h.cells && h.cells.length > 0);
      const cells =
        primaryArray?.cells ||
        (series.length ? series.map(String) : ['42', '17', '89', '5', '63', '28', '71', '12', '54', '33']);
      const count = Math.min(cells.length, 24);
      const barWidth = 22;
      const barDepth = 22;
      const spacing = 32;
      const totalWidth = count * spacing;
      const startX = -totalWidth / 2 + spacing / 2;

      const numValues = cells.map((c) => Number(c) || 10);
      const maxVal = Math.max(...numValues.map(Math.abs), 1);

      // Depth sort bars from back to front
      const barIndices = Array.from({ length: count }, (_, i) => i);
      barIndices.sort((a, b) => {
        const za = (startX + a * spacing) * Math.sin(yaw);
        const zb = (startX + b * spacing) * Math.sin(yaw);
        return zb - za;
      });

      barIndices.forEach((i) => {
        const val = numValues[i];
        const rawText = cells[i];
        const h = Math.max(14, Math.min(125, (Math.abs(val) / maxVal) * 95));
        const x = startX + i * spacing;

        const isHighlight = i === 0 || i === count - 1 || (activeLine && (activeLine % 2 === i % 2));
        const top = isHighlight ? '#34D9A0' : '#7C6CFF';
        const front = isHighlight ? '#1EA675' : '#5748D6';
        const side = isHighlight ? '#147A55' : '#3E32A3';

        drawVoxel(x, 0, 0, barWidth, h, barDepth, top, front, side, rawText, `[${i}]`, !!isHighlight);
      });

      // Draw Swap / Comparison Arc across active elements
      if (count >= 2) {
        const idxA = 0;
        const idxB = 1;
        const xA = startX + idxA * spacing;
        const xB = startX + idxB * spacing;
        const hA = Math.max(14, (Math.abs(numValues[idxA]) / maxVal) * 95);
        const hB = Math.max(14, (Math.abs(numValues[idxB]) / maxVal) * 95);

        const pA = project(xA, hA + 10, 0);
        const pB = project(xB, hB + 10, 0);
        const midP = project((xA + xB) / 2, Math.max(hA, hB) + 35, 0);

        ctx.strokeStyle = '#FFC24B';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.quadraticCurveTo(midP.x, midP.y, pB.x, pB.y);
        ctx.stroke();
      }
    }

    // ==========================================
    // GRAPHIC MODE 2: 3D Binary Tree & Orbital Graph
    // ==========================================
    else if (effectiveMode === 'tree') {
      const treeNodes = [
        { id: 0, val: '50', x: 0, y: 110, z: 0, left: 1, right: 2 },
        { id: 1, val: '30', x: -65, y: 65, z: -20, left: 3, right: 4 },
        { id: 2, val: '70', x: 65, y: 65, z: 20, left: 5, right: 6 },
        { id: 3, val: '20', x: -95, y: 18, z: -35 },
        { id: 4, val: '40', x: -35, y: 18, z: -10 },
        { id: 5, val: '60', x: 35, y: 18, z: 10 },
        { id: 6, val: '80', x: 95, y: 18, z: 35 },
      ];

      // Draw Tree Edges first
      treeNodes.forEach((node) => {
        if (node.left !== undefined) {
          const target = treeNodes[node.left];
          drawLine3D(node.x, node.y, node.z, target.x, target.y, target.z, 'rgba(124, 108, 255, 0.5)', 2);
        }
        if (node.right !== undefined) {
          const target = treeNodes[node.right];
          drawLine3D(node.x, node.y, node.z, target.x, target.y, target.z, 'rgba(124, 108, 255, 0.5)', 2);
        }
      });

      // Depth sort nodes
      const sortedTree = [...treeNodes].sort((a, b) => {
        const za = a.x * Math.sin(yaw) + a.z * Math.cos(yaw);
        const zb = b.x * Math.sin(yaw) + b.z * Math.cos(yaw);
        return zb - za;
      });

      sortedTree.forEach((node, i) => {
        const isRoot = node.id === 0;
        const color = isRoot ? '#FFC24B' : i % 2 === 0 ? '#34D9A0' : '#7C6CFF';
        drawSphereNode(node.x, node.y, node.z, 14, color, node.val, isRoot);
      });
    }

    // ==========================================
    // GRAPHIC MODE 3: 3D Topographic Terrain & Matrix
    // ==========================================
    else if (effectiveMode === 'matrix') {
      const rows = 6;
      const cols = 6;
      const cellSize = 25;
      const gridTotal = rows * cellSize;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const dist = Math.abs(r - 2.5) + Math.abs(c - 2.5);
          const elev = Math.max(8, (6 - dist) * 16);
          const x = -gridTotal / 2 + c * cellSize + cellSize / 2;
          const z = -gridTotal / 2 + r * cellSize + cellSize / 2;

          const hueVal = Math.round(210 - (elev / 90) * 160);
          const top = `hsl(${hueVal}, 85%, 60%)`;
          const front = `hsl(${hueVal}, 80%, 42%)`;
          const side = `hsl(${hueVal}, 80%, 30%)`;

          drawVoxel(x, 0, z, cellSize - 3, elev, cellSize - 3, top, front, side, `${Math.round(elev / 8)}`);
        }
      }
    }

    // ==========================================
    // GRAPHIC MODE 4: 3D Tower of Hanoi
    // ==========================================
    else if (effectiveMode === 'hanoi') {
      const pegSpacing = 85;
      const pegHeight = 110;
      const pegRadius = 3;

      // Base Platform
      drawVoxel(0, 0, 0, 240, 8, 70, '#36394A', '#232532', '#1A1C25', 'HANOI BASE');

      // 3 Pegs: A, B, C
      const pegs = [
        { label: 'Peg A', x: -pegSpacing },
        { label: 'Peg B', x: 0 },
        { label: 'Peg C', x: pegSpacing },
      ];

      pegs.forEach((peg) => {
        drawPeg(peg.x, 8, 0, pegRadius, pegHeight, 'rgba(255, 255, 255, 0.4)');
      });

      // Disks stacked on Pegs
      const disks = [
        { peg: 0, size: 54, h: 14, y: 8, color: '#FF6B6B', val: 'Disk 3' },
        { peg: 0, size: 40, h: 14, y: 24, color: '#FFC24B', val: 'Disk 2' },
        { peg: 0, size: 26, h: 14, y: 40, color: '#34D9A0', val: 'Disk 1' },
      ];

      disks.forEach((d) => {
        const px = pegs[d.peg].x;
        drawVoxel(px, d.y, 0, d.size, d.h, 28, d.color, d.color, 'rgba(0,0,0,0.35)', d.val, undefined, true);
      });
    }

    // ==========================================
    // GRAPHIC MODE 5: 3D Call Stack Towers
    // ==========================================
    else {
      const stackList = frames.length
        ? [...frames].reverse()
        : [
            {
              sig: 'main(String[] args)',
              locals: [
                { type: 'int[]', name: 'arr', text: 'int[10]' },
                { type: 'int', name: 'n', text: '10' },
              ],
            },
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
        f.locals.slice(0, 3).forEach((loc, lIdx) => {
          const lx = frameWidth / 2 + 45;
          const lz = -30 + lIdx * 28;
          drawVoxel(lx, y + 4, lz, 55, 16, 22, '#34D9A0', '#1EA675', '#147A55', `${loc.name}=${loc.text}`);

          // Pointer Ray
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

    ctx.restore();
  }, [yaw, pitch, zoom, effectiveMode, frames, heap, series, activeLine]);

  /**
   * Draw when something changed, not sixty times a second forever.
   *
   * This was a bare requestAnimationFrame loop calling renderScene() on every
   * frame for the life of the component, redrawing an identical static scene
   * — a full isometric reprojection of every frame, heap cell and series
   * point — at 60fps on a phone. It also depended on `renderScene`, whose
   * useCallback lists the `frames`/`heap`/`series` props, and those are new
   * identities on every render, so the effect tore down and re-registered
   * constantly on top of it.
   *
   * The loop existed for one real reason: renderScene re-measures its parent
   * each call, so polling was how a container resize got picked up. A
   * ResizeObserver reports that directly, which leaves the draw to run only
   * when its inputs actually change.
   */
  const renderRef = useRef(renderScene);
  useEffect(() => { renderRef.current = renderScene; });

  useEffect(() => { renderScene(); }, [renderScene]);

  useEffect(() => {
    const parent = canvasRef.current?.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(() => renderRef.current());
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 300,
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
            background: 'rgba(17, 18, 26, 0.88)',
            border: '1px solid var(--line2)',
            backdropFilter: 'blur(8px)',
            pointerEvents: 'auto',
          }}
        >
          {(
            [
              ['auto', 'Auto View'],
              ['arrays', '3D Array'],
              ['tree', '3D Tree'],
              ['matrix', '3D Terrain'],
              ['hanoi', '3D Hanoi'],
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
            background: 'rgba(17, 18, 26, 0.88)',
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
