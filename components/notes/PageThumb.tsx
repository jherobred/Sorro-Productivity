'use client';

import { memo, useMemo } from 'react';
import { pageThumb, type Thumb, type ThumbBox, type ThumbShape } from '@/lib/pageThumb';
import { codeTokens } from '@/lib/codeTokens';

/** A stable lean for each page, so the binder sheets sit a little askew like the polaroids. */
export function thumbTilt(id: string): number {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return ((Math.abs(hash) % 9) - 4) / 2;
}

function Shapes({ box, shapes }: { box: ThumbBox; shapes: ThumbShape[] }) {
  // Board coordinates can span thousands of units. A pen width in those units
  // disappears at thumbnail size, so every line is at least a visible fraction
  // of the sheet.
  const minimum = box.w / 60;
  return (
    <>
      {shapes.map((shape, i) => {
        if (shape.type === 'stroke') {
          return <polyline key={i} points={shape.points} fill="none" stroke={shape.color} strokeOpacity={shape.opacity}
            strokeWidth={Math.max(shape.width, minimum)} strokeLinecap="round" strokeLinejoin="round" />;
        }
        if (shape.type === 'image') {
          return (
            <g key={i}>
              <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={minimum} fill="#d7d2c6" />
              <path d={`M${shape.x + shape.w * 0.12} ${shape.y + shape.h * 0.82} L${shape.x + shape.w * 0.4} ${shape.y + shape.h * 0.45} L${shape.x + shape.w * 0.6} ${shape.y + shape.h * 0.66} L${shape.x + shape.w * 0.72} ${shape.y + shape.h * 0.55} L${shape.x + shape.w * 0.88} ${shape.y + shape.h * 0.82} Z`} fill="#aaa497" />
            </g>
          );
        }
        if (shape.type === 'card') {
          const head = Math.min(shape.h * 0.3, 46);
          return (
            <g key={i}>
              <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={minimum} fill="#ffffff" stroke="#c9c6bd" strokeWidth={minimum / 3} />
              <rect x={shape.x} y={shape.y} width={shape.w} height={head} rx={minimum} fill="#345cff" />
            </g>
          );
        }
        const rows = Math.max(1, Math.min(4, Math.floor(shape.text.length / 20) + 1));
        return (
          <g key={i}>
            <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={minimum / 2} fill={shape.fill} />
            {shape.text && Array.from({ length: rows }, (_, r) => (
              <rect key={r} x={shape.x + shape.w * 0.12} y={shape.y + shape.h * (0.22 + r * 0.17)} width={shape.w * (r === rows - 1 ? 0.5 : 0.76)} height={Math.max(minimum * 0.6, shape.h * 0.06)} rx={minimum / 4} fill="#28251d" fillOpacity={0.45} />
            ))}
          </g>
        );
      })}
    </>
  );
}

function Content({ thumb }: { thumb: Thumb }) {
  switch (thumb.kind) {
    case 'document':
      return <>{thumb.lines.map((line, i) => <span key={i} className={'thumb-line tone-' + line.tone}>{line.text}</span>)}</>;
    case 'board':
      return thumb.box ? (
        <svg className="thumb-svg" viewBox={`${thumb.box.x} ${thumb.box.y} ${thumb.box.w} ${thumb.box.h}`} preserveAspectRatio="xMidYMid meet">
          <Shapes box={thumb.box} shapes={thumb.shapes} />
        </svg>
      ) : null;
    case 'pdf': {
      const { box } = thumb;
      return (
        <>
          <svg className="thumb-svg" viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} preserveAspectRatio="xMidYMid meet">
            <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#ffffff" />
            {Array.from({ length: 18 }, (_, r) => (
              <rect key={r} x={box.x + box.w * 0.1} y={box.y + box.h * (0.1 + r * 0.045)} width={box.w * (r % 5 === 4 ? 0.46 : 0.8)} height={box.h * 0.012} fill="#c9c7c1" />
            ))}
            <Shapes box={box} shapes={thumb.shapes} />
          </svg>
          <span className="thumb-pdf-tag">PDF</span>
        </>
      );
    }
    case 'journal':
      return (
        <>
          {thumb.lines.map((line, i) => <span key={i} className="thumb-line tone-journal">{line}</span>)}
          {thumb.photos > 0 && <span className="thumb-polaroid"><i /></span>}
        </>
      );
    case 'code':
      return (
        <>
          {thumb.lines.map((line, i) => (
            <span key={i} className="thumb-code-line">
              {codeTokens(line, thumb.language).map((token, t) => <span key={t} className={token.kind ? 'java-' + token.kind : undefined}>{token.text}</span>)}
            </span>
          ))}
        </>
      );
    case 'checklist':
      return <>{thumb.items.map((item, i) => <span key={i} className={'thumb-check' + (item.done ? ' is-done' : '')}><i />{item.text}</span>)}</>;
    case 'flashcards':
      return (
        <>
          <span className="thumb-card is-back" />
          <span className="thumb-card">{thumb.front}</span>
        </>
      );
    case 'cornell':
      return (
        <span className="thumb-cornell">
          <span>{thumb.cues.map((cue, i) => <span key={i}>{cue}</span>)}</span>
          <span>{thumb.notes.map((note, i) => <span key={i}>{note}</span>)}</span>
          <span>{thumb.summary}</span>
        </span>
      );
  }
}

/**
 * A page in the notebook list: a small copy of its first sheet on a punched
 * binder page. Decoration only. It sits inside the row's button, so it takes
 * no focus and is hidden from screen readers, which already hear the title.
 */
export const PageThumb = memo(function PageThumb({ body, tilt }: { body: string; tilt: number }) {
  const thumb = useMemo(() => pageThumb(body), [body]);
  return (
    <span className="binder-page" aria-hidden="true" style={{ '--tilt': `${tilt}deg` } as React.CSSProperties}>
      <span className="binder-holes"><i /><i /><i /></span>
      <span className={'page-thumb thumb-' + thumb.kind}>
        <span className="page-thumb-sheet"><Content thumb={thumb} /></span>
      </span>
    </span>
  );
});
