'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Icon } from '../Icon';
import { playClick } from '@/lib/audio';
import { PAL } from '@/lib/pal';
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
export type VisMode = 'auto' | 'arrays' | 'tree' | 'matrix' | 'hanoi' | 'graph' | 'stack' | 'list';

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface ProjectedPoint {
  x: number;
  y: number;
  z: number;
  scale: number;
}

// Pseudo-random deterministic starfield dust in 3D space
const STARFIELD_PARTICLES: Point3D[] = Array.from({ length: 42 }, (_, i) => {
  const theta = (i * 2.39996) % (Math.PI * 2);
  const phi = ((i * 1.61803) % Math.PI) - Math.PI / 2;
  const rad = 130 + ((i * 37) % 110);
  return {
    x: Math.cos(phi) * Math.cos(theta) * rad,
    y: Math.sin(phi) * rad * 0.7 + 30,
    z: Math.cos(phi) * Math.sin(theta) * rad,
  };
});

export function Java3DVisualizer({
  frames,
  heap,
  series,
  activeLine,
  stepNote,
  phone = false,
}: Java3DVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [yaw, setYaw] = useState<number>(0.75); // ~43 deg
  const [pitch, setPitch] = useState<number>(0.55); // ~31 deg
  const [zoom, setZoom] = useState<number>(1.0);
  const [visMode, setVisMode] = useState<VisMode>('auto');
  const [viewAngle, setViewAngle] = useState<ViewAngle>('isometric');

  // Multi-touch & pointer gesture tracking
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchDistanceRef = useRef<number | null>(null);

  // Set camera preset angle
  const setPresetAngle = useCallback((angle: ViewAngle) => {
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
      setZoom(0.95);
    }
  }, []);

  const resetCamera = useCallback(() => {
    playClick();
    setViewAngle('isometric');
    setYaw(0.75);
    setPitch(0.55);
    setZoom(1.0);
  }, []);

  // Multi-Touch & Pointer Orbit / Pinch-Zoom Event Handlers
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      pinchDistanceRef.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const pointers = activePointersRef.current;
    if (!pointers.has(e.pointerId)) return;

    const prevPos = pointers.get(e.pointerId)!;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Two-finger pinch zoom
    if (pointers.size >= 2) {
      const pts = Array.from(pointers.values());
      const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchDistanceRef.current !== null && pinchDistanceRef.current > 0) {
        const deltaDist = currentDist - pinchDistanceRef.current;
        setZoom((z) => Math.max(0.4, Math.min(3.0, z + deltaDist * 0.005)));
      }
      pinchDistanceRef.current = currentDist;
      return;
    }

    // Single-finger / mouse orbit rotation
    if (pointers.size === 1) {
      const dx = e.clientX - prevPos.x;
      const dy = e.clientY - prevPos.y;
      setViewAngle('free');
      setYaw((y) => y + dx * 0.0075);
      setPitch((p) => Math.max(-0.1, Math.min(1.54, p - dy * 0.0075)));
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      pinchDistanceRef.current = null;
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.4, Math.min(3.0, z - e.deltaY * 0.0015)));
  }, []);

  // Intelligent Automatic Visualization Mode Detection
  const detectedMode = useMemo<VisMode>(() => {
    const isHanoiSignature = frames.some(
      (f) =>
        f.sig.toLowerCase().includes('hanoi') ||
        f.sig.toLowerCase().includes('solve') ||
        f.locals.some((l) => l.name === 'from' || l.name === 'aux')
    );
    if (isHanoiSignature) return 'hanoi';

    const hasGraph =
      heap.some((h) => h.name.toLowerCase().includes('adj') || h.name.toLowerCase().includes('graph')) ||
      frames.some((f) => f.sig.toLowerCase().includes('bfs') || f.sig.toLowerCase().includes('dfs'));
    if (hasGraph) return 'graph';

    const matrixObj = heap.find(
      (h) =>
        (h.type.includes('[][]') && !h.name.toLowerCase().includes('adj')) ||
        h.name.toLowerCase().includes('matrix') ||
        h.name.toLowerCase().includes('terrain') ||
        (h.type.includes('[]') && h.cells && h.cells.length >= 25 && !h.name.toLowerCase().includes('adj'))
    );
    if (matrixObj) return 'matrix';

    const hasTreeNodes =
      heap.some(
        (h) =>
          (h.type.toLowerCase().includes('node') && !h.type.toLowerCase().includes('listnode') && !h.name.toLowerCase().includes('head')) ||
          h.type.toLowerCase().includes('tree') ||
          h.name.toLowerCase().includes('root') ||
          h.name.toLowerCase().includes('bst')
      ) ||
      frames.some((f) => f.sig.toLowerCase().includes('tree') || f.sig.toLowerCase().includes('inorder'));
    if (hasTreeNodes) return 'tree';

    const hasLinkedList = heap.some(
      (h) =>
        h.type.toLowerCase().includes('listnode') ||
        h.name.toLowerCase().includes('list') ||
        h.name.toLowerCase().includes('head')
    );
    if (hasLinkedList) return 'list';

    const hasArrays =
      heap.some((h) => h.type.includes('[]') || (h.cells && h.cells.length > 0)) || series.length > 0;
    if (hasArrays) return 'arrays';

    return 'stack';
  }, [frames, heap, series]);

  const effectiveMode = visMode === 'auto' ? detectedMode : visMode;

  // 3D Canvas Rendering Engine
  const renderScene = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parent = canvas.parentElement;
    const clientW = parent?.clientWidth || 600;
    const clientH = parent?.clientHeight || 380;
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1;

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
    const cy = height / 2 + 20;

    // 3D Projection Math Matrix Helper
    const project = (x: number, y: number, z: number): ProjectedPoint => {
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const x1 = x * cosY - z * sinY;
      const z1 = x * sinY + z * cosY;

      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);
      const y2 = y * cosP - z1 * sinP;
      const z2 = y * sinP + z1 * cosP;

      const cameraDistance = 640;
      const scale = (370 / (z2 + cameraDistance)) * zoom;
      const screenX = cx + x1 * scale * 1.8;
      const screenY = cy - y2 * scale * 1.8;

      return { x: screenX, y: screenY, z: z2, scale };
    };

    // ==========================================
    // 3D Starfield / Cyberspace Ambient Particles
    // ==========================================
    STARFIELD_PARTICLES.forEach((p, idx) => {
      const proj = project(p.x, p.y, p.z);
      if (proj.scale > 0.1) {
        const rad = Math.max(0.7, 1.4 * proj.scale);
        const alpha = Math.min(0.55, Math.max(0.12, 0.35 + 0.2 * Math.sin(idx + yaw)));
        ctx.fillStyle = idx % 2 === 0 ? `rgba(124, 140, 255, ${alpha})` : `rgba(56, 189, 248, ${alpha})`;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // ==========================================
    // 3D Ground Grid with Radial Atmospheric Fade
    // ==========================================
    const gridSize = 210;
    const gridStep = 35;

    // Ground Radial Concentric Rings
    [60, 120, 180].forEach((r) => {
      ctx.strokeStyle = 'rgba(124, 108, 255, 0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const segs = 28;
      for (let s = 0; s <= segs; s++) {
        const ang = (s / segs) * Math.PI * 2;
        const pt = project(Math.cos(ang) * r, 0, Math.sin(ang) * r);
        if (s === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    });

    // Ground Linear Grid Lines with Distance Fade
    for (let gx = -gridSize; gx <= gridSize; gx += gridStep) {
      const p1 = project(gx, 0, -gridSize);
      const p2 = project(gx, 0, gridSize);
      const distRatio = Math.abs(gx) / gridSize;
      const alpha = Math.max(0.015, 0.09 * (1 - distRatio));

      ctx.strokeStyle = `rgba(124, 108, 255, ${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    for (let gz = -gridSize; gz <= gridSize; gz += gridStep) {
      const p1 = project(-gridSize, 0, gz);
      const p2 = project(gridSize, 0, gz);
      const distRatio = Math.abs(gz) / gridSize;
      const alpha = Math.max(0.015, 0.09 * (1 - distRatio));

      ctx.strokeStyle = `rgba(124, 108, 255, ${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // ==========================================
    // Core 3D Geometry Rendering Primitives
    // ==========================================

    // Helper: Draw Ground Drop Shadow under 3D Object
    const drawGroundShadow = (sx: number, sz: number, radX: number, radZ: number, alpha = 0.35) => {
      const p = project(sx, 0, sz);
      const rx = radX * p.scale * 1.8;
      const rz = radZ * p.scale * 1.8 * Math.cos(pitch);
      if (rx <= 1 || rz <= 1) return;

      ctx.save();
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rx);
      grad.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
      grad.addColorStop(0.6, `rgba(0, 0, 0, ${alpha * 0.4})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx, Math.max(1.5, rz), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    // Helper: Draw Volumetric 3D Shaded Voxel Block
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
      opts?: {
        label?: string;
        subLabel?: string;
        highlight?: boolean;
        highlightColor?: string;
        badge?: string;
        badgeColor?: string;
        isSorted?: boolean;
        opacity?: number;
      }
    ) => {
      const highlight = opts?.highlight ?? false;
      const highlightColor = opts?.highlightColor ?? topColor;
      const opacity = opts?.opacity ?? 1.0;

      // Draw Floor Contact Shadow
      if (by <= 4) {
        drawGroundShadow(bx, bz, bw * 0.8, bd * 0.8, 0.45);
      }

      const p000 = project(bx - bw / 2, by, bz - bd / 2);
      const p100 = project(bx + bw / 2, by, bz - bd / 2);
      const p110 = project(bx + bw / 2, by + bh, bz - bd / 2);
      const p010 = project(bx - bw / 2, by + bh, bz - bd / 2);

      const p001 = project(bx - bw / 2, by, bz + bd / 2);
      const p101 = project(bx + bw / 2, by, bz + bd / 2);
      const p111 = project(bx + bw / 2, by + bh, bz + bd / 2);
      const p011 = project(bx - bw / 2, by + bh, bz + bd / 2);

      ctx.save();
      ctx.globalAlpha = opacity;

      // Glow Aura if Active
      if (highlight) {
        ctx.shadowColor = highlightColor;
        ctx.shadowBlur = 18;
      }

      // Draw Front Face (+Z)
      const frontGrad = ctx.createLinearGradient(p011.x, p011.y, p001.x, p001.y);
      frontGrad.addColorStop(0, frontColor);
      frontGrad.addColorStop(1, 'rgba(12, 14, 22, 0.95)');
      ctx.fillStyle = frontGrad;
      ctx.beginPath();
      ctx.moveTo(p001.x, p001.y);
      ctx.lineTo(p101.x, p101.y);
      ctx.lineTo(p111.x, p111.y);
      ctx.lineTo(p011.x, p011.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = highlight ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw Right Side Face (+X)
      const sideGrad = ctx.createLinearGradient(p111.x, p111.y, p100.x, p100.y);
      sideGrad.addColorStop(0, sideColor);
      sideGrad.addColorStop(1, 'rgba(8, 10, 16, 0.95)');
      ctx.fillStyle = sideGrad;
      ctx.beginPath();
      ctx.moveTo(p101.x, p101.y);
      ctx.lineTo(p100.x, p100.y);
      ctx.lineTo(p110.x, p110.y);
      ctx.lineTo(p111.x, p111.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Draw Top Face (+Y) with Ambient Highlight
      const topGrad = ctx.createLinearGradient(p010.x, p010.y, p111.x, p111.y);
      topGrad.addColorStop(0, topColor);
      topGrad.addColorStop(1, frontColor);
      ctx.fillStyle = topGrad;
      ctx.beginPath();
      ctx.moveTo(p011.x, p011.y);
      ctx.lineTo(p111.x, p111.y);
      ctx.lineTo(p110.x, p110.y);
      ctx.lineTo(p010.x, p010.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = highlight ? '#FFFFFF' : 'rgba(255,255,255,0.3)';
      ctx.stroke();

      ctx.restore();

      const topCenterX = (p011.x + p111.x + p110.x + p010.x) / 4;
      const topCenterY = (p011.y + p111.y + p110.y + p010.y) / 4;

      // Top Value Label
      if (opts?.label && p011.scale > 0.28) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${Math.max(9, Math.round(11 * p011.scale))}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 4;
        ctx.fillText(opts.label, topCenterX, topCenterY);
        ctx.shadowBlur = 0;
      }

      // Sorted Element Check Indicator
      if (opts?.isSorted && p011.scale > 0.3) {
        ctx.fillStyle = PAL.mint;
        ctx.font = `bold ${Math.max(8, Math.round(9 * p011.scale))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('✓', topCenterX, topCenterY - 12 * p011.scale);
      }

      // Sub-Label / Array Index Tag [i] on Base
      if (opts?.subLabel && p001.scale > 0.28) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.font = `bold ${Math.max(8, Math.round(9.5 * p001.scale))}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(opts.subLabel, (p001.x + p101.x) / 2, p001.y + 7);
      }

      // Floating Badge Indicator (e.g. [LOW], [MID], [HIGH], [TARGET])
      if (opts?.badge && p011.scale > 0.28) {
        const badgeY = topCenterY - 20 * p011.scale;
        const badgeText = opts.badge;
        ctx.font = `bold ${Math.max(7.5, Math.round(8.5 * p011.scale))}px monospace`;
        const textMetrics = ctx.measureText(badgeText);
        const badgeW = textMetrics.width + 10;
        const badgeH = 14 * p011.scale;

        // Pointer Line
        ctx.strokeStyle = opts.badgeColor || PAL.amber;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(topCenterX, topCenterY);
        ctx.lineTo(topCenterX, badgeY + badgeH / 2);
        ctx.stroke();

        // Badge Pill
        ctx.fillStyle = 'rgba(15, 17, 26, 0.92)';
        ctx.strokeStyle = opts.badgeColor || PAL.amber;
        ctx.beginPath();
        ctx.roundRect(topCenterX - badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = opts.badgeColor || PAL.amber;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, topCenterX, badgeY);
      }
    };

    // Helper: Draw 3D Spherical Node with Specular Highlight
    const drawSphereNode = (
      sx: number,
      sy: number,
      sz: number,
      radius: number,
      fillColor: string,
      label: string,
      opts?: { highlight?: boolean; pulse?: boolean; subText?: string }
    ) => {
      const p = project(sx, sy, sz);
      const r = radius * p.scale * 1.8;
      if (r <= 1) return;

      // Contact Ground Shadow
      drawGroundShadow(sx, sz, radius * 1.1, radius * 1.1, 0.35);

      ctx.save();
      if (opts?.highlight) {
        ctx.shadowColor = fillColor;
        ctx.shadowBlur = 22;

        // Outer Aura Ring
        ctx.strokeStyle = fillColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 1.35, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Radial Specular 3D Gradient
      const grad = ctx.createRadialGradient(p.x - r * 0.32, p.y - r * 0.32, r * 0.08, p.x, p.y, r);
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.25, fillColor);
      grad.addColorStop(0.75, fillColor);
      grad.addColorStop(1, 'rgba(8, 10, 16, 0.95)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(3, r), 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // Node Value Text
      if (label && p.scale > 0.28) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${Math.max(9, Math.round(11 * p.scale))}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 4;
        ctx.fillText(label, p.x, p.y);
        ctx.shadowBlur = 0;
      }

      // Sub-label below Node
      if (opts?.subText && p.scale > 0.28) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = `bold ${Math.max(7.5, Math.round(9 * p.scale))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(opts.subText, p.x, p.y + r + 10);
      }
    };

    // Helper: Draw 3D Cylinder / Hanoi Peg
    const drawPeg = (px: number, py: number, pz: number, radius: number, height: number, label: string) => {
      const top = project(px, py + height, pz);
      const bot = project(px, py, pz);
      const r = radius * top.scale * 1.8;

      // Base Peg Footing Ring
      drawGroundShadow(px, pz, radius * 2.5, radius * 2.5, 0.4);

      // Peg Shaft Gradient
      ctx.save();
      const shaftGrad = ctx.createLinearGradient(bot.x - r, bot.y, bot.x + r, bot.y);
      shaftGrad.addColorStop(0, 'rgba(160, 175, 200, 0.8)');
      shaftGrad.addColorStop(0.4, '#FFFFFF');
      shaftGrad.addColorStop(1, 'rgba(80, 90, 110, 0.9)');

      ctx.strokeStyle = shaftGrad;
      ctx.lineWidth = Math.max(3, r * 2);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bot.x, bot.y);
      ctx.lineTo(top.x, top.y);
      ctx.stroke();
      ctx.restore();

      // Peg Base Label
      if (bot.scale > 0.3) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = `bold ${Math.max(9, Math.round(10.5 * bot.scale))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(label, bot.x, bot.y + 16);
      }
    };

    // Helper: Draw 3D Curved / Laser Pointer Ray
    const drawPointerRay = (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      color: string,
      label?: string,
      dashed = false
    ) => {
      const p1 = project(x1, y1, z1);
      const p2 = project(x2, y2, z2);
      const mid = project((x1 + x2) / 2, Math.max(y1, y2) + 20, (z1 + z2) / 2);

      ctx.save();
      if (dashed) ctx.setLineDash([4, 4]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.quadraticCurveTo(mid.x, mid.y, p2.x, p2.y);
      ctx.stroke();

      // Arrowhead at destination
      const ang = Math.atan2(p2.y - mid.y, p2.x - mid.x);
      const arrLen = 7;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(p2.x - arrLen * Math.cos(ang - Math.PI / 6), p2.y - arrLen * Math.sin(ang - Math.PI / 6));
      ctx.lineTo(p2.x - arrLen * Math.cos(ang + Math.PI / 6), p2.y - arrLen * Math.sin(ang + Math.PI / 6));
      ctx.closePath();
      ctx.fill();

      if (label && p1.scale > 0.3) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${Math.max(8, Math.round(9.5 * p1.scale))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(label, mid.x, mid.y - 6);
      }
      ctx.restore();
    };

    // =========================================================================
    // VISUALIZATION MODE 1: 3D Arrays & Dynamic Sorting Visualizer
    // =========================================================================
    if (effectiveMode === 'arrays') {
      const primaryArray = heap.find((h) => h.cells && h.cells.length > 0);
      const cells =
        primaryArray?.cells ||
        (series.length
          ? series.map(String)
          : ['42', '17', '89', '5', '63', '28', '71', '12', '54', '33']);

      const count = Math.min(cells.length, 24);
      const barWidth = 22;
      const barDepth = 22;
      const spacing = 32;
      const totalWidth = count * spacing;
      const startX = -totalWidth / 2 + spacing / 2;

      const numValues = cells.map((c) => Number(c) || 10);
      const maxVal = Math.max(...numValues.map(Math.abs), 1);

      // Extract Active Loop Variables from Current Call Frame
      const currentLocals = frames[frames.length - 1]?.locals || [];
      const getLocalNum = (names: string[]) => {
        const found = currentLocals.find((l) => names.includes(l.name));
        return found ? Number(found.value?.v ?? found.text) : null;
      };

      const varI = getLocalNum(['i', 'outer', 'index', 'idx']);
      const varJ = getLocalNum(['j', 'inner']);
      const varLow = getLocalNum(['low', 'l', 'left']);
      const varHigh = getLocalNum(['high', 'h', 'right']);
      const varMid = getLocalNum(['mid', 'm']);
      const varTarget = getLocalNum(['target', 'val', 'key']);

      // Depth Sort Bars Back-to-Front
      const barIndices = Array.from({ length: count }, (_, i) => i);
      barIndices.sort((a, b) => {
        const za = (startX + a * spacing) * Math.sin(yaw);
        const zb = (startX + b * spacing) * Math.sin(yaw);
        return zb - za;
      });

      barIndices.forEach((i) => {
        const val = numValues[i];
        const rawText = cells[i];
        const h = Math.max(14, Math.min(130, (Math.abs(val) / maxVal) * 98));
        const x = startX + i * spacing;

        let isComparing = false;
        let isSorted = false;
        let badge: string | undefined;
        let badgeColor: string = PAL.amber;

        // Binary Search Pointers Detection
        if (varLow !== null && i === varLow) {
          badge = 'LOW';
          badgeColor = PAL.sky;
        } else if (varHigh !== null && i === varHigh) {
          badge = 'HIGH';
          badgeColor = PAL.coral;
        } else if (varMid !== null && i === varMid) {
          badge = 'MID';
          badgeColor = PAL.amber;
          isComparing = true;
        }

        // Sorting Loop Variables Detection
        if (varJ !== null && (i === varJ || i === varJ + 1)) {
          isComparing = true;
          badge = i === varJ ? `j=${i}` : `j+1`;
          badgeColor = PAL.amber;
        } else if (varI !== null && i === varI && !badge) {
          badge = `i=${i}`;
          badgeColor = PAL.mint;
        }

        // Bubble Sort in-place sorted items detection
        if (varI !== null && i >= count - varI && count > 3) {
          isSorted = true;
        }

        // Dim elements outside search window [low, high]
        const isOutsideSearch =
          varLow !== null && varHigh !== null && (i < varLow || i > varHigh);
        const opacity = isOutsideSearch ? 0.3 : 1.0;

        let top: string = '#7C6CFF';
        let front: string = '#5748D6';
        let side: string = '#3E32A3';

        if (isSorted) {
          top = PAL.mint;
          front = '#1EA675';
          side = '#147A55';
        } else if (isComparing) {
          top = PAL.amber;
          front = '#D99B26';
          side = '#A87413';
        } else if (varTarget !== null && val === varTarget) {
          top = PAL.coral;
          front = '#E04F4F';
          side = '#A63232';
        }

        drawVoxel(x, 0, 0, barWidth, h, barDepth, top, front, side, {
          label: rawText,
          subLabel: `[${i}]`,
          highlight: isComparing || (varTarget !== null && val === varTarget),
          highlightColor: top,
          badge,
          badgeColor,
          isSorted,
          opacity,
        });
      });

      // Draw Dynamic 3D Parabolic Swap / Comparison Arc
      if (varJ !== null && varJ >= 0 && varJ < count - 1) {
        const idxA = varJ;
        const idxB = varJ + 1;
        const xA = startX + idxA * spacing;
        const xB = startX + idxB * spacing;
        const hA = Math.max(14, (Math.abs(numValues[idxA]) / maxVal) * 98);
        const hB = Math.max(14, (Math.abs(numValues[idxB]) / maxVal) * 98);

        const pA = project(xA, hA + 8, 0);
        const pB = project(xB, hB + 8, 0);
        const midP = project((xA + xB) / 2, Math.max(hA, hB) + 38, 0);

        ctx.save();
        ctx.strokeStyle = PAL.amber;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = PAL.amber;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.quadraticCurveTo(midP.x, midP.y, pB.x, pB.y);
        ctx.stroke();

        // Floating compare swap tag
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('COMPARE', midP.x, midP.y - 6);
        ctx.restore();
      }
    }

    // =========================================================================
    // VISUALIZATION MODE 2: 3D Binary Tree & Hierarchical Graph
    // =========================================================================
    else if (effectiveMode === 'tree') {
      const treeNodes = [
        { id: 0, val: '50', x: 0, y: 115, z: 0, left: 1, right: 2, level: 0 },
        { id: 1, val: '30', x: -75, y: 65, z: -25, left: 3, right: 4, level: 1 },
        { id: 2, val: '70', x: 75, y: 65, z: 25, left: 5, right: 6, level: 1 },
        { id: 3, val: '20', x: -110, y: 16, z: -40, level: 2 },
        { id: 4, val: '40', x: -40, y: 16, z: -10, level: 2 },
        { id: 5, val: '60', x: 40, y: 16, z: 10, level: 2 },
        { id: 6, val: '80', x: 110, y: 16, z: 40, level: 2 },
      ];

      // Extract Active Visited Node from Step Note / Frames
      const noteText = (stepNote || '').toLowerCase();
      let activeVal = '';
      const visitedMatch = stepNote?.match(/Visited\s+Node:\s*(\w+)/i) || stepNote?.match(/val\s*=\s*(\w+)/i);
      if (visitedMatch) activeVal = visitedMatch[1];

      // Draw Tree Level Horizon Rings
      [115, 65, 16].forEach((ly, lIdx) => {
        ctx.strokeStyle = 'rgba(124, 108, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const rad = 40 + lIdx * 45;
        for (let s = 0; s <= 24; s++) {
          const a = (s / 24) * Math.PI * 2;
          const pt = project(Math.cos(a) * rad, ly, Math.sin(a) * rad);
          if (s === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
      });

      // Draw 3D Tree Curved Connector Branches
      treeNodes.forEach((node) => {
        if (node.left !== undefined) {
          const target = treeNodes[node.left];
          drawPointerRay(node.x, node.y, node.z, target.x, target.y, target.z, 'rgba(124, 108, 255, 0.65)');
        }
        if (node.right !== undefined) {
          const target = treeNodes[node.right];
          drawPointerRay(node.x, node.y, node.z, target.x, target.y, target.z, 'rgba(124, 108, 255, 0.65)');
        }
      });

      // Depth Sort Tree Nodes Back-to-Front
      const sortedTree = [...treeNodes].sort((a, b) => {
        const za = a.x * Math.sin(yaw) + a.z * Math.cos(yaw);
        const zb = b.x * Math.sin(yaw) + b.z * Math.cos(yaw);
        return zb - za;
      });

      sortedTree.forEach((node) => {
        const isRoot = node.id === 0;
        const isTraversed = activeVal === node.val || (noteText.includes(node.val) && activeVal !== '');
        let color: string = isRoot ? PAL.amber : node.level === 1 ? PAL.mint : PAL.indigo;
        if (isTraversed) color = PAL.coral;

        drawSphereNode(node.x, node.y, node.z, 15, color, node.val, {
          highlight: isTraversed || isRoot,
          subText: isRoot ? 'ROOT' : undefined,
        });
      });
    }

    // =========================================================================
    // VISUALIZATION MODE 3: 3D Topographic Terrain & Matrix Heightmap
    // =========================================================================
    else if (effectiveMode === 'matrix') {
      const rows = 6;
      const cols = 6;
      const cellSize = 26;
      const gridTotal = rows * cellSize;

      const currentLocals = frames[frames.length - 1]?.locals || [];
      const getLocalVal = (name: string) => {
        const found = currentLocals.find((l) => l.name === name);
        return found ? Number(found.value?.v ?? found.text) : null;
      };

      const activeR = getLocalVal('r') ?? getLocalVal('row');
      const activeC = getLocalVal('c') ?? getLocalVal('col');

      // Generate Elevation Matrix Cells
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const dist = Math.abs(r - 2.5) + Math.abs(c - 2.5);
          const elev = Math.max(10, Math.round((6.5 - dist) * 17));
          const x = -gridTotal / 2 + c * cellSize + cellSize / 2;
          const z = -gridTotal / 2 + r * cellSize + cellSize / 2;

          const isActiveCell = activeR === r && activeC === c;

          // Multi-stage Elevation Color Gradient Ramp:
          // Blue Ocean (Low) -> Emerald (Mid) -> Amber (High) -> Snow Peak (Top)
          let top: string = PAL.sky;
          let front: string = '#1E3A8A';
          let side: string = '#172554';

          if (elev > 75) {
            top = '#FFFFFF';
            front = '#E2E8F0';
            side = '#94A3B8';
          } else if (elev > 55) {
            top = PAL.amber;
            front = '#D97706';
            side = '#92400E';
          } else if (elev > 35) {
            top = PAL.mint;
            front = '#059669';
            side = '#065F46';
          }

          if (isActiveCell) {
            top = PAL.coral;
            front = '#DC2626';
            side = '#991B1B';
          }

          drawVoxel(x, 0, z, cellSize - 3, elev, cellSize - 3, top, front, side, {
            label: `${Math.round(elev / 8)}`,
            subLabel: isActiveCell ? `[${r},${c}]` : undefined,
            highlight: isActiveCell,
            highlightColor: top,
          });

          // Active Laser Beacon Rising from Active Cell
          if (isActiveCell) {
            const pTop = project(x, elev, z);
            const pSky = project(x, elev + 45, z);
            ctx.save();
            ctx.strokeStyle = PAL.coral;
            ctx.lineWidth = 2;
            ctx.shadowColor = PAL.coral;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.moveTo(pTop.x, pTop.y);
            ctx.lineTo(pSky.x, pSky.y);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    }

    // =========================================================================
    // VISUALIZATION MODE 4: 3D Tower of Hanoi Physical Simulation
    // =========================================================================
    else if (effectiveMode === 'hanoi') {
      const pegSpacing = 85;
      const pegHeight = 115;
      const pegRadius = 3;

      // Heavy Chamfered Base Platform
      drawVoxel(0, 0, 0, 245, 9, 85, '#2A2D3D', '#1B1D28', '#14151E', {
        label: 'TOWER OF HANOI BASE',
      });

      // 3 Metallic Pegs
      const pegs = [
        { label: 'Peg A', x: -pegSpacing },
        { label: 'Peg B', x: 0 },
        { label: 'Peg C', x: pegSpacing },
      ];

      pegs.forEach((peg) => {
        drawPeg(peg.x, 9, 0, pegRadius, pegHeight, peg.label);
      });

      // Parse Active Move from Step Note / Frames
      let movingDisk = 0;
      let fromPeg = 0;
      let toPeg = 2;

      const moveMatch = stepNote?.match(/Move\s+disk\s+(\d+)\s+from\s+([A-C])\s*->\s*([A-C])/i);
      if (moveMatch) {
        movingDisk = parseInt(moveMatch[1], 10);
        fromPeg = moveMatch[2] === 'A' ? 0 : moveMatch[2] === 'B' ? 1 : 2;
        toPeg = moveMatch[3] === 'A' ? 0 : moveMatch[3] === 'B' ? 1 : 2;
      }

      // Hanoi Disks Graduated Sizes & Colors
      const diskSpecs = [
        { id: 3, size: 58, h: 14, color: PAL.coral, label: 'Disk 3' },
        { id: 2, size: 42, h: 14, color: PAL.amber, label: 'Disk 2' },
        { id: 1, size: 26, h: 14, color: PAL.mint, label: 'Disk 1' },
      ];

      // Peg State Stacks Simulation
      const pegStacks: number[][] = [[3, 2, 1], [], []];
      if (movingDisk > 0) {
        pegStacks[fromPeg] = pegStacks[fromPeg].filter((d) => d !== movingDisk);
        // Active in-flight parabolic arc trajectory
        const startX = pegs[fromPeg].x;
        const endX = pegs[toPeg].x;
        const pArcStart = project(startX, 65, 0);
        const pArcEnd = project(endX, 65, 0);
        const pArcPeak = project((startX + endX) / 2, pegHeight + 25, 0);

        ctx.save();
        ctx.strokeStyle = PAL.amber;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(pArcStart.x, pArcStart.y);
        ctx.quadraticCurveTo(pArcPeak.x, pArcPeak.y, pArcEnd.x, pArcEnd.y);
        ctx.stroke();
        ctx.restore();

        // Render In-Flight Suspended Disk
        const flyingSpec = diskSpecs.find((d) => d.id === movingDisk);
        if (flyingSpec) {
          drawVoxel(
            (startX + endX) / 2,
            pegHeight + 15,
            0,
            flyingSpec.size,
            flyingSpec.h,
            30,
            flyingSpec.color,
            flyingSpec.color,
            'rgba(0,0,0,0.4)',
            {
              label: flyingSpec.label,
              highlight: true,
              highlightColor: flyingSpec.color,
              badge: `Moving -> ${pegs[toPeg].label}`,
              badgeColor: flyingSpec.color,
            }
          );
        }
      }

      // Render Static Disks on Pegs
      pegStacks.forEach((stack, pIdx) => {
        let currentY = 9;
        stack.forEach((diskId) => {
          const spec = diskSpecs.find((d) => d.id === diskId);
          if (spec) {
            const px = pegs[pIdx].x;
            drawVoxel(px, currentY, 0, spec.size, spec.h, 30, spec.color, spec.color, 'rgba(0,0,0,0.35)', {
              label: spec.label,
              highlight: false,
            });
            currentY += spec.h + 2;
          }
        });
      });
    }

    // =========================================================================
    // VISUALIZATION MODE 5: 3D Orbital Graph & BFS Network
    // =========================================================================
    else if (effectiveMode === 'graph') {
      const nodeCount = 6;
      const radius = 95;

      const graphNodes = Array.from({ length: nodeCount }, (_, i) => {
        const angle = (i / nodeCount) * Math.PI * 2;
        const yOffset = Math.sin(i * 1.5) * 25 + 50;
        return {
          id: i,
          val: `${i}`,
          x: Math.cos(angle) * radius,
          y: yOffset,
          z: Math.sin(angle) * radius,
        };
      });

      const edges = [
        [0, 1],
        [0, 2],
        [1, 3],
        [1, 4],
        [2, 4],
        [2, 5],
        [3, 5],
      ];

      // Extract Active Visited Node from Locals
      const currentLocals = frames[frames.length - 1]?.locals || [];
      const activeNodeVal = currentLocals.find((l) => l.name === 'i' || l.name === 'u')?.text;
      const activeNodeIdx = activeNodeVal ? parseInt(activeNodeVal, 10) : 0;

      // Draw Glowing Directed Edges
      edges.forEach(([u, v]) => {
        const nU = graphNodes[u];
        const nV = graphNodes[v];
        const isTraversing = (u === activeNodeIdx || v === activeNodeIdx);
        drawPointerRay(
          nU.x,
          nU.y,
          nU.z,
          nV.x,
          nV.y,
          nV.z,
          isTraversing ? PAL.amber : 'rgba(124, 108, 255, 0.55)',
          undefined,
          !isTraversing
        );
      });

      // Depth Sort Graph Nodes
      const sortedGraph = [...graphNodes].sort((a, b) => {
        const za = a.x * Math.sin(yaw) + a.z * Math.cos(yaw);
        const zb = b.x * Math.sin(yaw) + b.z * Math.cos(yaw);
        return zb - za;
      });

      sortedGraph.forEach((node) => {
        const isActive = node.id === activeNodeIdx;
        const isVisited = node.id <= activeNodeIdx;
        const color = isActive ? PAL.amber : isVisited ? PAL.mint : PAL.indigo;

        drawSphereNode(node.x, node.y, node.z, 14, color, `N${node.id}`, {
          highlight: isActive,
          subText: isActive ? 'ACTIVE' : isVisited ? 'VISITED' : undefined,
        });
      });
    }

    // =========================================================================
    // VISUALIZATION MODE 6: 3D Linked List Node Chain
    // =========================================================================
    else if (effectiveMode === 'list') {
      const listData =
        heap.find((h) => h.cells && h.cells.length > 0)?.cells || ['10', '25', '48', '64', '82'];
      const count = Math.min(listData.length, 6);
      const spacing = 52;
      const startX = -((count - 1) * spacing) / 2;

      for (let i = 0; i < count; i++) {
        const x = startX + i * spacing;
        const val = listData[i];
        const isHead = i === 0;
        const isTail = i === count - 1;

        // Dual Cell Node: [ val | •-> ]
        drawVoxel(x, 25, 0, 36, 24, 28, isHead ? PAL.mint : PAL.indigo, '#5748D6', '#3E32A3', {
          label: val,
          subLabel: isHead ? 'HEAD' : `[${i}]`,
          highlight: isHead,
        });

        // Pointer Ray connecting to Next Node
        if (!isTail) {
          const nextX = startX + (i + 1) * spacing;
          drawPointerRay(x + 18, 37, 0, nextX - 18, 37, 0, PAL.cyan, 'next');
        } else {
          // NULL Ground Terminator
          const nullP = project(x + 36, 37, 0);
          ctx.save();
          ctx.fillStyle = PAL.coral;
          ctx.font = 'bold 9.5px monospace';
          ctx.fillText('NULL ⏚', nullP.x, nullP.y + 4);
          ctx.restore();
        }
      }
    }

    // =========================================================================
    // VISUALIZATION MODE 7: 3D Call Stack Towers & Heap Memory
    // =========================================================================
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

      const frameHeight = 26;
      const frameWidth = 145;
      const frameDepth = 85;

      stackList.forEach((f, idx) => {
        const y = idx * (frameHeight + 16) + 6;
        const isTop = idx === stackList.length - 1;
        const top = isTop ? PAL.amber : '#7C6CFF';
        const front = isTop ? '#D99B26' : '#5748D6';
        const side = isTop ? '#A87413' : '#3E32A3';

        drawVoxel(0, y, 0, frameWidth, frameHeight, frameDepth, top, front, side, {
          label: f.sig.split('(')[0],
          subLabel: `Frame #${idx + 1}${isTop ? ' (Active)' : ''}`,
          highlight: isTop,
          highlightColor: top,
        });

        // Local Variable Capsule Chips beside Frame
        f.locals.slice(0, 3).forEach((loc, lIdx) => {
          const lx = frameWidth / 2 + 50;
          const lz = -28 + lIdx * 28;
          const valStr = `${loc.name}=${loc.text}`;

          drawVoxel(lx, y + 4, lz, 62, 16, 22, PAL.mint, '#1EA675', '#147A55', {
            label: valStr,
            highlight: false,
          });

          // Pointer Ray connecting Stack Frame to Local Chip
          drawPointerRay(frameWidth / 2, y + 12, lz, lx - 31, y + 12, lz, 'rgba(52, 217, 160, 0.7)');
        });
      });
    }

    ctx.restore();
  }, [yaw, pitch, zoom, effectiveMode, frames, heap, series, activeLine, stepNote]);

  // Intelligent Rendering Trigger: Redraw on Step / Camera Change
  const renderRef = useRef(renderScene);
  useEffect(() => {
    renderRef.current = renderScene;
  });

  useEffect(() => {
    renderScene();
  }, [renderScene]);

  // ResizeObserver for zero-idle-cost dynamic viewport adaptation
  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;
    const ro = new ResizeObserver(() => renderRef.current());
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: phone ? 300 : 340,
        background: 'radial-gradient(circle at 50% 40%, #161828 0%, #0B0D14 100%)',
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
          left: 10,
          right: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pointerEvents: 'none',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        {/* Mode Selector Pill Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            padding: 3,
            borderRadius: 9,
            background: 'rgba(15, 17, 26, 0.9)',
            border: '1px solid var(--line2)',
            backdropFilter: 'blur(10px)',
            pointerEvents: 'auto',
            overflowX: 'auto',
            maxWidth: '100%',
          }}
          className="navsb"
        >
          {(
            [
              ['auto', 'Auto'],
              ['arrays', 'Array'],
              ['tree', 'Tree'],
              ['matrix', 'Matrix'],
              ['hanoi', 'Hanoi'],
              ['graph', 'Graph'],
              ['stack', 'Stack'],
              ['list', 'List'],
            ] as [VisMode, string][]
          ).map(([m, label]) => {
            const isSel = visMode === m;
            return (
              <button
                key={m}
                onClick={() => {
                  playClick();
                  setVisMode(m);
                }}
                className="k-squish"
                style={{
                  padding: phone ? '3.5px 7px' : '4px 9px',
                  borderRadius: 6,
                  fontSize: phone ? 9.5 : 10.5,
                  fontWeight: 700,
                  border: 'none',
                  background: isSel ? 'var(--acc)' : 'transparent',
                  color: isSel ? 'var(--ink)' : 'var(--tx2)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Camera Angles & Zoom Controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: 3,
            borderRadius: 9,
            background: 'rgba(15, 17, 26, 0.9)',
            border: '1px solid var(--line2)',
            backdropFilter: 'blur(10px)',
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
                padding: '4px 7px',
                borderRadius: 6,
                fontSize: 9.5,
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

          {/* Reset Camera Button */}
          <button
            onClick={resetCamera}
            title="Reset Camera"
            className="hov k-squish"
            style={{
              width: 22,
              height: 22,
              borderRadius: 5,
              display: 'grid',
              placeItems: 'center',
              background: 'transparent',
              border: 'none',
              color: 'var(--tx2)',
              cursor: 'pointer',
            }}
          >
            <Icon name="refresh" size={11} color="var(--tx2)" />
          </button>

          {/* Zoom Buttons */}
          <button
            onClick={() => setZoom((z) => Math.min(3.0, z + 0.2))}
            title="Zoom In"
            className="hov k-squish"
            style={{
              width: 22,
              height: 22,
              borderRadius: 5,
              display: 'grid',
              placeItems: 'center',
              background: 'transparent',
              border: 'none',
              color: 'var(--tx2)',
              cursor: 'pointer',
            }}
          >
            <Icon name="plus" size={10} color="var(--tx2)" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
            title="Zoom Out"
            className="hov k-squish"
            style={{
              width: 22,
              height: 22,
              borderRadius: 5,
              display: 'grid',
              placeItems: 'center',
              background: 'transparent',
              border: 'none',
              color: 'var(--tx2)',
              cursor: 'pointer',
            }}
          >
            <Icon name="minus" size={10} color="var(--tx2)" />
          </button>
        </div>
      </div>

      {/* Bottom Status HUD */}
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
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'rgba(124, 108, 255, 0.15)',
              color: 'var(--accTx)',
              fontSize: 9.5,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {effectiveMode.toUpperCase()}
          </span>
          <span style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
            {stepNote || 'Drag to rotate 3D · Pinch / Scroll to zoom'}
          </span>
        </div>

        {activeLine && (
          <span style={{ color: PAL.amber, fontWeight: 700, flexShrink: 0 }}>
            Line {activeLine}
          </span>
        )}
      </div>
    </div>
  );
}
