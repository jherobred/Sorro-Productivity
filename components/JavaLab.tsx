'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from './Icon';
import { supabase, currentUserId } from '@/lib/supabase';
import { defineMutation } from '@/lib/offline';
import { toast } from '@/lib/toast';
import { PAL } from '@/lib/pal';
import { useLayout } from '@/lib/useLayout';
import { run, highlight, type RunResult, type Step } from '@/lib/java';
import { ask } from '@/lib/ask';

/**
 * Notebooks → Java. Runs the interpreter in lib/java.ts and shows what it did:
 * console, call stack, heap and the series of numbers the program printed.
 *
 * The panels are driven by the run's step trace, so the scrubber under the
 * editor rewinds the whole execution — at any point you are looking at the real
 * frames and heap from that line, not a reconstruction.
 */

const CARD: React.CSSProperties = { background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--sh)' };
const KICKER: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)' };
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const HUE: Record<string, string> = {
  kw: '#C792EA', str: '#C3E88D', num: '#F78C6C', com: '#6B6884',
  typ: '#82AAFF', fn: '#82AAFF', pun: '#89DDFF', txt: 'var(--tx)',
};

type JFile = { id: string; name: string; src: string; updated_at: string };

const JAVA = ['java_files'] as const;

const SAVE = defineMutation('java.save', async (v: { id: string; src: string }) => {
  const { error } = await supabase.from('bd_java_files').update({ src: v.src, updated_at: new Date().toISOString() }).eq('id', v.id);
  if (error) throw error;
});
const ADD = defineMutation('java.add', async (v: { id: string; name: string; src: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_java_files').insert({ ...v, user_id });
  if (error) throw error;
});
const DEL = defineMutation('java.del', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_java_files').delete().eq('id', v.id);
  if (error) throw error;
});

const STARTER = (cls: string) => `public class ${cls} {
    public static void main(String[] args) {
        System.out.println("Hello from ${cls}");
    }
}`;

export function JavaLab() {
  const qc = useQueryClient();
  const { phone } = useLayout();
  const [selId, setSelId] = useState<string | null>(null);
  const [src, setSrc] = useState('');
  const [editing, setEditing] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [at, setAt] = useState<number | null>(null);   // scrubber position; null = final state
  const [playing, setPlaying] = useState(false);

  const { data: files = [] } = useQuery({
    queryKey: JAVA,
    queryFn: async (): Promise<JFile[]> => {
      const { data, error } = await supabase.from('bd_java_files').select('id,name,src,updated_at').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const settle = () => void qc.invalidateQueries({ queryKey: JAVA });
  const save = useMutation<unknown, Error, { id: string; src: string }>({ mutationKey: SAVE, onSettled: settle });
  const add = useMutation<unknown, Error, { id: string; name: string; src: string }>({ mutationKey: ADD, onSettled: settle });
  const del = useMutation<unknown, Error, { id: string }>({ mutationKey: DEL, onSettled: settle });

  const file = files.find((f) => f.id === selId) ?? files[0] ?? null;

  useEffect(() => {
    if (file && file.id !== selId) setSelId(file.id);
  }, [file, selId]);

  useEffect(() => {
    setSrc(file?.src ?? '');
    setResult(null);
    setAt(null);
  }, [file?.id, file?.src]);

  // Autosave, same rhythm as the note editor.
  useEffect(() => {
    if (!file || src === file.src) return;
    const t = setTimeout(() => save.mutate({ id: file.id, src }), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, file?.id]);

  const doRun = useCallback(() => {
    const r = run(src);
    setResult(r);
    setAt(null);
    setPlaying(false);
    if (r.error) toast(`Line ${r.error.line}: ${r.error.message}`);
  }, [src]);

  // ⌘↵ / Ctrl+↵ runs, the way every editor does it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); doRun(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doRun]);

  // Playback of the trace.
  useEffect(() => {
    if (!playing || !result?.trace.length) return;
    const t = setInterval(() => {
      setAt((cur) => {
        const next = (cur ?? -1) + 1;
        if (next >= result.trace.length) { setPlaying(false); return null; }
        return next;
      });
    }, 260);
    return () => clearInterval(t);
  }, [playing, result]);

  const step: Step | null = result && at !== null ? result.trace[at] ?? null : null;
  const frames = step ? step.frames : result?.frames ?? [];
  const heap = step ? step.heap : result?.heap ?? [];
  const console = result ? (step ? result.out.slice(0, step.out) : result.out) : [];
  const activeLine = step?.line ?? null;

  const newFile = async () => {
    const n = await ask('New class', { initial: `Scratch${files.length + 1}`, placeholder: 'Class name', confirmLabel: 'Create' });
    if (!n) return;
    const cls = n.replace(/[^A-Za-z0-9_]/g, '') || 'Scratch';
    add.mutate({ id: crypto.randomUUID(), name: `${cls}.java`, src: STARTER(cls) }, {
      onSuccess: () => toast(`${cls}.java created`),
    });
  };

  const rail = (
    <div style={{ width: phone ? '100%' : 208, flex: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ ...CARD, padding: '11px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={KICKER}>Source files</span>
          <button onClick={() => void newFile()} className="hov k-squish" title="New class" aria-label="New class"
            style={{ marginLeft: 'auto', width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center' }}>
            <Icon name="plus" size={13} color="var(--tx3)" />
          </button>
        </div>

        <div className={phone ? 'hbar' : undefined} style={phone
          ? { display: 'flex', gap: 6, overflowX: 'auto' }
          : { display: 'flex', flexDirection: 'column', gap: 2 }}>
          {files.map((f) => {
            const on = f.id === file?.id;
            return (
              <button key={f.id} onClick={() => setSelId(f.id)} aria-current={on ? 'true' : undefined}
                className="k-chip"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9,
                  flex: phone ? 'none' : undefined, minHeight: 36, whiteSpace: 'nowrap',
                  background: on ? 'var(--card2)' : 'transparent',
                  border: `1px solid ${on ? 'var(--line2)' : 'transparent'}`,
                }}>
                <Icon name="code" size={13} color={on ? 'var(--accTx)' : 'var(--tx3)'} />
                <span style={{ flex: 1, textAlign: 'left', fontSize: 12, fontWeight: on ? 700 : 500, color: on ? 'var(--tx)' : 'var(--tx2)' }}>
                  {f.name}
                </span>
                <span style={{ fontSize: 10, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
                  {f.src.split('\n').length}
                </span>
              </button>
            );
          })}
          {files.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--tx3)', padding: '6px 2px' }}>No files yet.</div>}
        </div>
      </div>

      {!phone && (
        <div style={{ ...CARD, background: 'var(--card2)', padding: '11px 12px', fontSize: 10.5, color: 'var(--tx3)', lineHeight: 1.6 }}>
          Runs a sandboxed subset of Java in the browser — variables, arithmetic,
          strings, arrays, if / for / while and everything you print with
          System.out. No packages, files or threads.
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: phone ? 'column' : 'row', gap: 12, flex: 1, minHeight: 0 }}>
      {rail}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }} className="navsb">
        {/* ---------------------------------------------------------- editor */}
        <div style={{ ...CARD, padding: '12px 14px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10, flexWrap: 'wrap' }}>
            <Icon name="code" size={14} color="var(--tx3)" />
            <span style={{ fontSize: 13, fontWeight: 800 }}>{file?.name ?? 'No file'}</span>
            <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{src.split('\n').length} lines · UTF-8</span>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button onClick={doRun} disabled={!file} className="k-squish" title="Run (Ctrl+Enter)"
                style={{ ...BTN, background: 'var(--acc)', color: 'var(--ink)', border: 0, opacity: file ? 1 : 0.4 }}>
                <Icon name="play" size={12} color="var(--ink)" />Run
              </button>
              <button onClick={() => setEditing((v) => !v)} className="hov k-squish" aria-pressed={editing} style={BTN}>
                <Icon name={editing ? 'eye' : 'edit'} size={12} color="var(--tx2)" />{editing ? 'View' : 'Edit'}
              </button>
              <button onClick={() => { setResult(null); setAt(null); }} className="hov k-squish" style={BTN}>Clear</button>
              <button
                onClick={() => {
                  if (!file) return;
                  del.mutate({ id: file.id }, { onSuccess: () => { setSelId(null); toast(`${file.name} deleted`); } });
                }}
                className="hov k-squish" aria-label="Delete file" style={{ ...BTN, padding: '7px 9px' }}>
                <Icon name="trash" size={12} color="var(--tx3)" />
              </button>
            </div>
          </div>

          {editing ? (
            <textarea
              value={src}
              onChange={(e) => setSrc(e.target.value)}
              spellCheck={false}
              onKeyDown={(e) => {
                // Tab indents rather than escaping the field.
                if (e.key !== 'Tab') return;
                e.preventDefault();
                const el = e.currentTarget;
                const { selectionStart: a, selectionEnd: b } = el;
                const next = `${src.slice(0, a)}    ${src.slice(b)}`;
                setSrc(next);
                requestAnimationFrame(() => el.setSelectionRange(a + 4, a + 4));
              }}
              aria-label="Java source"
              style={{
                width: '100%', minHeight: 260, resize: 'vertical', padding: 12, borderRadius: 11,
                background: 'var(--card2)', border: '1px solid var(--line2)',
                fontFamily: MONO, fontSize: 12.5, lineHeight: 1.65, color: 'var(--tx)',
              }} />
          ) : (
            <CodeView src={src} activeLine={activeLine} errorLine={result?.error?.line ?? null} onEdit={() => setEditing(true)} />
          )}
        </div>

        {/* ------------------------------------------------------- scrubber */}
        {result && result.trace.length > 1 && (
          <div style={{ ...CARD, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 11 }}>
            <button onClick={() => { setPlaying((p) => !p); if (at === null) setAt(0); }} className="hov k-squish"
              aria-label={playing ? 'Pause' : 'Play the run'}
              style={{ width: 32, height: 32, flex: 'none', borderRadius: 16, border: '1px solid var(--line2)', display: 'grid', placeItems: 'center' }}>
              <Icon name={playing ? 'minus' : 'play'} size={13} color="var(--accTx)" />
            </button>

            <input
              type="range" min={0} max={result.trace.length - 1}
              value={at ?? result.trace.length - 1}
              onChange={(e) => { setPlaying(false); setAt(Number(e.target.value)); }}
              aria-label="Step through the run"
              style={{ flex: 1, accentColor: 'var(--acc)', minHeight: 32 }} />

            <span style={{ fontSize: 10.5, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {at === null ? 'end' : `step ${at + 1}/${result.trace.length}`}
              {step?.note ? ` · ${step.note}` : ''}
            </span>

            {at !== null && (
              <button onClick={() => { setAt(null); setPlaying(false); }} className="hov k-squish"
                style={{ ...BTN, padding: '5px 10px', minHeight: 30 }}>Latest</button>
            )}
          </div>
        )}

        {/* -------------------------------------------------------- console */}
        <div style={{ ...CARD, background: 'var(--card2)', padding: '12px 14px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: !result ? 'var(--tx3)' : result.error ? PAL.coral : PAL.mint,
            }} />
            <span style={KICKER}>Console</span>
            {result && (
              <span style={{ marginLeft: 'auto', fontSize: 10, color: result.error ? PAL.coral : 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
                exit {result.exit} · {result.ms} ms
              </span>
            )}
          </div>

          <pre style={{ margin: 0, fontFamily: MONO, fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {!result ? (
              <span style={{ color: 'var(--tx3)' }}>Press Run — or Ctrl+Enter — to execute.</span>
            ) : (
              <>
                <span style={{ color: 'var(--tx3)' }}>{`$ javac ${file?.name ?? 'Main.java'}\n$ java ${(file?.name ?? 'Main.java').replace(/\.java$/, '')}\n`}</span>
                <span style={{ color: 'var(--tx)' }}>{console.length ? `${console.join('\n')}\n` : ''}</span>
                {result.error && (
                  <span style={{ color: PAL.coral }}>
                    {`Exception at line ${result.error.line}: ${result.error.message}\n`}
                  </span>
                )}
                <span style={{ color: result.error ? PAL.coral : PAL.mint }}>
                  {result.error
                    ? `Exited with code 1`
                    : `Finished in ${result.ms} ms · ${result.out.length} line${result.out.length === 1 ? '' : 's'}`}
                  {result.truncated ? ' · timeline truncated' : ''}
                </span>
              </>
            )}
          </pre>
        </div>

        {/* --------------------------------------------- stack, heap, series */}
        {result && (
          <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : '1fr 1fr', gap: 12, alignItems: 'start' }}>
            <div style={{ ...CARD, padding: '12px 14px 14px' }}>
              <div style={{ ...KICKER, marginBottom: 9 }}>Call stack</div>
              {frames.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>No frames.</div>}
              {[...frames].reverse().map((f, i) => (
                <div key={`${f.sig}-${i}`} className="k-tagin"
                  style={{ marginBottom: 8, borderRadius: 11, border: '1px solid var(--line2)', background: 'var(--card2)', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderBottom: f.locals.length ? '1px solid var(--line)' : undefined }}>
                    <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: 'var(--accTx)' }}>{f.sig}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 9.5, color: 'var(--tx3)' }}>frame {frames.length - i}</span>
                  </div>
                  {f.locals.map((l) => (
                    <div key={l.name} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 11px' }}>
                      <span style={{
                        padding: '1px 6px', borderRadius: 5, fontSize: 9.5, fontWeight: 700, fontFamily: MONO,
                        background: 'color-mix(in srgb, var(--acc) 18%, transparent)', color: 'var(--accTx)',
                      }}>{l.type}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11.5, color: 'var(--tx2)' }}>{l.name}</span>
                      <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: PAL.amber, overflowWrap: 'anywhere' }}>
                        {l.text}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
              <div style={{ fontSize: 10, color: 'var(--tx3)', lineHeight: 1.5 }}>
                {at === null
                  ? 'Locals hold their values from the moment the method returned.'
                  : 'Live values at this step. Drag the scrubber to move through the run.'}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ ...CARD, padding: '12px 14px 14px' }}>
                <div style={{ ...KICKER, marginBottom: 9 }}>Heap</div>
                {heap.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>Nothing allocated yet.</div>}
                {heap.map((h) => (
                  <div key={h.name} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{
                        padding: '1px 6px', borderRadius: 5, fontSize: 9.5, fontWeight: 700, fontFamily: MONO,
                        background: 'color-mix(in srgb, var(--pal-mint) 20%, transparent)', color: PAL.mint,
                      }}>{h.type}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11.5, color: 'var(--tx2)' }}>{h.name}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 9.5, color: 'var(--tx3)' }}>
                        {h.size} {h.type === 'String' ? (h.size === 1 ? 'char' : 'chars') : h.size === 1 ? 'item' : 'items'}
                      </span>
                    </div>
                    <div className="hbar k-stagger" style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
                      {(h.cells ?? []).slice(0, 60).map((c, i) => (
                        <span key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none', '--i': i } as React.CSSProperties}>
                          <span style={{
                            minWidth: 24, height: 24, padding: '0 5px', borderRadius: 6, display: 'grid', placeItems: 'center',
                            background: 'var(--card2)', border: '1px solid var(--line2)',
                            fontFamily: MONO, fontSize: 11, fontWeight: 700,
                          }}>{c === ' ' ? '␣' : c}</span>
                          <span style={{ fontSize: 8.5, color: 'var(--tx3)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{i}</span>
                        </span>
                      ))}
                      {(h.cells?.length ?? 0) > 60 && (
                        <span style={{ alignSelf: 'center', fontSize: 10, color: 'var(--tx3)', paddingLeft: 4 }}>
                          +{(h.cells?.length ?? 0) - 60} more
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <Series values={result.series} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const BTN: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 9,
  border: '1px solid var(--line2)', fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)', minHeight: 34,
};

/** Read-only, line-numbered, highlighted. Click anywhere to switch to editing. */
function CodeView({ src, activeLine, errorLine, onEdit }: {
  src: string; activeLine: number | null; errorLine: number | null; onEdit: () => void;
}) {
  const lines = useMemo(() => {
    // Highlight the whole file once, then split the pieces across lines so a
    // multi-line comment or string still carries its colour.
    const rows: { text: string; cls: string }[][] = [[]];
    for (const piece of highlight(src)) {
      const parts = piece.text.split('\n');
      parts.forEach((part, i) => {
        if (i > 0) rows.push([]);
        if (part) rows[rows.length - 1].push({ text: part, cls: piece.cls });
      });
    }
    return rows;
  }, [src]);

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeLine === null) return;
    scroller.current?.querySelector(`[data-line="${activeLine}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeLine]);

  return (
    <div
      ref={scroller}
      onDoubleClick={onEdit}
      title="Double-click to edit"
      className="navsb"
      style={{
        maxHeight: 320, overflow: 'auto', borderRadius: 11, padding: '10px 0',
        background: 'var(--card2)', border: '1px solid var(--line2)',
        fontFamily: MONO, fontSize: 12.5, lineHeight: 1.65,
      }}>
      {lines.map((row, i) => {
        const n = i + 1;
        const on = n === activeLine;
        const bad = n === errorLine;
        return (
          <div key={n} data-line={n} style={{
            display: 'flex', gap: 12, padding: '0 12px',
            background: bad ? 'color-mix(in srgb, var(--pal-coral) 16%, transparent)'
              : on ? 'color-mix(in srgb, var(--acc) 15%, transparent)' : undefined,
            transition: 'background .28s var(--k-expo)',
          }}>
            <span aria-hidden style={{ width: 22, flex: 'none', textAlign: 'right', color: 'var(--tx3)', opacity: .7, fontVariantNumeric: 'tabular-nums', userSelect: 'none' }}>
              {n}
            </span>
            <code style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {row.length === 0 ? ' ' : row.map((p, j) => (
                <span key={j} style={{ color: HUE[p.cls] ?? 'var(--tx)' }}>{p.text}</span>
              ))}
            </code>
          </div>
        );
      })}
    </div>
  );
}

/** Bar chart of every number the program printed, in order. */
function Series({ values }: { values: number[] }) {
  if (!values.length) return null;
  const max = Math.max(...values.map(Math.abs), 1);

  return (
    <div style={{ ...CARD, padding: '12px 14px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={KICKER}>Printed series</span>
        <span style={{ marginLeft: 'auto', fontSize: 9.5, color: 'var(--tx3)' }}>
          {values.length} number{values.length === 1 ? '' : 's'} printed
        </span>
      </div>
      <div className="hbar" style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 92, overflowX: 'auto' }}>
        {values.slice(0, 120).map((v, i) => (
          <span key={i} title={String(v)} style={{
            flex: '1 0 8px', minWidth: 8, borderRadius: '4px 4px 2px 2px',
            height: `${Math.max(4, (Math.abs(v) / max) * 100)}%`,
            background: v < 0 ? PAL.coral : 'var(--acc)',
            animation: 'kgrow .5s var(--k-spring) both', animationDelay: `${Math.min(i, 40) * 16}ms`,
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--tx3)', marginTop: 5, fontVariantNumeric: 'tabular-nums' }}>
        <span>{values[0]}</span>
        <span>max {Math.max(...values)}</span>
        <span>{values[values.length - 1]}</span>
      </div>
    </div>
  );
}
