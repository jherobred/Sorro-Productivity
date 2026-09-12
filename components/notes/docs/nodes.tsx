'use client';

import { useEffect, useRef, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { syncPageAsset, usePageAssetUrl } from '@/lib/pageAssets';

/* --------------------------------------------------------------- maths */

type MathOptions = { onEdit: (latex: string, apply: (latex: string) => void) => void };

function MathView({ node, updateAttributes, selected, extension, editor }: ReactNodeViewProps) {
  const block = node.type.name === 'mathBlock';
  const latex = String(node.attrs.latex ?? '');
  const [html, setHtml] = useState('');
  useEffect(() => {
    let live = true;
    void import('katex').then(({ default: katex }) => {
      if (!live) return;
      try { setHtml(katex.renderToString(latex || '\\square', { displayMode: block, throwOnError: false })); }
      catch { setHtml(''); }
    });
    return () => { live = false; };
  }, [latex, block]);
  const edit = () => { if (editor.isEditable) (extension.options as MathOptions).onEdit(latex, (next) => updateAttributes({ latex: next })); };
  return (
    <NodeViewWrapper as={block ? 'div' : 'span'} className={'doc-math' + (block ? ' is-block' : '') + (selected ? ' is-selected' : '')}
      onDoubleClick={edit} title={editor.isEditable ? 'Double-click to edit this equation' : undefined} data-drag-handle>
      {/* KaTeX escapes the source it is given and runs with trust off, so its markup is safe to place. */}
      {html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : <code>{latex}</code>}
    </NodeViewWrapper>
  );
}

const mathAttributes = {
  latex: {
    default: '',
    parseHTML: (el: HTMLElement) => el.getAttribute('data-latex') ?? '',
    renderHTML: (a: Record<string, unknown>) => ({ 'data-latex': a.latex }),
  },
};

export const MathInline = Node.create<MathOptions>({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addOptions() { return { onEdit: () => {} }; },
  addAttributes() { return mathAttributes; },
  parseHTML() { return [{ tag: 'span[data-type="math-inline"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'math-inline' })]; },
  addNodeView() { return ReactNodeViewRenderer(MathView); },
});

export const MathBlock = Node.create<MathOptions>({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,
  addOptions() { return { onEdit: () => {} }; },
  addAttributes() { return mathAttributes; },
  parseHTML() { return [{ tag: 'div[data-type="math-block"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'math-block' })]; },
  addNodeView() { return ReactNodeViewRenderer(MathView); },
});

/* -------------------------------------------------------------- images */

/**
 * An image in the flow of text, as Google Docs places them by default.
 *
 * Photos added from this device are private page assets: the document keeps
 * `localId`/`path`, never a signed URL, and the view resolves them the same way
 * boards do. Only images that were already a public address keep `src`.
 */
function ImageView({ node, updateAttributes, selected, editor }: ReactNodeViewProps) {
  const { src, localId, path, name, alt, width } = node.attrs as Record<string, string | number | null>;
  const asset = !src && localId ? { localId: String(localId), path: path ? String(path) : undefined, name: String(name || 'image') } : undefined;
  const { url, error } = usePageAssetUrl(asset);
  const shown = (src ? String(src) : null) || url;
  const frame = useRef<HTMLSpanElement>(null);
  const [broken, setBroken] = useState(false);

  // An image added while offline only exists on this device. Upload it the
  // next time the document is open for editing, and remember where it went.
  useEffect(() => {
    if (!asset || asset.path || !url || !editor.isEditable) return;
    let live = true;
    syncPageAsset(asset).then((synced) => { if (live && synced.path) updateAttributes({ path: synced.path }); }).catch(() => {});
    return () => { live = false; };
  }, [asset?.localId, asset?.path, url, editor.isEditable]); // eslint-disable-line react-hooks/exhaustive-deps

  const resize = (event: React.PointerEvent) => {
    const el = frame.current;
    if (!el) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = el.offsetWidth;
    // clientX is in screen pixels and the page may be zoomed; convert back to page pixels.
    const scale = el.getBoundingClientRect().width / Math.max(1, el.offsetWidth) || 1;
    let next = startWidth;
    const move = (e: PointerEvent) => {
      next = Math.max(40, Math.round(startWidth + (e.clientX - startX) / scale));
      el.style.width = `${next}px`;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      updateAttributes({ width: next });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  return (
    <NodeViewWrapper as="span" className={'doc-image' + (selected ? ' is-selected' : '')} data-drag-handle>
      <span ref={frame} className="doc-image-frame" style={{ width: width ? `${width}px` : undefined }}>
        {shown && !broken
          ? <img src={shown} alt={String(alt || name || '')} draggable={false} onError={() => setBroken(true)} />
          : <span className="doc-image-missing">{broken ? 'This image could not be loaded.' : error || 'Loading image…'}</span>}
        {selected && editor.isEditable && <span className="doc-image-handle" onPointerDown={resize} aria-hidden />}
      </span>
    </NodeViewWrapper>
  );
}

const dataAttr = (name: string) => ({
  default: null,
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`),
  renderHTML: (a: Record<string, unknown>) => (a[toCamel(name)] ? { [`data-${name}`]: a[toCamel(name)] } : {}),
});
function toCamel(name: string) { return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()); }

export const DocImage = Node.create({
  name: 'image',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el) => {
          const value = el.getAttribute('src') ?? '';
          return /^(https?:|data:image\/)/i.test(value) ? value : null;
        },
        renderHTML: (a) => (a.src ? { src: a.src } : {}),
      },
      alt: { default: '', parseHTML: (el) => el.getAttribute('alt') ?? '', renderHTML: (a) => ({ alt: a.alt || '' }) },
      width: {
        default: null,
        parseHTML: (el) => { const w = parseInt(el.getAttribute('width') || el.style.width, 10); return Number.isFinite(w) && w > 0 ? w : null; },
        renderHTML: (a) => (a.width ? { width: a.width } : {}),
      },
      localId: dataAttr('local-id'),
      path: dataAttr('path'),
      name: dataAttr('name'),
    };
  },
  parseHTML() { return [{ tag: 'img[src]' }, { tag: 'img[data-local-id]' }, { tag: 'img[data-path]' }]; },
  renderHTML({ HTMLAttributes }) { return ['img', HTMLAttributes]; },
  addNodeView() { return ReactNodeViewRenderer(ImageView); },
});
