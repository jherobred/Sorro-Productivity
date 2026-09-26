'use client';

/**
 * A free page, laid out the way a OneNote page is.
 *
 * The title sits top left over a rule, with the day and time the page was
 * started under it. Below is plain paper you can write on anywhere: click an
 * empty spot and a container opens there, with a bar along its top to drag it
 * by and a handle at the bar's end to widen it. Containers hold writing, with
 * a formatting bar floating over the one being written in, or a picture. The
 * pen writes ink straight onto the paper, and the lasso gathers containers and
 * ink together to move, copy or delete.
 *
 * Containers and ink are the page's own objects, so copy, cut, paste,
 * duplicate, undo and redo work on them as well as on the words inside.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as PE } from 'react';
import dynamic from 'next/dynamic';
import type { Editor } from '@tiptap/react';
import { Icon, type IconName } from '@/components/Icon';
import { ContextMenu, type CtxItem } from '@/components/ContextMenu';
import { toast } from '@/lib/toast';
import { useTapGuard } from '@/lib/tapGuard';
import { pressurePath, strokeBounds, strokeHit } from '@/lib/boardGeometry';
import { savePageAsset, usePageAssetUrl } from '@/lib/pageAssets';
import { webpOf } from '@/lib/webpPhoto';
import { plainDoc, readFreePage, richText, writeFreePage, type BoardItem, type FreeBox, type FreeInk, type FreePageDocument, type PageAsset, type RichNode } from '@/lib/pageKinds';
import type { Note } from '@/lib/notes';
import { usePageDraft } from './usePageDraft';
import { PageSaveStatus } from './PageSaveStatus';
import { BoxBody, BoxEditor, FormatBar } from './FreePageText';
import type { ScanResult } from './ScanSheet';

const ScanSheet = dynamic(() => import('./ScanSheet').then((m) => m.ScanSheet), { ssr: false });

/** Where a dropped container lands, so a page stays tidy without anyone lining it up. */
const GRID = 8;
const MIN_W = 120;
const NEW_W = 360;
const ROOM_BELOW = 320;
const BLANK: RichNode = { type: 'doc', content: [{ type: 'paragraph' }] };
/** 'auto' is ink that is dark on light paper and light on dark, like OneNote's black pen. */
const INKS = ['auto', '#e5484d', '#2454ed', '#30a46c', '#f76b15', '#8e4ec6'];
const MARKERS = ['#ffe14a', '#7ee29a', '#79c6ff', '#ff8fc4'];
const WIDTHS = [{ label: 'Fine', px: 2 }, { label: 'Medium', px: 3.5 }, { label: 'Bold', px: 6 }];
const PEN_GRACE_MS = 1000;
const PALM_PX = 34;

type Tool = 'type' | 'pen' | 'marker' | 'erase' | 'lasso';
type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
type Gesture =
  | { kind: 'ink'; pointer: number; points: number[][] }
  | { kind: 'erase'; pointer: number; erased: Set<string> }
  | { kind: 'lasso'; pointer: number; start: Point }
  | { kind: 'move'; pointer: number; start: Point; ids: string[]; before: FreePageDocument; moved: boolean }
  | { kind: 'width'; pointer: number; start: Point; id: string; before: FreePageDocument }
  | { kind: 'scroll'; pointer: number; last: Point };

const snap = (n: number) => Math.round(n / GRID) * GRID;
const empty = (doc: RichNode) => !richText(doc).trim();
const inkColor = (c: string) => (c === 'auto' ? 'var(--tx)' : c);
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** An ink outline, worked out once per stroke rather than once per redraw. */
const outlines = new WeakMap<number[][], string>();
function outlineOf(s: FreeInk) {
  let d = outlines.get(s.points);
  if (d === undefined) { d = pressurePath(s.points, s.width); outlines.set(s.points, d); }
  return d;
}

function BoxImage({ asset }: { asset: PageAsset }) {
  const { url, error } = usePageAssetUrl(asset);
  return url ? <img src={url} alt={asset.name} draggable={false} /> : <span className="fp-image-wait">{error || 'Loading picture…'}</span>;
}

export function FreePage({ note, onSave }: { note: Note; onSave: (v: { title: string; body: string }) => void }) {
  const { draft, change, waiting } = usePageDraft(note, onSave);
  const [page, setPage] = useState<FreePageDocument>(() => readFreePage(note.body) ?? { version: 1, kind: 'freepage', boxes: [] });
  const pageRef = useRef(page); pageRef.current = page;
  const [tool, setTool] = useState<Tool>('type');
  const [ink, setInk] = useState('auto');
  const [marker, setMarker] = useState(MARKERS[0]);
  const [width, setWidth] = useState(WIDTHS[1].px);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const editingRef = useRef<string | null>(null); editingRef.current = editing;
  const [marquee, setMarqueeState] = useState<Rect | null>(null);
  /** The lasso's rectangle for the gesture's own handlers, which outlive the render that started them. */
  const marqueeRef = useRef<Rect | null>(null);
  const setMarquee = (r: Rect | null) => { marqueeRef.current = r; setMarqueeState(r); };
  const [menu, setMenu] = useState<{ x: number; y: number; items: CtxItem[]; label: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [scanning, setScanning] = useState(false);
  const [step, setStep] = useState(0);
  const [, setLook] = useState(0);
  const look = useCallback(() => setLook((n) => n + 1), []);
  const history = useRef<FreePageDocument[]>([page]); const at = useRef(0);
  const sheet = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const livePath = useRef<SVGPathElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const editor = useRef<Editor | null>(null);
  /** The container being typed in, kept out of React so a keystroke redraws nothing. */
  const live = useRef<{ id: string; doc: RichNode } | null>(null);
  const clip = useRef<{ boxes: FreeBox[]; ink: FreeInk[]; text: string } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const penSeen = useRef(false);
  const penUntil = useRef(0);
  const lastPoint = useRef<Point>({ x: 48, y: 24 });
  const tap = useTapGuard();

  /* ------------------------------------------------------------ the page */

  /** Whatever is on the page right now, including words not yet committed. */
  const now = useCallback((): FreePageDocument => {
    const pending = live.current;
    if (!pending) return pageRef.current;
    return { ...pageRef.current, boxes: pageRef.current.boxes.map((b) => (b.id === pending.id ? { ...b, doc: pending.doc } : b)) };
  }, []);

  const commit = useCallback((next: FreePageDocument, record = true) => {
    pageRef.current = next;
    setPage(next);
    change({ body: writeFreePage(next) });
    if (record) {
      const list = history.current.slice(0, at.current + 1);
      list.push(next);
      if (list.length > 80) list.shift();
      history.current = list; at.current = list.length - 1; setStep(at.current);
    }
  }, [change]);

  /** A change mid-gesture: drawn at once, written down when the gesture ends. */
  const show = (next: FreePageDocument) => { pageRef.current = next; setPage(next); };

  const undo = (direction: number) => {
    const index = at.current + direction;
    if (index < 0 || index >= history.current.length) return;
    live.current = null;
    setEditing(null);
    at.current = index; setStep(index);
    commit(history.current[index], false);
    setSelected([]);
  };

  const width_ = () => area.current?.clientWidth ?? 900;
  /** Where on the paper a pointer is. */
  const local = (x: number, y: number): Point => {
    const el = area.current!, r = el.getBoundingClientRect();
    return { x: (x - r.left) * el.clientWidth / r.width, y: (y - r.top) * el.clientHeight / r.height };
  };
  const heightOf = (b: FreeBox) => area.current?.querySelector<HTMLElement>(`[data-box="${b.id}"]`)?.offsetHeight ?? b.h ?? 60;
  const rectOf = (id: string): Rect | null => {
    const b = pageRef.current.boxes.find((x) => x.id === id);
    if (b) return { x: b.x, y: b.y, w: b.w, h: heightOf(b) };
    const s = pageRef.current.ink?.find((x) => x.id === id);
    return s ? { x: s.x, y: s.y, w: s.w, h: s.h } : null;
  };
  const selectionRect = (): Rect | null => {
    const rects = selected.map(rectOf).filter((r): r is Rect => !!r);
    if (!rects.length) return null;
    const x = Math.min(...rects.map((r) => r.x)), y = Math.min(...rects.map((r) => r.y));
    return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
  };

  /* ------------------------------------------------------- the containers */

  const acrossFrom = (x: number, w: number) => Math.max(0, Math.min(snap(x), snap(Math.max(0, width_() - w - GRID))));
  const addBox = (x: number, y: number, doc: RichNode = BLANK, focus = true) => {
    const w = Math.min(NEW_W, Math.max(MIN_W, width_() - 2 * GRID));
    const box: FreeBox = { id: crypto.randomUUID(), x: acrossFrom(x, w), y: Math.max(0, snap(y)), w, doc };
    commit({ ...now(), boxes: [...now().boxes, box] });
    setSelected([box.id]);
    if (focus) setEditing(box.id);
    return box;
  };

  const removeIds = (ids: string[], record = true) => {
    const cur = now();
    commit({ ...cur, boxes: cur.boxes.filter((b) => !ids.includes(b.id)), ink: (cur.ink ?? []).filter((s) => !ids.includes(s.id)) }, record);
    setSelected((list) => list.filter((id) => !ids.includes(id)));
    if (editingRef.current && ids.includes(editingRef.current)) { live.current = null; setEditing(null); }
  };

  const shifted = (ids: string[], dx: number, dy: number, doc = now()): FreePageDocument => ({
    ...doc,
    boxes: doc.boxes.map((b) => (ids.includes(b.id) ? { ...b, x: Math.max(0, b.x + dx), y: Math.max(0, b.y + dy) } : b)),
    ink: (doc.ink ?? []).map((s) => (ids.includes(s.id) ? { ...s, x: s.x + dx, y: Math.max(0, s.y + dy) } : s)),
  });

  const duplicate = (ids = selected) => {
    const cur = now();
    const boxes = cur.boxes.filter((b) => ids.includes(b.id)).map((b) => ({ ...b, id: crypto.randomUUID(), x: acrossFrom(b.x + 24, b.w), y: snap(b.y + 24) }));
    const strokes = (cur.ink ?? []).filter((s) => ids.includes(s.id)).map((s) => ({ ...s, id: crypto.randomUUID(), x: s.x + 24, y: s.y + 24 }));
    if (!boxes.length && !strokes.length) return;
    commit({ ...cur, boxes: [...cur.boxes, ...boxes], ink: [...(cur.ink ?? []), ...strokes] });
    setSelected([...boxes, ...strokes].map((o) => o.id));
  };

  /** Leaving a container empty takes it away again, so a stray click costs nothing. */
  const stopEditing = useCallback(() => {
    const pending = live.current;
    const id = pending?.id ?? editingRef.current;
    live.current = null;
    setEditing(null);
    const box = id ? pageRef.current.boxes.find((b) => b.id === id) : undefined;
    if (!box || box.image) return;
    const doc = pending?.doc ?? box.doc;
    if (empty(doc)) {
      const cur = pageRef.current;
      commit({ ...cur, boxes: cur.boxes.filter((b) => b.id !== box.id) }, false);
      setSelected((list) => list.filter((other) => other !== box.id));
      // Its own creation is the only thing that step of history holds, so it goes with it.
      if (at.current > 0 && history.current[at.current].boxes.some((b) => b.id === box.id)) {
        history.current = history.current.slice(0, at.current);
        at.current -= 1; setStep(at.current);
      }
      return;
    }
    if (pending && JSON.stringify(box.doc) !== JSON.stringify(doc)) {
      commit({ ...pageRef.current, boxes: pageRef.current.boxes.map((b) => (b.id === box.id ? { ...b, doc } : b)) });
    }
  }, [commit]);

  const ready = useCallback((live2: Editor | null) => { editor.current = live2; look(); }, [look]);

  /* ---------------------------------------------------------- pictures */

  const addPictures = async (files: File[], at2: Point) => {
    const images = files.filter((f) => /^image\//.test(f.type));
    if (!images.length) return;
    setBusy(images.length === 1 ? 'Adding the picture…' : `Adding ${images.length} pictures…`);
    try {
      const boxes: FreeBox[] = [];
      for (const [i, file] of images.entries()) {
        const webp = await webpOf(file, 1600);
        const bitmap = await createImageBitmap(webp);
        const ratio = bitmap.height / Math.max(1, bitmap.width);
        bitmap.close();
        const image = await savePageAsset(webp);
        const w = Math.min(360, width_() - 2 * GRID);
        boxes.push({ id: crypto.randomUUID(), x: acrossFrom(at2.x + i * 24, w), y: snap(at2.y + i * 24), w, h: Math.round(w * ratio), doc: BLANK, image });
      }
      const cur = now();
      commit({ ...cur, boxes: [...cur.boxes, ...boxes] });
      setSelected(boxes.map((b) => b.id));
      setTool('type');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'The picture could not be added.');
    } finally { setBusy(''); }
  };

  /** A scan lands where the page was last touched: its text in a container, the scan itself beside it. */
  const addScan = async ({ text, image }: ScanResult) => {
    const at2 = lastPoint.current, cur = now(), boxes: FreeBox[] = [];
    const w = Math.min(340, width_() - 2 * GRID);
    if (text) boxes.push({ id: crypto.randomUUID(), x: acrossFrom(at2.x, w), y: snap(at2.y), w, doc: plainDoc(text) });
    if (image) {
      const bitmap = await createImageBitmap(image);
      const ratio = bitmap.height / Math.max(1, bitmap.width);
      bitmap.close();
      const asset = await savePageAsset(image);
      const iw = Math.min(320, width_() - 2 * GRID);
      boxes.push({ id: crypto.randomUUID(), x: acrossFrom(text ? at2.x + w + 32 : at2.x, iw), y: snap(at2.y), w: iw, h: Math.round(iw * ratio), doc: BLANK, image: asset });
    }
    commit({ ...cur, boxes: [...cur.boxes, ...boxes] });
    setSelected(boxes.map((b) => b.id));
    setTool('type');
  };

  /* ----------------------------------------------------------- pointers */

  /**
   * Palm rejection, as on boards: a touch while the pen is near, just lifted
   * or down is the hand holding it, and so is a contact too broad for a
   * fingertip. Once a pen has been used, a finger scrolls the page instead of
   * drawing, the way OneNote treats a stylus.
   */
  const handIsResting = (e: PE) => {
    const t = performance.now();
    if (e.pointerType === 'pen') { penSeen.current = true; penUntil.current = t + PEN_GRACE_MS; return false; }
    return e.pointerType === 'touch' && (t < penUntil.current || Math.max(e.width || 0, e.height || 0) > PALM_PX);
  };

  const follow = (g: Gesture) => {
    gesture.current = g;
    const onMove = (m: PointerEvent) => {
      if (m.pointerType === 'pen') penUntil.current = performance.now() + PEN_GRACE_MS;
      const cur = gesture.current;
      if (!cur || m.pointerId !== cur.pointer) return;
      const p = local(m.clientX, m.clientY);
      if (cur.kind === 'ink') {
        const batch = m.getCoalescedEvents?.() ?? [];
        for (const ev of batch.length ? batch : [m]) {
          const q = local(ev.clientX, ev.clientY), last = cur.points.at(-1)!;
          if (Math.hypot(q.x - last[0], q.y - last[1]) > 0.4) cur.points.push([q.x, q.y, tool === 'marker' ? 0.7 : ev.pressure || 0.5]);
        }
        livePath.current?.setAttribute('d', pressurePath(cur.points, tool === 'marker' ? width * 4 : width));
      } else if (cur.kind === 'erase') eraseAt(p, cur);
      else if (cur.kind === 'lasso') setMarquee({ x: Math.min(cur.start.x, p.x), y: Math.min(cur.start.y, p.y), w: Math.abs(p.x - cur.start.x), h: Math.abs(p.y - cur.start.y) });
      else if (cur.kind === 'move') {
        const dx = p.x - cur.start.x, dy = p.y - cur.start.y;
        if (!cur.moved && Math.hypot(dx, dy) < 3) return;
        cur.moved = true;
        show(shifted(cur.ids, dx, dy, cur.before));
      } else if (cur.kind === 'width') {
        const box = cur.before.boxes.find((b) => b.id === cur.id)!;
        const w = Math.max(MIN_W, Math.min(width_() - box.x, box.w + p.x - cur.start.x));
        show({ ...cur.before, boxes: cur.before.boxes.map((b) => (b.id === box.id ? { ...b, w, ...(b.image && b.h ? { h: Math.round(b.h * w / b.w) } : {}) } : b)) });
      } else if (cur.kind === 'scroll' && sheet.current) {
        sheet.current.scrollTop -= m.clientY - cur.last.y;
        sheet.current.scrollLeft -= m.clientX - cur.last.x;
        cur.last = { x: m.clientX, y: m.clientY };
      }
    };
    const onUp = (u: PointerEvent) => {
      const cur = gesture.current;
      if (!cur || u.pointerId !== cur.pointer) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      gesture.current = null;
      if (u.pointerType === 'pen') penUntil.current = performance.now() + PEN_GRACE_MS;
      const cancelled = u.type === 'pointercancel';
      if (cur.kind === 'ink') {
        livePath.current?.setAttribute('d', '');
        if (cancelled || !cur.points.length) return;
        const w = tool === 'marker' ? width * 4 : width;
        const b = strokeBounds(cur.points, tool === 'marker' ? marker : ink, w, crypto.randomUUID());
        const stroke: FreeInk = { id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, color: b.color, width: w, points: b.points!, ...(tool === 'marker' ? { highlighter: true } : {}) };
        commit({ ...now(), ink: [...(now().ink ?? []), stroke] });
      } else if (cur.kind === 'erase') {
        if (cur.erased.size) commit(pageRef.current);
      } else if (cur.kind === 'lasso') {
        const r = marqueeRef.current;
        setMarquee(null);
        const box = r && r.w + r.h > 6 ? r : null;
        if (!box) { setSelected([]); return; }
        setSelected([
          ...pageRef.current.boxes.filter((b) => overlaps(box, { x: b.x, y: b.y, w: b.w, h: heightOf(b) })).map((b) => b.id),
          ...(pageRef.current.ink ?? []).filter((s) => overlaps(box, s)).map((s) => s.id),
        ]);
      } else if (cur.kind === 'move' || cur.kind === 'width') {
        if (cancelled) { show(cur.before); return; }
        if (cur.kind === 'move' && !cur.moved) return;
        // Settle onto the grid where it was let go.
        const settled = { ...pageRef.current, boxes: pageRef.current.boxes.map((b) => (cur.kind === 'width' ? (b.id === cur.id ? { ...b, w: snap(b.w) } : b) : cur.ids.includes(b.id) ? { ...b, x: snap(b.x), y: snap(b.y) } : b)) };
        commit(settled);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const eraseAt = (p: Point, g: Extract<Gesture, { kind: 'erase' }>) => {
    const r = 10;
    const hit = (pageRef.current.ink ?? []).filter((s) => overlaps({ x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 }, s) && strokeHit(s as unknown as BoardItem, p, r));
    if (!hit.length) return;
    for (const s of hit) g.erased.add(s.id);
    show({ ...pageRef.current, ink: (pageRef.current.ink ?? []).filter((s) => !g.erased.has(s.id)) });
  };

  const down = (e: PE) => {
    const target = e.target as HTMLElement;
    if (target.closest('.fp-box .ProseMirror, .fp-format, input, select, textarea, button')) return;
    if (e.button > 0 && e.pointerType === 'mouse') return;
    if (handIsResting(e)) { e.preventDefault(); return; }
    const p = local(e.clientX, e.clientY);
    lastPoint.current = p;
    const boxEl = target.closest<HTMLElement>('[data-box]');
    const id = boxEl?.dataset.box;

    // The bar along a container's top moves it (and whatever else is selected with it); the handle at its end widens it.
    if (id && target.closest('[data-edge]')) {
      e.preventDefault();
      follow({ kind: 'width', pointer: e.pointerId, start: p, id, before: now() });
      return;
    }
    if (id && target.closest('[data-grip]')) {
      e.preventDefault();
      const ids = selected.includes(id) ? selected : [id];
      if (!selected.includes(id)) setSelected([id]);
      follow({ kind: 'move', pointer: e.pointerId, start: p, ids, before: now(), moved: false });
      return;
    }
    if (tool === 'pen' || tool === 'marker') {
      e.preventDefault();
      if (e.pointerType === 'touch' && penSeen.current) { follow({ kind: 'scroll', pointer: e.pointerId, last: { x: e.clientX, y: e.clientY } }); return; }
      stopEditing();
      follow({ kind: 'ink', pointer: e.pointerId, points: [[p.x, p.y, tool === 'marker' ? 0.7 : e.pressure || 0.5]] });
      return;
    }
    if (tool === 'erase') {
      e.preventDefault();
      if (e.pointerType === 'touch' && penSeen.current) { follow({ kind: 'scroll', pointer: e.pointerId, last: { x: e.clientX, y: e.clientY } }); return; }
      const g: Gesture = { kind: 'erase', pointer: e.pointerId, erased: new Set() };
      follow(g);
      eraseAt(p, g);
      return;
    }
    if (tool === 'lasso') {
      e.preventDefault();
      stopEditing();
      const r = selectionRect();
      if (r && p.x >= r.x - 6 && p.x <= r.x + r.w + 6 && p.y >= r.y - 6 && p.y <= r.y + r.h + 6) {
        follow({ kind: 'move', pointer: e.pointerId, start: p, ids: selected, before: now(), moved: false });
        return;
      }
      if (e.pointerType === 'touch' && penSeen.current) { follow({ kind: 'scroll', pointer: e.pointerId, last: { x: e.clientX, y: e.clientY } }); return; }
      setSelected([]);
      setMarquee({ x: p.x, y: p.y, w: 0, h: 0 });
      follow({ kind: 'lasso', pointer: e.pointerId, start: p });
      return;
    }
    tap.press(e);
  };

  /** Type mode: a click on bare paper opens a container there, a click on one writes in it. */
  const click = (e: React.MouseEvent) => {
    if (tool !== 'type' || !tap.tapped(e)) return;
    const target = e.target as HTMLElement;
    if (target.closest('.fp-format, [data-grip], [data-edge], button, input, select')) return;
    const id = target.closest<HTMLElement>('[data-box]')?.dataset.box;
    if (id) {
      const box = pageRef.current.boxes.find((b) => b.id === id);
      if (!box) return;
      if (e.shiftKey) { setSelected((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id])); return; }
      setSelected([id]);
      if (!box.image && editing !== id) { stopEditing(); setEditing(id); }
      if (box.image) stopEditing();
      return;
    }
    stopEditing();
    const p = local(e.clientX, e.clientY);
    addBox(p.x, p.y);
  };

  /* --------------------------------------------------- copy, cut, paste */

  const copySelected = (e: React.ClipboardEvent) => {
    const cur = now();
    const boxes = cur.boxes.filter((b) => selected.includes(b.id));
    const strokes = (cur.ink ?? []).filter((s) => selected.includes(s.id));
    if (!boxes.length && !strokes.length) return false;
    e.preventDefault();
    const text = boxes.map((b) => richText(b.doc)).filter(Boolean).join('\n\n');
    clip.current = { boxes, ink: strokes, text };
    e.clipboardData.setData('text/plain', text || ' ');
    return true;
  };

  const paste = (e: React.ClipboardEvent) => {
    if (editing) return;
    const files = Array.from(e.clipboardData.files ?? []);
    if (files.some((f) => /^image\//.test(f.type))) { e.preventDefault(); void addPictures(files, lastPoint.current); return; }
    const text = e.clipboardData.getData('text/plain');
    const mine = clip.current;
    e.preventDefault();
    if (mine && (text === mine.text || (!mine.text && text.trim() === ''))) {
      const boxes = mine.boxes.map((b) => ({ ...b, id: crypto.randomUUID(), x: acrossFrom(b.x + 24, b.w), y: snap(b.y + 24) }));
      const strokes = mine.ink.map((s) => ({ ...s, id: crypto.randomUUID(), x: s.x + 24, y: s.y + 24 }));
      clip.current = { ...mine, boxes, ink: strokes };
      const cur = now();
      commit({ ...cur, boxes: [...cur.boxes, ...boxes], ink: [...(cur.ink ?? []), ...strokes] });
      setSelected([...boxes, ...strokes].map((o) => o.id));
      return;
    }
    if (!text.trim()) { toast('There is nothing on the clipboard to paste.'); return; }
    addBox(lastPoint.current.x, lastPoint.current.y, plainDoc(text), false);
  };

  const keys = (e: React.KeyboardEvent) => {
    const typing = !!editing;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'z' && !typing) { e.preventDefault(); undo(e.shiftKey ? 1 : -1); return; }
    if (mod && key === 'y' && !typing) { e.preventDefault(); undo(1); return; }
    if (typing) return;                                   // the container owns every other key while it has the cursor
    if (mod && key === 'a') { e.preventDefault(); setSelected([...page.boxes.map((b) => b.id), ...(page.ink ?? []).map((s) => s.id)]); return; }
    if (mod && key === 'd') { e.preventDefault(); duplicate(); return; }
    if (e.key === 'Escape') { setSelected([]); return; }
    if (e.key === 'Enter' && selected.length === 1 && page.boxes.some((b) => b.id === selected[0] && !b.image)) { e.preventDefault(); setEditing(selected[0]); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length) { e.preventDefault(); removeIds(selected); return; }
    const by = e.shiftKey ? 1 : GRID;
    const arrows: Record<string, Point> = { ArrowLeft: { x: -by, y: 0 }, ArrowRight: { x: by, y: 0 }, ArrowUp: { x: 0, y: -by }, ArrowDown: { x: 0, y: by } };
    if (arrows[e.key] && selected.length) { e.preventDefault(); commit(shifted(selected, arrows[e.key].x, arrows[e.key].y)); }
  };

  /* ------------------------------------------------ the page's own extent */

  const floor = useMemo(() => Math.max(
    page.boxes.reduce((low, b) => Math.max(low, b.y + (b.h ?? 120)), 0),
    (page.ink ?? []).reduce((low, s) => Math.max(low, s.y + s.h), 0),
  ), [page]);
  const edge = useMemo(() => Math.max(
    page.boxes.reduce((right, b) => Math.max(right, b.x + b.w), 0),
    (page.ink ?? []).reduce((right, s) => Math.max(right, s.x + s.w), 0),
  ), [page]);

  // A container measures itself once it is on the page, so the sheet knows how
  // far it reaches and the notebook list can draw a thumbnail of it.
  useEffect(() => {
    if (editing || !area.current) return;
    let changed = false;
    const boxes = pageRef.current.boxes.map((b) => {
      const node = area.current!.querySelector<HTMLElement>(`[data-box="${b.id}"]`);
      if (!node) return b;
      const h = Math.round(node.offsetHeight);
      if (Math.abs((b.h ?? 0) - h) < 3) return b;
      changed = true;
      return { ...b, h };
    });
    if (changed) commit({ ...pageRef.current, boxes }, false);
  }, [page.boxes.length, editing, commit]);

  useEffect(() => () => { if (live.current) stopEditing(); }, [stopEditing]);

  const boxMenu = (e: React.MouseEvent, box: FreeBox) => {
    e.preventDefault();
    const ids = selected.includes(box.id) ? selected : [box.id];
    setSelected(ids);
    setMenu({
      x: e.clientX, y: e.clientY, label: box.image ? 'Picture' : 'Container', items: [
        ...(box.image ? [] : [{ icon: 'edit' as const, label: 'Write in it', run: () => setEditing(box.id) }]),
        { icon: 'copy', label: 'Duplicate', shortcut: 'Ctrl D', run: () => duplicate(ids) },
        { icon: 'layers', label: 'Bring to front', run: () => { const cur = now(); commit({ ...cur, boxes: [...cur.boxes.filter((b) => !ids.includes(b.id)), ...cur.boxes.filter((b) => ids.includes(b.id))] }); } },
        { icon: 'trash', label: 'Delete', danger: true, shortcut: 'Delete', run: () => removeIds(ids) },
      ],
    });
  };

  const created = new Date(note.created_at);
  const selection = tool === 'lasso' || selected.length > 1 ? selectionRect() : null;
  const editingBox = editing ? page.boxes.find((b) => b.id === editing) : undefined;
  const tools: { id: Tool; label: string; icon: IconName }[] = [
    { id: 'type', label: 'Type', icon: 'text' },
    { id: 'pen', label: 'Pen', icon: 'pen' },
    { id: 'marker', label: 'Highlighter', icon: 'highlighter' },
    { id: 'erase', label: 'Eraser', icon: 'trash' },
    { id: 'lasso', label: 'Lasso select', icon: 'cursor' },
  ];

  return (
    <section className={'free-page tool-' + tool} aria-label="Free page">
      <div className="fp-toolbar" role="toolbar" aria-label="Page tools">
        {tools.map((t) => (
          <button key={t.id} type="button" className="fp-tool" aria-pressed={tool === t.id} title={t.label} aria-label={t.label}
            onClick={() => { setTool(t.id); if (t.id !== 'type') stopEditing(); if (t.id !== 'lasso') setSelected([]); }}>
            <Icon name={t.icon} size={17} /><span>{t.label}</span>
          </button>
        ))}
        {(tool === 'pen' || tool === 'marker') && (
          <>
            <span className="fp-divider" />
            <div className="fp-inks" role="radiogroup" aria-label={tool === 'marker' ? 'Highlighter colour' : 'Ink colour'}>
              {(tool === 'marker' ? MARKERS : INKS).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={(tool === 'marker' ? marker : ink) === c} aria-label={c === 'auto' ? 'Black or white' : c}
                  style={{ background: inkColor(c) }} onClick={() => (tool === 'marker' ? setMarker(c) : setInk(c))} />
              ))}
            </div>
            <div className="fp-widths" role="radiogroup" aria-label="Thickness">
              {WIDTHS.map((w) => (
                <button key={w.label} type="button" role="radio" aria-checked={width === w.px} aria-label={w.label} title={w.label} onClick={() => setWidth(w.px)}>
                  <i style={{ width: w.px * 2 + 2, height: w.px * 2 + 2 }} />
                </button>
              ))}
            </div>
          </>
        )}
        <span className="fp-divider" />
        <button type="button" className="fp-tool" title="Insert a picture" aria-label="Insert a picture" disabled={!!busy} onClick={() => picker.current?.click()}><Icon name="photo" size={17} /><span>Picture</span></button>
        <button type="button" className="fp-tool" title="Scan handwriting from a photo into text" aria-label="Scan writing" disabled={!!busy} onClick={() => { stopEditing(); setScanning(true); }}><Icon name="camera" size={17} /><span>Scan</span></button>
        <select className="fp-paper" aria-label="Paper" value={page.paper ?? 'plain'} onChange={(e) => commit({ ...now(), paper: e.target.value as FreePageDocument['paper'] })}>
          <option value="plain">Plain paper</option>
          <option value="lines">Rule lines</option>
          <option value="grid">Grid</option>
        </select>
        <span className="fp-divider" />
        <button type="button" className="fp-tool" aria-label="Undo" title="Undo (Ctrl Z)" disabled={step === 0} onClick={() => undo(-1)}><Icon name="undo" size={17} /></button>
        <button type="button" className="fp-tool" aria-label="Redo" title="Redo (Ctrl Y)" disabled={step === history.current.length - 1} onClick={() => undo(1)}><Icon name="redo" size={17} /></button>
        <button type="button" className="fp-tool" aria-label="Delete selection" title="Delete (Del)" disabled={!selected.length} onClick={() => removeIds(selected)}><Icon name="trash" size={17} /></button>
        {busy ? <span className="fp-status">{busy}</span> : <PageSaveStatus id={note.id} waiting={waiting}/>}
      </div>

      <div ref={sheet} className="fp-sheet" tabIndex={0} aria-label="Page"
        onKeyDown={keys}
        onCopy={(e) => { if (!editing) copySelected(e); }}
        onCut={(e) => { if (editing) return; if (copySelected(e)) removeIds(selected); }}
        onPaste={paste}
        onDragOver={(e) => { if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault(); }}
        onDrop={(e) => { const files = Array.from(e.dataTransfer.files); if (!files.length) return; e.preventDefault(); void addPictures(files, local(e.clientX, e.clientY)); }}>
        <header className="fp-head">
          <input className="fp-title" aria-label="Page title" placeholder="Untitled page" value={draft.title} onChange={(e) => change({ title: e.target.value })} />
          <p className="fp-when">
            <span>{created.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            <span>{created.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          </p>
        </header>
        <div ref={area} className={'fp-area paper-' + (page.paper ?? 'plain')} onPointerDown={down} onClick={click}
          style={{ height: Math.max(floor + ROOM_BELOW, 520), width: edge + GRID * 2 }}>
          {page.boxes.map((box) => (
            <div key={box.id} data-box={box.id}
              className={'fp-box' + (box.image ? ' is-picture' : '') + (box.tint ? ' is-tinted' : '') + (selected.includes(box.id) ? ' is-selected' : '') + (editing === box.id ? ' is-editing' : '')}
              style={{ left: box.x, top: box.y, width: box.w, '--tint': box.tint ?? 'transparent' } as CSSProperties}
              onContextMenu={(e) => boxMenu(e, box)}>
              <div className="fp-bar" data-grip title="Drag to move">
                <span className="fp-dots" aria-hidden="true" />
                <span className="fp-edge" data-edge title="Drag to make it wider or narrower" aria-hidden="true">‹›</span>
              </div>
              {box.image
                ? <div className="fp-picture" style={box.h ? { height: box.h } : undefined}><BoxImage asset={box.image} /></div>
                : editing === box.id
                  ? <BoxEditor doc={box.doc} onReady={ready} onChange={(doc) => { live.current = { id: box.id, doc }; }} onDone={stopEditing} onLook={look} />
                  : <BoxBody doc={box.doc} />}
            </div>
          ))}

          <svg className="fp-ink" aria-hidden="true">
            {(page.ink ?? []).map((s) => (
              <path key={s.id} d={outlineOf(s)} transform={`translate(${s.x},${s.y})`} fill={inkColor(s.color)} opacity={s.highlighter ? 0.38 : 1}
                className={selected.includes(s.id) ? 'is-selected' : undefined} />
            ))}
            <path ref={livePath} fill={inkColor(tool === 'marker' ? marker : ink)} opacity={tool === 'marker' ? 0.38 : 1} />
          </svg>

          {marquee && <div className="fp-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
          {selection && selected.length > 0 && (
            <div className="fp-selection" style={{ left: selection.x - 6, top: selection.y - 6, width: selection.w + 12, height: selection.h + 12 }}>
              {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((h) => <i key={h} className={'is-' + h} />)}
            </div>
          )}

          {editingBox && editor.current && (
            // Over the container when there is room, reaching up over the page title if it must; under it when it is at the very top.
            <div className="fp-format-anchor" style={{ left: editingBox.x, top: editingBox.y - 86 >= -96 ? editingBox.y - 86 : editingBox.y + heightOf(editingBox) + 10 }}>
              <FormatBar editor={editor.current} />
            </div>
          )}

          {!page.boxes.length && !(page.ink ?? []).length && (
            <p className="fp-blank">Click anywhere and start typing.<small>Pick the pen to write by hand, the lasso to gather things up. Paste or drop pictures straight onto the page.</small></p>
          )}
        </div>
      </div>
      <input ref={picker} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple
        onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; if (files.length) void addPictures(files, lastPoint.current); }} />
      {menu && <ContextMenu x={menu.x} y={menu.y} kind="notes" label={menu.label} items={menu.items} onClose={() => setMenu(null)} />}
      {scanning && <ScanSheet doneLabel="Add to this page" onClose={() => setScanning(false)} onDone={addScan} />}
    </section>
  );
}
