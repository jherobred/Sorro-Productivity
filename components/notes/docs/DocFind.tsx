'use client';

import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { Icon } from '@/components/Icon';
import { useOverlayBack } from '@/lib/nav';
import { FIND } from './extensions';

/**
 * Find (Ctrl+F) and Find and replace (Ctrl+H). Matches are highlighted in the
 * page as you type; replacing goes through the editor, so one Ctrl+Z undoes a
 * whole Replace all.
 */
export function DocFind({ editor, replace, canReplace, onReplaceToggle, onClose }: {
  editor: Editor;
  replace: boolean;
  canReplace: boolean;
  onReplaceToggle: (on: boolean) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(() => editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ').slice(0, 80));
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [replacement, setReplacement] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useOverlayBack(true, () => close.current());

  const found = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return { count: 0, current: 0 };
      const s = FIND.getState(e.state);
      return { count: s?.matches.length ?? 0, current: s?.current ?? 0 };
    },
  });

  useEffect(() => { input.current?.focus(); input.current?.select(); }, [replace]);
  useEffect(() => { editor.commands.setSearch(query, caseSensitive); }, [editor, query, caseSensitive]);
  useEffect(() => () => { if (!editor.isDestroyed) editor.commands.setSearch('', false); }, [editor]);

  const step = (delta: number) => editor.commands.stepSearch(delta);

  return (
    <div className="doc-find" role="search" aria-label={replace ? 'Find and replace' : 'Find in document'}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); editor.commands.focus(); } }}>
      <div className="doc-find-row">
        <Icon name="search" size={16} />
        <input ref={input} value={query} placeholder="Find in document" aria-label="Find"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); } }} />
        <span className="doc-find-count" aria-live="polite">{query ? (found.count ? `${found.current + 1} of ${found.count}` : '0 of 0') : ''}</span>
        <button type="button" className="doc-tool" data-doc-tip="Previous (Shift+Enter)" aria-label="Previous match" disabled={!found.count} onClick={() => step(-1)}><Icon name="chevronUp" size={16} /></button>
        <button type="button" className="doc-tool" data-doc-tip="Next (Enter)" aria-label="Next match" disabled={!found.count} onClick={() => step(1)}><Icon name="chevronDown" size={16} /></button>
        {canReplace && <button type="button" className={'doc-tool' + (replace ? ' is-active' : '')} data-doc-tip="Find and replace (Ctrl+H)" aria-label="Show replace" aria-pressed={replace} onClick={() => onReplaceToggle(!replace)}><Icon name="moreVert" size={16} /></button>}
        <button type="button" className="doc-tool" data-doc-tip="Close (Esc)" aria-label="Close find" onClick={() => { onClose(); editor.commands.focus(); }}><Icon name="close" size={16} /></button>
      </div>
      {replace && canReplace && (
        <div className="doc-find-replace">
          <input value={replacement} placeholder="Replace with" aria-label="Replace with" onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); editor.commands.replaceCurrent(replacement); } }} />
          <label className="doc-check"><input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />Match case</label>
          <div className="doc-find-actions">
            <button type="button" className="doc-button" disabled={!found.count} onClick={() => editor.commands.replaceCurrent(replacement)}>Replace</button>
            <button type="button" className="doc-button is-primary" disabled={!found.count} onClick={() => editor.commands.replaceAllMatches(replacement)}>Replace all</button>
          </div>
        </div>
      )}
    </div>
  );
}
