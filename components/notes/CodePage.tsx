'use client';
import { useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { readStudy, writeStudy, type CodeDocument } from '@/lib/pageKinds';
import { codeTokens, CODE_LANGUAGES, isRunnable, previewDocument } from '@/lib/codeTokens';
import { typeCharacter, deleteBackward, newline, type Edit } from '@/lib/codeEdit';
import type { Note } from '@/lib/notes';
import { usePageDraft } from './usePageDraft';

const EXTENSION: Record<string, string> = { java: 'java', html: 'html', css: 'css', javascript: 'js' };

/**
 * The code page.
 *
 * Runnable means the browser itself can render it. HTML, CSS and JavaScript
 * are run in a sandboxed iframe with no same-origin access, so the preview
 * cannot reach the note, the session or storage. Java has no browser runtime,
 * so there is no Run button on a Java page rather than a button that pretends.
 */
export function CodePage({ note, onSave }: { note: Note; onSave: (v: { title: string; body: string }) => void }) {
  const { draft, change, waiting } = usePageDraft(note, onSave);
  const page = readStudy(draft.body) as CodeDocument;

  const [message, setMessage] = useState('');
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [wrap, setWrap] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const paint = useRef<HTMLPreElement>(null), numbers = useRef<HTMLDivElement>(null), area = useRef<HTMLTextAreaElement>(null);

  const language = page.language || 'java';
  const runnable = isRunnable(language);
  const name = (draft.title || 'Untitled').replace(/\.[a-z]+$/i, '');
  const filename = name + '.' + (EXTENSION[language] ?? 'txt');

  /** A language saved before this picker existed still appears in it. */
  const languages = useMemo(() => {
    const known = CODE_LANGUAGES.map((l) => ({ id: l.id as string, name: l.name }));
    return known.some((l) => l.id === language) ? known : [...known, { id: language, name: language }];
  }, [language]);

  const write = (fields: Partial<CodeDocument>) => change({ body: writeStudy({ ...page, ...fields }) });
  const save = (code: string) => write({ code });

  /** Apply a pairing edit and put the caret where that edit says it belongs. */
  const applyEdit = (edit: Edit) => {
    save(edit.code);
    requestAnimationFrame(() => {
      const el = area.current;
      if (el) el.selectionStart = el.selectionEnd = edit.caret;
    });
  };

  const run = () => { setPreview(previewDocument(page.code, language)); setMessage(''); };

  return (
    <section className="study-page code-page">
      <div className="page-edit-header">
        <input className="page-title-input note-editor-clean-input" aria-label="Page title"
          value={draft.title} onChange={(e) => change({ title: e.target.value })} />
        <span className="page-save-status">{waiting ? 'Saving changes…' : 'Autosave on'}</span>
      </div>

      <div className="java-workspace">
        <div className="java-tabs">
          <span><Icon name="code" size={16} />{filename}</span>
          <div>
            <label className="code-language">
              <span className="sronly">Language</span>
              <select value={language} onChange={(e) => { setPreview(null); write({ language: e.target.value }); }}>
                {languages.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            {runnable && <button onClick={run} className="code-run">Run</button>}
            {preview !== null && <button onClick={() => setPreview(null)}>Close preview</button>}
            <button onClick={() => setWrap((v) => !v)} aria-pressed={wrap}>Word wrap</button>
            <button onClick={async () => {
              try { await navigator.clipboard.writeText(page.code); setMessage('Code copied'); }
              catch { setMessage('Select your code and copy with your keyboard.'); }
            }}>Copy</button>
            <button onClick={() => {
              const url = URL.createObjectURL(new Blob([page.code], { type: 'text/plain' }));
              const a = document.createElement('a');
              a.href = url; a.download = filename.replace(/[^a-zA-Z0-9_.-]/g, '_'); a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}>Download</button>
          </div>
        </div>

        <div className="java-breadcrumb">src <span>›</span> {filename}</div>

        <div className={'code-split' + (preview !== null ? ' has-preview' : '')}>
          <div className={'java-editor ' + (wrap ? 'wrap' : '')}>
            <div ref={numbers} className="java-numbers" aria-hidden>
              {page.code.split('\n').map((_, i) => <div key={i}>{i + 1}</div>)}
            </div>
            <div className="java-code-area">
              <pre aria-hidden ref={paint} className="java-painted">
                {codeTokens(page.code, language).map((t, i) =>
                  <span key={i} className={t.kind ? 'java-' + t.kind : undefined}>{t.text}</span>)}
                {'\n'}
              </pre>
              <textarea ref={area} aria-label={`${language} source code`} className="java-source"
                spellCheck={false} autoCapitalize="off" autoCorrect="off" value={page.code}
                onChange={(e) => save(e.target.value)}
                onBeforeInput={(e) => {
                  const typed = (e.nativeEvent as InputEvent).data;
                  if (!typed || typed.length !== 1) return;
                  const el = e.currentTarget;
                  const edit = typeCharacter(el.value, el.selectionStart, el.selectionEnd, typed);
                  if (!edit) return;
                  e.preventDefault();
                  applyEdit(edit);
                }}
                onSelect={(e) => {
                  const el = e.currentTarget;
                  const before = el.value.slice(0, el.selectionStart);
                  setCursor({ line: before.split('\n').length, column: before.length - before.lastIndexOf('\n') });
                }}
                onScroll={(e) => {
                  if (paint.current) { paint.current.scrollTop = e.currentTarget.scrollTop; paint.current.scrollLeft = e.currentTarget.scrollLeft; }
                  if (numbers.current) numbers.current.scrollTop = e.currentTarget.scrollTop;
                }}
                onKeyDown={(e) => {
                  const el = e.currentTarget, code = el.value, start = el.selectionStart, end = el.selectionEnd;
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    applyEdit({ code: code.slice(0, start) + '    ' + code.slice(end), caret: start + 4 });
                    return;
                  }
                  if (e.key === 'Enter') {
                    const edit = newline(code, start, end);
                    if (edit) { e.preventDefault(); applyEdit(edit); }
                    return;
                  }
                  if (e.key === 'Backspace') {
                    const edit = deleteBackward(code, start, end);
                    if (edit) { e.preventDefault(); applyEdit(edit); }
                  }
                }} />
            </div>
          </div>

          {preview !== null && (
            <div className="code-preview">
              <div className="code-preview-bar">
                <span>{language === 'css' ? 'Preview on a sample page' : 'Preview'}</span>
                <button onClick={run} aria-label="Run again"><Icon name="undo" size={14} />Re-run</button>
              </div>
              <iframe title="Code preview" className="code-preview-frame" sandbox="allow-scripts" srcDoc={preview} />
            </div>
          )}
        </div>

        <footer className="java-status">
          <span>{languages.find((l) => l.id === language)?.name} · UTF-8</span>
          <span role="status">
            {message || (runnable ? 'Runs in a sandboxed frame' : 'Source editor · Java is not executed')}
          </span>
          <span>Ln {cursor.line}, Col {cursor.column}</span>
        </footer>
      </div>
    </section>
  );
}
