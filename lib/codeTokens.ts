import { javaTokens, type JavaToken } from './javaTokens.ts';

/**
 * Display-only highlighting for the languages the code page offers.
 *
 * Every tokenizer here holds the same invariant the Java one does: joining the
 * token texts returns the source byte for byte. Highlighting must never be
 * able to alter what someone wrote, so the tests assert reconstruction rather
 * than asserting colours.
 *
 * Token kinds are reused from the Java lexer so all four languages paint
 * through the same stylesheet rules instead of each one growing its own.
 */

export type CodeToken = JavaToken;

export const CODE_LANGUAGES = [
  { id: 'java', name: 'Java', runnable: false },
  { id: 'html', name: 'HTML', runnable: true },
  { id: 'css', name: 'CSS', runnable: true },
  { id: 'javascript', name: 'JavaScript', runnable: true },
] as const;

export type CodeLanguage = (typeof CODE_LANGUAGES)[number]['id'];

export const isRunnable = (language: string) =>
  CODE_LANGUAGES.some((l) => l.id === language && l.runnable);

/** Walk a pattern over the source, keeping every gap between matches. */
function scan(source: string, pattern: RegExp, classify: (text: string) => CodeToken['kind']): CodeToken[] {
  const tokens: CodeToken[] = [];
  let at = 0;
  for (const match of source.matchAll(pattern)) {
    const text = match[0], index = match.index!;
    if (index > at) tokens.push({ text: source.slice(at, index) });
    tokens.push({ text, kind: classify(text) });
    at = index + text.length;
  }
  if (at < source.length) tokens.push({ text: source.slice(at) });
  return tokens;
}

const HTML = /<!--[\s\S]*?(?:-->|$)|<\/?[A-Za-z][\w:-]*|\/?>|"(?:[^"\\]|\\.)*(?:"|$)|'(?:[^'\\]|\\.)*(?:'|$)|\b[A-Za-z-]+(?==)/g;

function htmlTokens(source: string): CodeToken[] {
  return scan(source, HTML, (text) =>
    text.startsWith('<!--') ? 'comment'
      : text.startsWith('"') || text.startsWith("'") ? 'string'
        : text.startsWith('<') || text === '>' || text === '/>' ? 'keyword'
          : 'type');
}

const CSS = /\/\*[\s\S]*?(?:\*\/|$)|"(?:[^"\\]|\\.)*(?:"|$)|'(?:[^'\\]|\\.)*(?:'|$)|@[\w-]+|[.#][A-Za-z_][\w-]*|\b[a-z-]+(?=\s*:)|-?\d*\.?\d+(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b|#[0-9a-fA-F]{3,8}\b/g;

function cssTokens(source: string): CodeToken[] {
  return scan(source, CSS, (text) =>
    text.startsWith('/*') ? 'comment'
      : text.startsWith('"') || text.startsWith("'") ? 'string'
        : text.startsWith('@') ? 'annotation'
          : text.startsWith('.') || text.startsWith('#') && !/^#[0-9a-fA-F]{3,8}$/.test(text) ? 'type'
            : /^[-#\d.]/.test(text) ? 'number'
              : 'keyword');
}

export function codeTokens(source: string, language: string): CodeToken[] {
  if (language === 'html') return htmlTokens(source);
  if (language === 'css') return cssTokens(source);
  return javaTokens(source);
}

/**
 * The document a preview iframe is given.
 *
 * CSS has no document of its own, so it is shown against a small labelled
 * sample rather than a blank frame. The sample is stated in the UI so nobody
 * mistakes it for something they wrote.
 */
export function previewDocument(code: string, language: string): string {
  if (language === 'html') return code;
  if (language === 'css') {
    return `<!doctype html><meta charset="utf-8"><style>${code}</style>`
      + '<h1>Heading</h1><p>A paragraph of sample text with a <a href="#">link</a>.</p>'
      + '<button>Button</button><ul><li>First item</li><li>Second item</li></ul>';
  }
  return `<!doctype html><meta charset="utf-8"><body><pre id="out"></pre><script>
(function(){var o=document.getElementById('out');function w(a){o.textContent+=Array.from(a).map(function(v){
try{return typeof v==='string'?v:JSON.stringify(v);}catch(e){return String(v);}}).join(' ')+'\\n';}
console.log=console.info=console.warn=console.error=function(){w(arguments);};
window.onerror=function(m){w([m]);};
try{${code}\n}catch(e){w([e&&e.message?e.message:String(e)]);}})();
</script></body>`;
}
