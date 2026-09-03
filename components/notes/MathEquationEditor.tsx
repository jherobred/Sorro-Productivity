'use client';

import { useEffect, useRef, useState } from 'react';
import katex from 'katex';
import { Icon } from '../Icon';
import { playClick } from '@/lib/audio';

interface MathEquationEditorProps {
  initialFormula?: string;
  onInsert: (latex: string) => void;
  onClose: () => void;
}

const TEMPLATES = [
  { label: 'Fraction', latex: '\\frac{a}{b}' },
  { label: 'Square Root', latex: '\\sqrt{x^2 + y^2}' },
  { label: 'Integral', latex: '\\int_{a}^{b} f(x) \\, dx' },
  { label: 'Summation', latex: '\\sum_{i=1}^{n} i^2 = \\frac{n(n+1)(2n+1)}{6}' },
  { label: 'Limit', latex: '\\lim_{x \\to 0} \\frac{\\sin(x)}{x} = 1' },
  { label: 'Quadratic', latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
  { label: 'Matrix', latex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
  { label: 'Euler', latex: 'e^{i\\pi} + 1 = 0' },
  { label: 'Pythagorean', latex: 'a^2 + b^2 = c^2' },
  { label: 'Derivative', latex: '\\frac{d}{dx}[\\ln(x)] = \\frac{1}{x}' },
];

const SYMBOLS = [
  '\\alpha', '\\beta', '\\gamma', '\\theta', '\\pi', '\\lambda', '\\sigma', '\\omega',
  '\\Delta', '\\infty', '\\approx', '\\le', '\\ge', '\\pm', '\\times', '\\div',
  '\\subset', '\\in', '\\forall', '\\exists', '\\nabla', '\\partial'
];

export function MathEquationEditor({
  initialFormula = '',
  onInsert,
  onClose,
}: MathEquationEditorProps) {
  const [formula, setFormula] = useState(initialFormula || 'f(x) = \\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}');
  const [renderedHtml, setRenderedHtml] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialFormula) {
      setFormula(initialFormula);
    }
  }, [initialFormula]);

  useEffect(() => {
    try {
      const html = katex.renderToString(formula, {
        displayMode: true,
        throwOnError: true,
      });
      setRenderedHtml(html);
      setErrorMsg(null);
    } catch (err) {
      try {
        const fallbackHtml = katex.renderToString(formula, {
          displayMode: true,
          throwOnError: false,
        });
        setRenderedHtml(fallbackHtml);
        setErrorMsg((err as Error).message);
      } catch {
        setErrorMsg('Invalid LaTeX equation syntax');
      }
    }
  }, [formula]);

  const insertSymbol = (sym: string) => {
    playClick();
    const el = inputRef.current;
    if (!el) {
      setFormula((f) => f + ' ' + sym);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = formula.slice(0, start) + sym + formula.slice(end);
    setFormula(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + sym.length, start + sym.length);
    });
  };

  const applyTemplate = (latex: string) => {
    playClick();
    setFormula(latex);
  };

  const handleSave = () => {
    playClick();
    onInsert(formula.trim());
  };

  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--line2)',
        borderRadius: 16,
        padding: 18,
        boxShadow: 'var(--shl)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        maxWidth: 620,
        width: '100%',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'color-mix(in srgb, var(--acc) 18%, transparent)', display: 'grid', placeItems: 'center' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--accTx)' }}>∑</span>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--tx)' }}>LaTeX Math Equation Editor</div>
            <div style={{ fontSize: 11, color: 'var(--tx3)' }}>Type LaTeX formula with live KaTeX rendering</div>
          </div>
        </div>
        <button onClick={onClose} className="hov k-squish" style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--tx3)', fontSize: 16, cursor: 'pointer' }}>
          ✕
        </button>
      </div>

      {/* Live Preview Box */}
      <div
        style={{
          background: 'var(--card2)',
          borderRadius: 12,
          padding: '16px 20px',
          border: '1px solid var(--line2)',
          minHeight: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflowX: 'auto',
        }}
      >
        {renderedHtml ? (
          <div dangerouslySetInnerHTML={{ __html: renderedHtml }} style={{ fontSize: 18, color: 'var(--tx)' }} />
        ) : (
          <div style={{ fontSize: 12, color: 'var(--tx3)' }}>Live rendered math formula appears here</div>
        )}
      </div>

      {errorMsg && (
        <div style={{ fontSize: 11, color: 'var(--pal-coral)', padding: '4px 8px', borderRadius: 6, background: 'rgba(255,107,107,0.1)' }}>
          {errorMsg}
        </div>
      )}

      {/* Templates Row */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx3)' }}>
          Quick Formula Templates
        </div>
        <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 4 }}>
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              onClick={() => applyTemplate(t.latex)}
              className="hov k-squish"
              style={{
                padding: '4px 9px',
                borderRadius: 7,
                background: 'var(--card2)',
                border: '1px solid var(--line2)',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--tx2)',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Symbols Row */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx3)' }}>
          Math Symbols & Operators
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {SYMBOLS.map((s) => (
            <button
              key={s}
              onClick={() => insertSymbol(s)}
              className="hov k-squish"
              style={{
                padding: '3px 7px',
                borderRadius: 6,
                background: 'var(--card2)',
                border: '1px solid var(--line)',
                fontSize: 11,
                fontFamily: 'monospace',
                color: 'var(--accTx)',
                cursor: 'pointer',
              }}
            >
              {s.replace(/\\/g, '')}
            </button>
          ))}
        </div>
      </div>

      {/* Code Textarea */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 6 }}>
          LaTeX Equation Code
        </div>
        <textarea
          ref={inputRef}
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          rows={3}
          placeholder="Enter LaTeX formula e.g. \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}"
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid var(--line2)',
            background: 'var(--card2)',
            color: 'var(--tx)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 12.5,
            lineHeight: 1.5,
            outline: 'none',
            resize: 'vertical',
          }}
        />
      </div>

      {/* Action Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onClose} className="hov k-squish" style={{ padding: '8px 16px', borderRadius: 9, background: 'transparent', border: '1px solid var(--line2)', color: 'var(--tx2)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          Cancel
        </button>
        <button onClick={handleSave} className="acc k-squish" style={{ padding: '8px 20px', borderRadius: 9, background: 'var(--acc)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 800, border: 'none', cursor: 'pointer' }}>
          Insert Equation
        </button>
      </div>
    </div>
  );
}
