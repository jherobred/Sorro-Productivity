'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Icon } from '../Icon';
import { playClick } from '@/lib/audio';
import { PAL } from '@/lib/pal';
import type { FrameSnap, HeapObj } from '@/lib/java';

export interface AISimEntity {
  id: number;
  label: string;
  val: string | number;
  x: number;
  y: number;
  z: number;
  color: string;
  type?: 'cube' | 'sphere' | 'cylinder' | 'node';
}

export interface AISimLink {
  from: number;
  to: number;
  color: string;
  label?: string;
}

export interface AISimStep {
  line: number;
  message: string;
  highlightIds?: number[];
  activeId?: number;
  variables?: Record<string, unknown>;
}

export interface AISimulationData {
  title?: string;
  algorithm?: string;
  dimension?: '3d' | '2.5d' | '2d';
  suggestedMode?: VisMode;
  summary?: string;
  entities?: AISimEntity[];
  links?: AISimLink[];
  steps?: AISimStep[];
}

interface Java3DVisualizerProps {
  frames: FrameSnap[];
  heap: HeapObj[];
  series: number[];
  activeLine: number | null;
  stepNote?: string;
  phone?: boolean;
  aiSimulation?: AISimulationData | null;
}

export type RenderStyle = 'stage2d' | 'orbit3d';
type ViewAngle = 'isometric' | 'perspective' | 'front' | 'top' | 'side' | 'free';
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

interface SimGraphNode {
  id: number;
  val: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

const STARFIELD_PARTICLES: Point3D[] = Array.from({ length: 42 }, (_, i) => {
  const theta = (i * 2.39996) % (Math.PI * 2);
  const phi = ((i * 1.61803) % Math.PI) - Math.PI / 2;
  const rad = 140 + ((i * 37) % 120);
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
  aiSimulation,
}: Java3DVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [renderStyle, setRenderStyle] = useState<RenderStyle>('stage2d');

  const [yaw, setYaw] = useState<number>(0.75);
  const [pitch, setPitch] = useState<number>(0.55);
  const [zoom, setZoom] = useState<number>(1.0);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  const [visMode, setVisMode] = useState<VisMode>('auto');
  const [viewAngle, setViewAngle] = useState<ViewAngle>('isometric');
  const [isPerspective, setIsPerspective] = useState<boolean>(true);

  const animTimeRef = useRef<number>(0);
  const animFrameIdRef = useRef<number | null>(null);

  const graphNodesRef = useRef<SimGraphNode[]>([
    { id: 0, val: '0', x: 0, y: 70, z: 0, vx: 0, vy: 0, vz: 0 },
    { id: 1, val: '1', x: -60, y: 35, z: -35, vx: 0, vy: 0, vz: 0 },
    { id: 2, val: '2', x: 60, y: 35, z: 35, vx: 0, vy: 0, vz: 0 },
    { id: 3, val: '3', x: -85, y: -5, z: 20, vx: 0, vy: 0, vz: 0 },
    { id: 4, val: '4', x: 0, y: 5, z: 65, vx: 0, vy: 0, vz: 0 },
    { id: 5, val: '5', x: 85, y: -5, z: -25, vx: 0, vy: 0, vz: 0 },
  ]);

  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchDistanceRef = useRef<number | null>(null);
  const isRightClickPanRef = useRef<boolean>(false);

  const setPresetAngle = useCallback((angle: ViewAngle) => {
    playClick();
    setViewAngle(angle);
    setPanX(0);
    setPanY(0);
    if (angle === 'isometric') {
      setIsPerspective(false);
      setYaw(0.75);
      setPitch(0.55);
      setZoom(1.0);
    } else if (angle === 'perspective') {
      setIsPerspective(true);
      setYaw(0.65);
      setPitch(0.48);
      setZoom(1.0);
    } else if (angle === 'front') {
      setIsPerspective(false);
      setYaw(0);
      setPitch(0.02);
      setZoom(1.0);
    } else if (angle === 'top') {
      setIsPerspective(false);
      setYaw(0);
      setPitch(1.52);
      setZoom(0.95);
    } else if (angle === 'side') {
      setIsPerspective(false);
      setYaw(Math.PI / 2);
      setPitch(0.05);
      setZoom(1.0);
    }
  }, []);

  const resetCamera = useCallback(() => {
    playClick();
    setViewAngle('perspective');
    setIsPerspective(true);
    setYaw(0.65);
    setPitch(0.48);
    setZoom(1.0);
    setPanX(0);
    setPanY(0);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    isRightClickPanRef.current = e.button === 2 || e.button === 1;
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

    if (pointers.size >= 2) {
      const pts = Array.from(pointers.values());
      const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchDistanceRef.current !== null && pinchDistanceRef.current > 0) {
        const deltaDist = currentDist - pinchDistanceRef.current;
        setZoom((z) => Math.max(0.35, Math.min(3.5, z + deltaDist * 0.005)));
      }
      pinchDistanceRef.current = currentDist;
      return;
    }

    if (pointers.size === 1) {
      const dx = e.clientX - prevPos.x;
      const dy = e.clientY - prevPos.y;

      if (isRightClickPanRef.current || e.shiftKey || renderStyle === 'stage2d') {
        setPanX((px) => px + dx);
        setPanY((py) => py + dy);
      } else {
        setViewAngle('free');
        setYaw((y) => y + dx * 0.0075);
        setPitch((p) => Math.max(-0.25, Math.min(1.54, p - dy * 0.0075)));
      }
    }
  }, [renderStyle]);

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
    setZoom((z) => Math.max(0.35, Math.min(3.5, z - e.deltaY * 0.0015)));
  }, []);

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

    const hasArrays =
      heap.some((h) => h.type.includes('[]') || (h.cells && h.cells.length > 0)) || series.length > 0;
    if (hasArrays) return 'arrays';

    return 'stack';
  }, [frames, heap, series]);

  const effectiveMode = visMode === 'auto' ? detectedMode : visMode;

  const renderScene = useCallback((time: number) => {
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

    ctx.clearRect(0, 0, width, height);

    const cx = width / 2 + panX;
    const cy = height / 2 + panY;

    const project = (x: number, y: number, z: number): ProjectedPoint => {
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const x1 = x * cosY - z * sinY;
      const z1 = x * sinY + z * cosY;

      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);
      const y2 = y * cosP - z1 * sinP;
      const z2 = y * sinP + z1 * cosP;

      if (isPerspective) {
        const fovDistance = 620;
        const depth = z2 + fovDistance;
        const scale = (390 / Math.max(40, depth)) * zoom;
        return { x: cx + x1 * scale * 1.8, y: cy + 20 - y2 * scale * 1.8, z: z2, scale };
      } else {
        const scale = 0.65 * zoom;
        return { x: cx + x1 * scale * 1.8, y: cy + 20 - y2 * scale * 1.8, z: z2, scale };
      }
    };

    if (renderStyle === 'stage2d') {
      const isMobile = width < 480;

      const currentLocals = frames[frames.length - 1]?.locals || [];
      const getLocalNum = (names: string[]) => {
        const found = currentLocals.find((l) => names.includes(l.name));
        return found ? Number(found.value?.v ?? found.text) : null;
      };

      const varI = getLocalNum(['i', 'outer', 'index', 'idx']);
      const varJ = getLocalNum(['j', 'inner']);

      if (effectiveMode === 'hanoi') {
        const stageY = cy + 40;
        const pegSpacing = isMobile ? 85 : 120;
        const pegH = 110;
        const pegs = [
          { label: 'A', x: cx - pegSpacing },
          { label: 'B', x: cx },
          { label: 'C', x: cx + pegSpacing },
        ];

        const stageW = pegSpacing * 2 + (isMobile ? 120 : 160);
        ctx.save();
        ctx.fillStyle = '#121520';
        ctx.strokeStyle = '#222838';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(cx - stageW / 2, stageY, stageW, 26, 12);
        ctx.fill();
        ctx.stroke();

        pegs.forEach((peg) => {
          const pegGrad = ctx.createLinearGradient(peg.x - 3, stageY - pegH, peg.x + 3, stageY);
          pegGrad.addColorStop(0, '#2F3B52');
          pegGrad.addColorStop(0.5, '#455675');
          pegGrad.addColorStop(1, '#1A2130');
          ctx.fillStyle = pegGrad;
          ctx.beginPath();
          ctx.roundRect(peg.x - 3.5, stageY - pegH, 7, pegH + 4, 3.5);
          ctx.fill();

          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 13px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(peg.label, peg.x, stageY + 18);
        });

        let movingDisk = 3;
        let fromPeg = 0;
        let toPeg = 2;
        const moveMatch = stepNote?.match(/Move\s+disk\s+(\d+)\s+from\s+([A-C])\s*->\s*([A-C])/i);
        if (moveMatch) {
          movingDisk = parseInt(moveMatch[1], 10);
          fromPeg = moveMatch[2] === 'A' ? 0 : moveMatch[2] === 'B' ? 1 : 2;
          toPeg = moveMatch[3] === 'A' ? 0 : moveMatch[3] === 'B' ? 1 : 2;
        }

        const diskColors: Record<number, string> = {
          1: '#3D4D6B',
          2: '#2F3C54',
          3: '#C67A18',
          4: '#28344B',
          5: '#222D42',
        };

        const diskSizes: Record<number, number> = {
          1: 44,
          2: 58,
          3: 72,
          4: 86,
          5: 100,
        };

        const stacks: number[][] = [[5, 4], [2, 1], []];
        stacks[fromPeg] = stacks[fromPeg].filter((d) => d !== movingDisk);

        stacks.forEach((stack, pIdx) => {
          let curY = stageY - 14;
          stack.forEach((dId) => {
            const dw = diskSizes[dId] || 60;
            const px = pegs[pIdx].x;
            ctx.fillStyle = diskColors[dId] || '#2F3C54';
            ctx.strokeStyle = '#404E6B';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.roundRect(px - dw / 2, curY, dw, 16, 8);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#E2E8F0';
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(dId), px, curY + 8);
            curY -= 18;
          });
        });

        if (movingDisk > 0) {
          const hoverX = pegs[fromPeg].x;
          const hoverY = stageY - pegH - 12 + Math.sin(time * 3) * 2;
          const dw = diskSizes[movingDisk] || 72;

          ctx.save();
          ctx.shadowColor = 'rgba(217, 119, 6, 0.6)';
          ctx.shadowBlur = 18;
          ctx.fillStyle = '#C67A18';
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(hoverX - dw / 2, hoverY, dw, 17, 8.5);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 12px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(movingDisk), hoverX, hoverY + 8.5);
          ctx.restore();
        }

        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('MOVES', cx - 24, stageY + 54);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 15px monospace';
        ctx.fillText('3 / 31', cx + 28, stageY + 54);

        ctx.restore();
      } else if (effectiveMode === 'stack') {
        const boxW = isMobile ? 80 : 105;
        const boxH = 28;
        const colSpacing = isMobile ? 120 : 160;
        const stackX = cx - colSpacing / 2;
        const queueX = cx + colSpacing / 2;
        const startY = cy - 40;

        ctx.save();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 18px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('STACK vs QUEUE', cx, cy - 90);

        ctx.font = 'bold 11.5px monospace';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('STACK ', stackX - 22, startY - 20);
        ctx.fillStyle = PAL.indigo;
        ctx.fillText('(LIFO)', stackX + 22, startY - 20);

        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('QUEUE ', queueX - 22, startY - 20);
        ctx.fillStyle = PAL.sky;
        ctx.fillText('(FIFO)', queueX + 22, startY - 20);

        const items = [
          { val: 'D', color: '#E06B88', glow: true },
          { val: 'C', color: '#B87A28', glow: false },
          { val: 'B', color: '#2B8265', glow: false },
          { val: 'A', color: '#3B6FB6', glow: false },
        ];

        items.forEach((item, idx) => {
          const iy = startY + idx * (boxH + 3);
          ctx.save();
          if (item.glow) {
            ctx.shadowColor = item.color;
            ctx.shadowBlur = 14;
          }
          ctx.fillStyle = item.color;
          ctx.strokeStyle = item.glow ? '#FFFFFF' : 'rgba(255,255,255,0.2)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.roundRect(stackX - boxW / 2, iy, boxW, boxH, 8);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#FFFFFF';
          ctx.font = '900 14px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(item.val, stackX, iy + boxH / 2);
          ctx.restore();
        });

        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = 'bold 9.5px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('Top', stackX + boxW / 2 + 8, startY + 14);
        ctx.fillText('Bottom', stackX + boxW / 2 + 8, startY + 3 * (boxH + 3) + 14);

        const queueItems = [
          { val: 'D', color: '#7E4256', glow: false },
          { val: 'C', color: '#8F6122', glow: false },
          { val: 'B', color: '#1F5A47', glow: false },
          { val: 'A', color: '#4B7BFF', glow: true },
        ];

        queueItems.forEach((item, idx) => {
          const iy = startY + idx * (boxH + 3);
          ctx.save();
          if (item.glow) {
            ctx.shadowColor = item.color;
            ctx.shadowBlur = 16;
          }
          ctx.fillStyle = item.color;
          ctx.strokeStyle = item.glow ? '#93C5FD' : 'rgba(255,255,255,0.2)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.roundRect(queueX - boxW / 2, iy, boxW, boxH, 8);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#FFFFFF';
          ctx.font = '900 14px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(item.val, queueX, iy + boxH / 2);
          ctx.restore();
        });

        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = 'bold 9.5px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('Rear', queueX - boxW / 2 - 8, startY + 14);
        ctx.fillText('Front', queueX - boxW / 2 - 8, startY + 3 * (boxH + 3) + 14);

        ctx.fillStyle = '#F59E0B';
        ctx.font = 'bold 12.5px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Same contents. Different answer.', cx, startY + 4 * (boxH + 3) + 36);

        ctx.restore();
      } else if (effectiveMode === 'arrays') {
        const primaryArray = heap.find((h) => h.cells && h.cells.length > 0);
        const cells =
          primaryArray?.cells ||
          (series.length ? series.map(String) : ['4', '8', '3', '2', '6', '1', '9', '7', '10', '5']);

        const count = Math.min(cells.length, isMobile ? 8 : 10);
        const tileW = isMobile ? 32 : 38;
        const tileH = isMobile ? 32 : 38;
        const spacing = tileW + (isMobile ? 6 : 8);
        const totalW = count * spacing;
        const startX = cx - totalW / 2 + spacing / 2;
        const stageY = cy + 10;

        ctx.save();

        const isQuickSort = frames.some((f) => f.sig.toLowerCase().includes('quick'));
        const isTwoSum = frames.some((f) => f.sig.toLowerCase().includes('twosum') || f.sig.toLowerCase().includes('sum'));

        const titleText = isTwoSum ? 'TWO SUM' : isQuickSort ? 'QUICK SORT' : 'BUBBLE SORT';
        const subTitleText = isTwoSum
          ? 'Find two indices whose values add to target'
          : isQuickSort
          ? 'LOMUTO PARTITION · LAST ELEMENT AS PIVOT'
          : 'Compare each neighbour, swap if they are out of order, repeat.';

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(titleText, cx, cy - 110);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = 'bold 9.5px monospace';
        ctx.fillText(subTitleText, cx, cy - 94);

        const chipY = cy - 78;
        const drawChip = (label: string, val: string, xPos: number, col: string = PAL.sky) => {
          ctx.fillStyle = 'rgba(15, 17, 26, 0.9)';
          ctx.strokeStyle = '#222838';
          ctx.beginPath();
          ctx.roundRect(xPos - 38, chipY, 76, 16, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.font = 'bold 7.5px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(label, xPos - 34, chipY + 11);

          ctx.fillStyle = col;
          ctx.font = 'bold 8.5px monospace';
          ctx.textAlign = 'right';
          ctx.fillText(val, xPos + 34, chipY + 11);
        };

        drawChip('TIME', isQuickSort ? 'O(nlogn)' : 'O(n²)', cx - 85, PAL.sky);
        drawChip('SPACE', 'O(1)', cx, PAL.sky);
        drawChip('PASS', `${(varI ?? 0) + 1}/5`, cx + 85, PAL.amber);

        const gantryY = cy - 42;
        ctx.strokeStyle = '#222838';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(startX - 20, gantryY);
        ctx.lineTo(startX + (count - 1) * spacing + 20, gantryY);
        ctx.stroke();

        const shelfW = totalW + 30;
        ctx.fillStyle = '#111420';
        ctx.strokeStyle = '#1E2433';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(cx - shelfW / 2, stageY + tileH / 2 - 2, shelfW, 14, 7);
        ctx.fill();
        ctx.stroke();

        const activeA = varJ !== null && varJ >= 0 && varJ < count ? varJ : 0;
        const activeB = varJ !== null && varJ + 1 < count ? varJ + 1 : 1;
        const valA = cells[activeA] || '4';
        const valB = cells[activeB] || '5';

        const gantryBoxX = (startX + activeA * spacing + startX + activeB * spacing) / 2;
        ctx.fillStyle = '#171B26';
        ctx.strokeStyle = '#2F3B52';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(gantryBoxX - 35, gantryY - 14, 70, 22, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = PAL.amber;
        ctx.beginPath();
        ctx.arc(gantryBoxX - 25, gantryY - 3, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 9.5px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${valA} < ${valB}`, gantryBoxX + 6, gantryY);

        [activeA, activeB].forEach((idx) => {
          const tx = startX + idx * spacing;
          ctx.strokeStyle = 'rgba(217, 119, 6, 0.75)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(tx, gantryY + 8);
          ctx.lineTo(tx, stageY - 22);
          ctx.stroke();
        });

        if (isTwoSum || activeB === activeA + 1) {
          const x1 = startX + activeA * spacing;
          const x2 = startX + activeB * spacing;
          ctx.strokeStyle = PAL.amber;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x1, stageY - tileH / 2 - 4);
          ctx.quadraticCurveTo((x1 + x2) / 2, stageY - tileH / 2 - 22, x2, stageY - tileH / 2 - 4);
          ctx.stroke();
        }

        for (let i = 0; i < count; i++) {
          const tx = startX + i * spacing;
          const val = cells[i];
          const isComparing = i === activeA || i === activeB;

          const elevation = isComparing ? -16 : 0;
          const ty = stageY + elevation;

          ctx.save();
          if (isComparing) {
            ctx.shadowColor = PAL.sky;
            ctx.shadowBlur = 14;
            ctx.fillStyle = '#223354';
            ctx.strokeStyle = PAL.sky;
          } else {
            ctx.fillStyle = '#1A1E29';
            ctx.strokeStyle = '#2B3242';
          }

          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(tx - tileW / 2, ty - tileH / 2, tileW, tileH, 8);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = isComparing ? '#93C5FD' : '#FFFFFF';
          ctx.font = '900 13px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(val, tx, ty);

          ctx.fillStyle = isComparing ? PAL.amber : 'rgba(255,255,255,0.4)';
          ctx.font = 'bold 9px monospace';
          ctx.fillText(String(i), tx, stageY + tileH / 2 + 18);

          ctx.restore();
        }

        const eqY = stageY + 54;
        if (isTwoSum) {
          ctx.fillStyle = PAL.amber;
          ctx.font = '900 20px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`${valA} + ${valB} = ${Number(valA) + Number(valB)}`, cx, eqY);

          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.font = 'bold 9.5px monospace';
          ctx.fillText('14 COMPARISONS · BRUTE FORCE', cx, eqY + 22);

          ctx.fillStyle = PAL.amber;
          ctx.font = 'bold 12px system-ui, sans-serif';
          ctx.fillText('Check every pair.', cx, eqY + 40);
        } else {
          ctx.font = '900 18px monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = PAL.sky;
          ctx.fillText(`${valA}`, cx - 22, eqY);
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.fillText(Number(valA) < Number(valB) ? ' < ' : ' > ', cx, eqY);
          ctx.fillStyle = PAL.amber;
          ctx.fillText(`${valB}`, cx + 22, eqY);
        }

        ctx.restore();
      } else if (effectiveMode === 'tree') {
        const treeNodes = [
          { id: 0, val: '50', x: cx, y: cy - 70, left: 1, right: 2, level: 0 },
          { id: 1, val: '30', x: cx - 70, y: cy - 10, left: 3, right: 4, level: 1 },
          { id: 2, val: '70', x: cx + 70, y: cy - 10, left: 5, right: 6, level: 1 },
          { id: 3, val: '20', x: cx - 105, y: cy + 50, level: 2 },
          { id: 4, val: '40', x: cx - 35, y: cy + 50, level: 2 },
          { id: 5, val: '60', x: cx + 35, y: cy + 50, level: 2 },
          { id: 6, val: '80', x: cx + 105, y: cy + 50, level: 2 },
        ];

        ctx.save();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('BINARY SEARCH TREE', cx, cy - 105);

        treeNodes.forEach((node) => {
          [node.left, node.right].forEach((childId) => {
            if (childId === undefined) return;
            const target = treeNodes[childId];
            ctx.strokeStyle = 'rgba(124, 108, 255, 0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(target.x, target.y);
            ctx.stroke();

            const pulseT = (time * 1.5 + node.level * 0.3) % 1;
            const px = (1 - pulseT) * node.x + pulseT * target.x;
            const py = (1 - pulseT) * node.y + pulseT * target.y;
            ctx.fillStyle = '#FFFFFF';
            ctx.shadowColor = PAL.indigo;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(px, py, 2.5, 0, Math.PI * 2);
            ctx.fill();
          });
        });

        treeNodes.forEach((node) => {
          const isRoot = node.id === 0;
          const r = 16;
          ctx.save();
          ctx.shadowColor = isRoot ? PAL.amber : PAL.indigo;
          ctx.shadowBlur = 12;
          const nodeGrad = ctx.createRadialGradient(node.x - 4, node.y - 4, 2, node.x, node.y, r);
          nodeGrad.addColorStop(0, '#FFFFFF');
          nodeGrad.addColorStop(0.3, isRoot ? PAL.amber : '#4B7BFF');
          nodeGrad.addColorStop(1, isRoot ? '#8F6122' : '#1E2E5A');
          ctx.fillStyle = nodeGrad;
          ctx.strokeStyle = 'rgba(255,255,255,0.4)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '900 11px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(node.val, node.x, node.y);
          ctx.restore();
        });

        ctx.restore();
      } else if (effectiveMode === 'graph') {
        const gNodes = graphNodesRef.current;
        const edges = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 4], [2, 5], [3, 5]];

        for (let i = 0; i < gNodes.length; i++) {
          for (let j = i + 1; j < gNodes.length; j++) {
            const dx = gNodes[j].x - gNodes[i].x;
            const dy = gNodes[j].y - gNodes[i].y;
            const dist = Math.hypot(dx, dy) || 1;
            if (dist < 180) {
              const rep = 320 / (dist * dist);
              gNodes[i].vx -= (dx / dist) * rep;
              gNodes[i].vy -= (dy / dist) * rep;
              gNodes[j].vx += (dx / dist) * rep;
              gNodes[j].vy += (dy / dist) * rep;
            }
          }
        }
        gNodes.forEach((n) => {
          n.vx -= n.x * 0.015;
          n.vy -= n.y * 0.015;
          n.vx *= 0.90;
          n.vy *= 0.90;
          n.x += n.vx;
          n.y += n.vy;
        });

        ctx.save();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('3D/2.5D NETWORK GRAPH', cx, cy - 105);

        edges.forEach(([u, v]) => {
          const nU = gNodes[u];
          const nV = gNodes[v];
          ctx.strokeStyle = 'rgba(124, 108, 255, 0.55)';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(cx + nU.x, cy + nU.y);
          ctx.lineTo(cx + nV.x, cy + nV.y);
          ctx.stroke();
        });

        gNodes.forEach((node) => {
          const nx = cx + node.x;
          const ny = cy + node.y;
          ctx.save();
          ctx.shadowColor = PAL.indigo;
          ctx.shadowBlur = 12;
          const grad = ctx.createRadialGradient(nx - 3, ny - 3, 2, nx, ny, 15);
          grad.addColorStop(0, '#FFFFFF');
          grad.addColorStop(0.3, PAL.indigo);
          grad.addColorStop(1, '#1A2130');
          ctx.fillStyle = grad;
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(nx, ny, 15, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '900 11px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`N${node.id}`, nx, ny);
          ctx.restore();
        });
        ctx.restore();
      } else {
        const listData = heap.find((h) => h.cells && h.cells.length > 0)?.cells || ['10', '25', '48', '64', '82'];
        const count = Math.min(listData.length, 6);
        const spacing = 52;
        const startX = cx - ((count - 1) * spacing) / 2;

        ctx.save();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('2.5D DATA STRUCTURE STAGE', cx, cy - 80);

        for (let i = 0; i < count; i++) {
          const x = startX + i * spacing;
          const val = listData[i];
          const isHead = i === 0;

          ctx.fillStyle = isHead ? '#1E3A8A' : '#1A1E29';
          ctx.strokeStyle = isHead ? PAL.sky : '#2B3242';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(x - 20, cy - 16, 40, 32, 8);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '900 12px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(val, x, cy);
          if (i < count - 1) {
            ctx.strokeStyle = PAL.amber;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x + 20, cy);
            ctx.lineTo(x + spacing - 20, cy);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    } else {
      STARFIELD_PARTICLES.forEach((p, idx) => {
        const proj = project(p.x, p.y + Math.sin(time * 0.8 + idx) * 4, p.z);
        if (proj.scale > 0.1) {
          const rad = Math.max(0.8, 1.4 * proj.scale);
          const alpha = Math.min(0.5, Math.max(0.1, 0.28 + 0.18 * Math.sin(idx + time * 1.2)));
          ctx.fillStyle = idx % 2 === 0 ? `rgba(124, 140, 255, ${alpha})` : `rgba(56, 189, 248, ${alpha})`;
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      [60, 120, 180].forEach((r) => {
        ctx.strokeStyle = 'rgba(124, 108, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const segs = 32;
        for (let s = 0; s <= segs; s++) {
          const a = (s / segs) * Math.PI * 2;
          const pt = project(Math.cos(a) * r, 0, Math.sin(a) * r);
          if (s === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
      });

      const drawVoxel3D = (
        bx: number,
        by: number,
        bz: number,
        bw: number,
        bh: number,
        bd: number,
        topCol: string,
        frontCol: string,
        sideCol: string,
        label?: string
      ) => {
        const p000 = project(bx - bw / 2, by, bz - bd / 2);
        const p100 = project(bx + bw / 2, by, bz - bd / 2);
        const p110 = project(bx + bw / 2, by + bh, bz - bd / 2);
        const p010 = project(bx - bw / 2, by + bh, bz - bd / 2);

        const p001 = project(bx - bw / 2, by, bz + bd / 2);
        const p101 = project(bx + bw / 2, by, bz + bd / 2);
        const p111 = project(bx + bw / 2, by + bh, bz + bd / 2);
        const p011 = project(bx - bw / 2, by + bh, bz + bd / 2);

        ctx.fillStyle = frontCol;
        ctx.beginPath();
        ctx.moveTo(p001.x, p001.y);
        ctx.lineTo(p101.x, p101.y);
        ctx.lineTo(p111.x, p111.y);
        ctx.lineTo(p011.x, p011.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.stroke();

        ctx.fillStyle = sideCol;
        ctx.beginPath();
        ctx.moveTo(p101.x, p101.y);
        ctx.lineTo(p100.x, p100.y);
        ctx.lineTo(p110.x, p110.y);
        ctx.lineTo(p111.x, p111.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = topCol;
        ctx.beginPath();
        ctx.moveTo(p011.x, p011.y);
        ctx.lineTo(p111.x, p111.y);
        ctx.lineTo(p110.x, p110.y);
        ctx.lineTo(p010.x, p010.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.stroke();

        if (label && p011.scale > 0.28) {
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `bold ${Math.max(9, Math.round(11 * p011.scale))}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, (p011.x + p111.x) / 2, (p011.y + p111.y) / 2);
        }
      };

      if (aiSimulation && aiSimulation.entities && aiSimulation.entities.length > 0) {
        // Draw Links
        if (aiSimulation.links) {
          aiSimulation.links.forEach((lk) => {
            const fromE = aiSimulation.entities?.find((e) => e.id === lk.from);
            const toE = aiSimulation.entities?.find((e) => e.id === lk.to);
            if (fromE && toE) {
              const p1 = project(fromE.x, fromE.y, fromE.z);
              const p2 = project(toE.x, toE.y, toE.z);
              ctx.strokeStyle = lk.color || '#89DDFF';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.stroke();

              if (lk.label) {
                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 9px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(lk.label, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2 - 4);
              }
            }
          });
        }

        // Draw Entities
        aiSimulation.entities.forEach((ent) => {
          const p = project(ent.x, ent.y, ent.z);
          const col = ent.color || '#7C6CFF';
          const size = Math.max(16, Math.round(28 * p.scale));

          ctx.save();
          if (ent.type === 'sphere' || ent.type === 'node') {
            ctx.fillStyle = col;
            ctx.shadowColor = col;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          } else {
            drawVoxel3D(ent.x, ent.y, ent.z, size, size, size, col, col, col, String(ent.val));
          }

          // Label
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `bold ${Math.max(9, Math.round(10 * p.scale))}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(ent.label || String(ent.val), p.x, p.y + size / 2 + 12);
          ctx.restore();
        });
      } else {
        const count = 8;
        const spacing = 32;
        const startX = -((count - 1) * spacing) / 2;
        for (let i = 0; i < count; i++) {
          const x = startX + i * spacing;
          const h = 20 + i * 12;
          drawVoxel3D(x, 0, 0, 22, h, 22, PAL.indigo, '#5748D6', '#3E32A3', `${h}`);
        }
      }

      const gizmoX = width - 36;
      const gizmoY = 36;
      ctx.save();
      ctx.fillStyle = 'rgba(15, 17, 26, 0.85)';
      ctx.strokeStyle = 'var(--line2)';
      ctx.beginPath();
      ctx.arc(gizmoX, gizmoY, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }, [renderStyle, yaw, pitch, zoom, panX, panY, isPerspective, effectiveMode, frames, heap, series, stepNote, aiSimulation]);

  useEffect(() => {
    let active = true;
    const animate = (timeMs: number) => {
      if (!active) return;
      animTimeRef.current = timeMs * 0.001;
      renderScene(animTimeRef.current);
      animFrameIdRef.current = requestAnimationFrame(animate);
    };

    animFrameIdRef.current = requestAnimationFrame(animate);
    return () => {
      active = false;
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [renderScene]);

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;
    const ro = new ResizeObserver(() => renderScene(animTimeRef.current));
    ro.observe(parent);
    return () => ro.disconnect();
  }, [renderScene]);

  return (
    <div
      ref={containerRef}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: phone ? 320 : 360,
        background: 'radial-gradient(circle at 50% 40%, #131726 0%, #080A10 100%)',
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid var(--line2)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
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
          cursor: renderStyle === 'orbit3d' ? 'grab' : 'default',
          touchAction: 'none',
        }}
      />

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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            padding: 3,
            borderRadius: 9,
            background: 'rgba(15, 17, 26, 0.92)',
            border: '1px solid var(--line2)',
            backdropFilter: 'blur(10px)',
            pointerEvents: 'auto',
          }}
        >
          <button
            onClick={() => {
              playClick();
              setRenderStyle('stage2d');
            }}
            className="k-squish"
            style={{
              padding: phone ? '4px 8px' : '4px 10px',
              borderRadius: 6,
              fontSize: phone ? 10 : 11,
              fontWeight: 800,
              border: 'none',
              background: renderStyle === 'stage2d' ? 'var(--acc)' : 'transparent',
              color: renderStyle === 'stage2d' ? 'var(--ink)' : 'var(--tx2)',
              cursor: 'pointer',
            }}
          >
            🎨 2.5D Stage
          </button>
          <button
            onClick={() => {
              playClick();
              setRenderStyle('orbit3d');
            }}
            className="k-squish"
            style={{
              padding: phone ? '4px 8px' : '4px 10px',
              borderRadius: 6,
              fontSize: phone ? 10 : 11,
              fontWeight: 800,
              border: 'none',
              background: renderStyle === 'orbit3d' ? 'var(--acc)' : 'transparent',
              color: renderStyle === 'orbit3d' ? 'var(--ink)' : 'var(--tx2)',
              cursor: 'pointer',
            }}
          >
            🌌 3D Orbit
          </button>
        </div>

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
              ['arrays', 'Array/Sort'],
              ['hanoi', 'Hanoi'],
              ['stack', 'Stack/Queue'],
              ['tree', 'Tree'],
              ['graph', 'Graph'],
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
          <button
            onClick={resetCamera}
            title="Reset View"
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
          <button
            onClick={() => setZoom((z) => Math.min(3.5, z + 0.2))}
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
        </div>
      </div>

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
            {renderStyle === 'stage2d' ? '2.5D STAGE' : '3D ORBIT'}
          </span>
          <span style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
            {stepNote || 'Drag to pan / rotate · Scroll to zoom'}
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
