'use client';

import { useRef } from 'react';
import { DPI, pagePixels, type DocPage } from '@/lib/docFormat';

const snap = (inches: number) => Math.round(inches * 16) / 16;

/**
 * The ruler above the page, in inches. The grey ends are the margins; drag
 * their edges to change them. The two blue markers set the current
 * paragraph's indent: the bar is the first line, the triangle every line.
 */
export function DocRuler({ page, zoom, indent, firstLine, editable, onMargins, onIndents }: {
  page: DocPage;
  zoom: number;
  indent: number;
  firstLine: number;
  editable: boolean;
  onMargins: (left: number, right: number) => void;
  onIndents: (indent: number, firstLine: number) => void;
}) {
  const px = pagePixels(page);
  const width = px.width * zoom;
  const inches = px.width / DPI;
  const track = useRef<HTMLDivElement>(null);
  const bodyWidth = px.width - px.left - px.right;

  const drag = (event: React.PointerEvent<HTMLElement>, apply: (dxPage: number) => void) => {
    if (!editable) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const start = event.clientX;
    const scale = track.current ? track.current.getBoundingClientRect().width / width : 1;
    const move = (e: PointerEvent) => apply((e.clientX - start) / (zoom * scale));
    const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  const ticks: React.ReactNode[] = [];
  for (let i = 0; i <= inches * 8; i++) {
    const x = (i / 8) * DPI * zoom;
    const whole = i % 8 === 0, half = i % 4 === 0;
    ticks.push(<line key={i} x1={x} x2={x} y1={whole ? 4 : half ? 9 : 12} y2={17} />);
    if (whole && i > 0 && i < inches * 8) ticks.push(<text key={'n' + i} x={x} y={10}>{i / 8}</text>);
  }

  const start = { left: page.margins.left, right: page.margins.right, indent, firstLine };
  const nudge = (key: 'left' | 'right' | 'indent' | 'first', delta: number) => {
    if (key === 'left') onMargins(Math.max(0, Math.min(snap(page.margins.left + delta), inches - page.margins.right - 1)), page.margins.right);
    if (key === 'right') onMargins(page.margins.left, Math.max(0, Math.min(snap(page.margins.right + delta), inches - page.margins.left - 1)));
    if (key === 'indent') onIndents(Math.max(0, indent + delta * DPI), firstLine);
    if (key === 'first') onIndents(indent, firstLine + delta * DPI);
  };
  const keys = (key: 'left' | 'right' | 'indent' | 'first') => (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = (e.shiftKey ? 0.5 : 0.125) * (e.key === 'ArrowLeft' ? -1 : 1);
    nudge(key, key === 'right' ? -step : step);
  };

  return (
    <div className="doc-ruler" role="group" aria-label="Ruler">
      <div ref={track} className="doc-ruler-track" style={{ width }}>
        <span className="doc-ruler-margin" style={{ left: 0, width: px.left * zoom }} />
        <span className="doc-ruler-margin" style={{ right: 0, width: px.right * zoom }} />
        <svg width={width} height={18} aria-hidden>{ticks}</svg>
        <button type="button" className="doc-ruler-edge" style={{ left: px.left * zoom }} disabled={!editable}
          aria-label={`Left margin, ${page.margins.left} inches`} data-doc-tip="Left margin"
          onKeyDown={keys('left')}
          onPointerDown={(e) => drag(e, (dx) => onMargins(Math.max(0, Math.min(snap(start.left + dx / DPI), inches - start.right - 1)), start.right))} />
        <button type="button" className="doc-ruler-edge" style={{ left: (px.width - px.right) * zoom }} disabled={!editable}
          aria-label={`Right margin, ${page.margins.right} inches`} data-doc-tip="Right margin"
          onKeyDown={keys('right')}
          onPointerDown={(e) => drag(e, (dx) => onMargins(start.left, Math.max(0, Math.min(snap(start.right - dx / DPI), inches - start.left - 1))))} />
        <button type="button" className="doc-ruler-first" style={{ left: (px.left + indent + firstLine) * zoom }} disabled={!editable}
          aria-label="First line indent" data-doc-tip="First line indent" onKeyDown={keys('first')}
          onPointerDown={(e) => drag(e, (dx) => onIndents(start.indent, Math.max(-start.indent, Math.min(bodyWidth - start.indent, Math.round((start.firstLine + dx) / 6) * 6))))} />
        <button type="button" className="doc-ruler-indent" style={{ left: (px.left + indent) * zoom }} disabled={!editable}
          aria-label="Left indent" data-doc-tip="Left indent" onKeyDown={keys('indent')}
          onPointerDown={(e) => drag(e, (dx) => onIndents(Math.max(0, Math.min(bodyWidth - 24, Math.round((start.indent + dx) / 6) * 6)), start.firstLine))} />
      </div>
    </div>
  );
}

/** The ruler down the left side, one per page, with the top and bottom margins shaded. */
export function DocVerticalRuler({ page, zoom, pages, gap }: { page: DocPage; zoom: number; pages: number; gap: number }) {
  const px = pagePixels(page);
  const inches = px.height / DPI;
  const ticks: React.ReactNode[] = [];
  for (let i = 0; i <= inches * 8; i++) {
    const y = (i / 8) * DPI * zoom;
    const whole = i % 8 === 0, half = i % 4 === 0;
    ticks.push(<line key={i} y1={y} y2={y} x1={whole ? 4 : half ? 9 : 12} x2={17} />);
    if (whole && i > 0 && i < inches * 8) ticks.push(<text key={'n' + i} y={y + 3} x={8}>{i / 8}</text>);
  }
  return (
    <div className="doc-vruler" aria-hidden style={{ height: (pages * px.height + (pages - 1) * gap) * zoom }}>
      {Array.from({ length: pages }, (_, p) => (
        <div key={p} className="doc-vruler-page" style={{ top: p * (px.height + gap) * zoom, height: px.height * zoom }}>
          <span className="doc-ruler-margin" style={{ top: 0, height: px.top * zoom }} />
          <span className="doc-ruler-margin" style={{ bottom: 0, height: px.bottom * zoom }} />
          <svg width={18} height={px.height * zoom}>{ticks}</svg>
        </div>
      ))}
    </div>
  );
}
