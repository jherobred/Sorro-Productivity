'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useOverlayBack } from '@/lib/nav';
import { wordCount, taskCount } from '@/lib/md';
import { countMatches, replaceAll, readingMinutes } from '@/lib/findReplace';

/**
 * Find, replace and document statistics for the Markdown editor.
 *
 * Replacement is a plain string operation on the note body, routed back
 * through the editor's single mutation path, so a replace-all lands in the
 * undo history like any other edit and Ctrl+Z takes it back whole. That is
 * what makes replacing across a whole document safe to offer: the escape
 * hatch already exists.
 *
 * There is deliberately no outline here. Blocks carry no line anchor, so an
 * outline could list the headings but never scroll to one, and a list of
 * headings you cannot click is furniture.
 */

export function DocumentTools({
  body, onChangeBody, onClose,
}: {
  body: string;
  onChangeBody: (next: string) => void;
  onClose: () => void;
}) {
  const [term, setTerm] = useState('');
  const [into, setInto] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [said, setSaid] = useState('');
  const firstField = useRef<HTMLInputElement>(null);

  useOverlayBack(true, onClose);
  useEffect(() => { firstField.current?.focus(); }, []);

  const matches = useMemo(
    () => countMatches(body, term, caseSensitive),
    [body, term, caseSensitive],
  );

  const words = useMemo(() => wordCount(body), [body]);
  const tasks = useMemo(() => taskCount(body), [body]);

  const runReplaceAll = () => {
    if (!term || matches === 0) return;
    onChangeBody(replaceAll(body, term, into, caseSensitive));
    setSaid(`Replaced ${matches} ${matches === 1 ? 'match' : 'matches'}. Undo takes it back.`);
  };

  return (
    <div className="doc-tools" role="dialog" aria-label="Find, replace and statistics">
      <div className="doc-tools-head">
        <strong>Find in this page</strong>
        <button onClick={onClose} aria-label="Close find and replace">
          <Icon name="close" size={15} />
        </button>
      </div>

      <label className="doc-tools-field">
        <span>Find</span>
        <input
          ref={firstField}
          className="studio-input"
          value={term}
          placeholder="Text to look for"
          onChange={(e) => { setTerm(e.target.value); setSaid(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') runReplaceAll(); }}
        />
      </label>

      <label className="doc-tools-field">
        <span>Replace with</span>
        <input
          className="studio-input"
          value={into}
          placeholder="Leave empty to delete the matches"
          onChange={(e) => { setInto(e.target.value); setSaid(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') runReplaceAll(); }}
        />
      </label>

      <div className="doc-tools-row">
        <label className="doc-tools-check">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
          />
          Match case
        </label>
        <span className="doc-tools-count" role="status">
          {term ? `${matches} ${matches === 1 ? 'match' : 'matches'}` : 'Type to search'}
        </span>
        <button
          className="studio-button primary"
          disabled={!term || matches === 0}
          onClick={runReplaceAll}
        >
          Replace all
        </button>
      </div>

      {said && <p className="doc-tools-said" role="status">{said}</p>}

      <dl className="doc-tools-stats">
        <div><dt>Words</dt><dd>{words.toLocaleString()}</dd></div>
        <div><dt>Characters</dt><dd>{body.length.toLocaleString()}</dd></div>
        <div><dt>Reading time</dt><dd>{readingMinutes(words)} min</dd></div>
        <div><dt>Tasks</dt><dd>{tasks.done} of {tasks.total}</dd></div>
      </dl>
    </div>
  );
}
