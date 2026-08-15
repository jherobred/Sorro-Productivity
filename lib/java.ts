/**
 * A real Java interpreter for the subset the Notebooks → Java tab advertises:
 * variables, arithmetic, strings, arrays, if / for / while / do, static methods,
 * and everything you print with System.out. No packages, files or threads.
 *
 * Three passes, all in this file so the whole language lives in one place:
 *   lex()   source  → tokens
 *   parse() tokens  → AST
 *   run()   AST     → console output *and a step trace*
 *
 * The trace is the point. Every statement records the call stack, each frame's
 * locals and the console so far, which is what lets the UI scrub through an
 * execution and show what the heap looked like at any line, rather than only
 * printing the final answer.
 *
 * Two hard limits keep a bad program from taking the tab with it: STEP_CAP ends
 * runaway loops, and TRACE_CAP stops the recording (execution continues) once
 * the timeline is long enough to be useless to scrub anyway.
 */

const STEP_CAP = 400_000;
const TRACE_CAP = 1_200;

/* ============================================================== 1. Lexing */

export type TokKind = 'id' | 'kw' | 'num' | 'str' | 'chr' | 'op' | 'eof';
export type Tok = { k: TokKind; v: string; line: number; from: number; to: number };

const KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
  'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float',
  'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native',
  'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp',
  'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void',
  'volatile', 'while', 'true', 'false', 'null', 'var', 'record',
]);

// Longest first, so '>>>=' is never read as '>>' then '>='.
const OPS = [
  '>>>=', '<<=', '>>=', '>>>', '...', '->', '::',
  '==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>',
  '+', '-', '*', '/', '%', '=', '<', '>', '!', '&', '|', '^', '~', '?', ':', ';', ',', '.', '(', ')', '[', ']', '{', '}', '@',
];

export class JavaError extends Error {
  constructor(message: string, readonly line: number, readonly kind = 'error') {
    super(message);
  }
}

export function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  let line = 1;

  const isIdStart = (c: string) => /[A-Za-z_$]/.test(c);
  const isId = (c: string) => /[A-Za-z0-9_$]/.test(c);

  while (i < src.length) {
    const c = src[i];

    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }

    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
      i += 2;
      continue;
    }

    const from = i;

    if (isIdStart(c)) {
      while (i < src.length && isId(src[i])) i++;
      const v = src.slice(from, i);
      out.push({ k: KEYWORDS.has(v) ? 'kw' : 'id', v, line, from, to: i });
      continue;
    }

    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      if (c === '0' && /[xX]/.test(src[i + 1] ?? '')) {
        i += 2;
        while (i < src.length && /[0-9a-fA-F_]/.test(src[i])) i++;
      } else {
        while (i < src.length && /[0-9_]/.test(src[i])) i++;
        if (src[i] === '.' && /[0-9]/.test(src[i + 1] ?? '')) {
          i++;
          while (i < src.length && /[0-9_]/.test(src[i])) i++;
        }
        if (/[eE]/.test(src[i] ?? '')) {
          i++;
          if (/[+-]/.test(src[i] ?? '')) i++;
          while (i < src.length && /[0-9]/.test(src[i])) i++;
        }
      }
      if (/[lLfFdD]/.test(src[i] ?? '')) i++;
      out.push({ k: 'num', v: src.slice(from, i), line, from, to: i });
      continue;
    }

    if (c === '"') {
      i++;
      let s = '';
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') { s += readEscape(src, i); i += escapeLen(src, i); continue; }
        if (src[i] === '\n') throw new JavaError('Unclosed string literal', line);
        s += src[i++];
      }
      if (i >= src.length) throw new JavaError('Unclosed string literal', line);
      i++;
      out.push({ k: 'str', v: s, line, from, to: i });
      continue;
    }

    if (c === "'") {
      i++;
      let s = '';
      if (src[i] === '\\') { s = readEscape(src, i); i += escapeLen(src, i); }
      else s = src[i++];
      if (src[i] !== "'") throw new JavaError('Unclosed character literal', line);
      i++;
      out.push({ k: 'chr', v: s, line, from, to: i });
      continue;
    }

    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new JavaError(`Unexpected character '${c}'`, line);
    i += op.length;
    out.push({ k: 'op', v: op, line, from, to: i });
  }

  out.push({ k: 'eof', v: '', line, from: i, to: i });
  return out;
}

function escapeLen(src: string, i: number): number {
  return src[i + 1] === 'u' ? 6 : 2;
}
function readEscape(src: string, i: number): string {
  const c = src[i + 1];
  if (c === 'u') return String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16));
  return ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '0': '\0', '\\': '\\', "'": "'", '"': '"' } as Record<string, string>)[c] ?? c;
}

/* ============================================================== 2. Parsing */

type Expr =
  | { e: 'lit'; t: string; v: unknown; line: number }
  | { e: 'name'; id: string; line: number }
  | { e: 'bin'; op: string; l: Expr; r: Expr; line: number }
  | { e: 'un'; op: string; x: Expr; line: number }
  | { e: 'pre'; op: string; x: Expr; line: number }
  | { e: 'post'; op: string; x: Expr; line: number }
  | { e: 'assign'; op: string; target: Expr; value: Expr; line: number }
  | { e: 'cond'; c: Expr; a: Expr; b: Expr; line: number }
  | { e: 'call'; target: Expr | null; name: string; args: Expr[]; line: number }
  | { e: 'field'; target: Expr; name: string; line: number }
  | { e: 'index'; target: Expr; index: Expr; line: number }
  | { e: 'newarr'; type: string; sizes: Expr[]; init: Expr[] | null; line: number }
  | { e: 'cast'; type: string; x: Expr; line: number };

type Stmt =
  | { s: 'var'; type: string; decls: { name: string; init: Expr | null; extraDims: number }[]; line: number }
  | { s: 'expr'; x: Expr; line: number }
  | { s: 'if'; c: Expr; then: Stmt; else: Stmt | null; line: number }
  | { s: 'while'; c: Expr; body: Stmt; line: number }
  | { s: 'do'; c: Expr; body: Stmt; line: number }
  | { s: 'for'; init: Stmt | null; c: Expr | null; step: Expr[]; body: Stmt; line: number }
  | { s: 'foreach'; type: string; name: string; iter: Expr; body: Stmt; line: number }
  | { s: 'block'; body: Stmt[]; line: number }
  | { s: 'return'; x: Expr | null; line: number }
  | { s: 'break'; line: number }
  | { s: 'continue'; line: number }
  | { s: 'empty'; line: number };

type MethodDecl = { name: string; ret: string; params: { type: string; name: string }[]; body: Stmt[]; line: number };
type ClassDecl = { name: string; methods: MethodDecl[]; fields: Stmt[] };
export type Program = { classes: ClassDecl[] };

const PRIMS = new Set(['int', 'long', 'short', 'byte', 'double', 'float', 'char', 'boolean', 'void', 'var']);
const MODIFIERS = new Set(['public', 'private', 'protected', 'static', 'final', 'abstract', 'synchronized', 'native', 'strictfp', 'transient', 'volatile', 'default']);

export function parse(toks: Tok[]): Program {
  let p = 0;
  const peek = (n = 0) => toks[Math.min(p + n, toks.length - 1)];
  const at = (v: string) => peek().v === v && (peek().k === 'op' || peek().k === 'kw');
  const eat = (v: string) => { if (at(v)) { p++; return true; } return false; };
  const want = (v: string) => {
    if (!eat(v)) throw new JavaError(`Expected '${v}' but found '${peek().v || 'end of file'}'`, peek().line);
  };
  const wantId = () => {
    const t = peek();
    if (t.k !== 'id' && t.k !== 'kw') throw new JavaError(`Expected a name but found '${t.v || 'end of file'}'`, t.line);
    p++;
    return t.v;
  };

  /* ---- types ---- */

  const looksLikeType = (n = 0): boolean => {
    const t = peek(n);
    if (t.k === 'kw' && PRIMS.has(t.v)) return true;
    return t.k === 'id' && /^[A-Z]/.test(t.v);
  };

  const parseType = (): string => {
    let name = wantId();
    // Generics are accepted and erased — the subset has no user generics, but
    // List<String> in a signature should not be a syntax error.
    if (at('<')) {
      let depth = 0;
      do {
        if (at('<')) depth++;
        if (at('>')) depth--;
        if (at('>>')) depth -= 2;
        p++;
      } while (depth > 0 && peek().k !== 'eof');
    }
    while (at('[') && peek(1).v === ']') { p += 2; name += '[]'; }
    return name;
  };

  /* ---- expressions ---- */

  const primary = (): Expr => {
    const t = peek();
    const line = t.line;

    if (t.k === 'num') {
      p++;
      const raw = t.v.replace(/_/g, '');
      const suffix = /[lLfFdD]$/.test(raw) ? raw.slice(-1).toLowerCase() : '';
      const body = suffix ? raw.slice(0, -1) : raw;
      const isFloat = suffix === 'f' || suffix === 'd' || /[.eE]/.test(body.replace(/^0[xX]/, ''));
      const v = /^0[xX]/.test(body) ? parseInt(body, 16) : Number(body);
      return { e: 'lit', t: isFloat ? 'double' : suffix === 'l' ? 'long' : 'int', v, line };
    }
    if (t.k === 'str') { p++; return { e: 'lit', t: 'String', v: t.v, line }; }
    if (t.k === 'chr') { p++; return { e: 'lit', t: 'char', v: t.v.charCodeAt(0), line }; }
    if (at('true') || at('false')) { p++; return { e: 'lit', t: 'boolean', v: t.v === 'true', line }; }
    if (eat('null')) return { e: 'lit', t: 'null', v: null, line };

    if (eat('new')) {
      const type = wantId();
      if (at('[')) {
        const sizes: Expr[] = [];
        let dims = 0;
        while (eat('[')) {
          dims++;
          if (at(']')) { want(']'); continue; }
          sizes.push(expression());
          want(']');
        }
        let init: Expr[] | null = null;
        if (at('{')) init = arrayInit();
        return { e: 'newarr', type: type + '[]'.repeat(Math.max(1, dims) - 1), sizes, init, line };
      }
      // `new Something(...)` — no user classes in the subset, but String and the
      // boxed types show up in beginner code, so treat them as conversions.
      want('(');
      const args: Expr[] = [];
      if (!at(')')) do { args.push(expression()); } while (eat(','));
      want(')');
      return { e: 'call', target: null, name: `new ${type}`, args, line };
    }

    if (eat('(')) {
      // Cast vs parenthesised expression: `(int) x` is a cast, `(a) + b` is not.
      if (looksLikeType() && (peek(1).v === ')' || (peek(1).v === '[' && peek(2).v === ']'))) {
        const save = p;
        const type = parseType();
        if (eat(')')) {
          const nxt = peek();
          const startsValue = nxt.k === 'num' || nxt.k === 'str' || nxt.k === 'chr' || nxt.k === 'id'
            || nxt.v === '(' || nxt.v === '-' || nxt.v === '!' || nxt.v === '~' || nxt.v === 'new';
          if (startsValue && PRIMS.has(type.replace('[]', ''))) return { e: 'cast', type, x: unary(), line };
        }
        p = save;
      }
      const x = expression();
      want(')');
      return x;
    }

    if (at('{')) {
      // Bare array initialiser, reachable from `int[] a = {1,2,3}`.
      return { e: 'newarr', type: 'var', sizes: [], init: arrayInit(), line };
    }

    if (t.k === 'id' || (t.k === 'kw' && (t.v === 'this' || t.v === 'super'))) {
      p++;
      return { e: 'name', id: t.v, line };
    }

    throw new JavaError(`Unexpected '${t.v || 'end of file'}'`, line);
  };

  const arrayInit = (): Expr[] => {
    want('{');
    const items: Expr[] = [];
    if (!at('}')) {
      do {
        if (at('}')) break;                       // trailing comma
        items.push(at('{') ? { e: 'newarr', type: 'var', sizes: [], init: arrayInit(), line: peek().line } : expression());
      } while (eat(','));
    }
    want('}');
    return items;
  };

  const postfix = (): Expr => {
    let x = primary();
    for (;;) {
      const line = peek().line;
      if (eat('.')) {
        const name = wantId();
        if (at('(')) {
          want('(');
          const args: Expr[] = [];
          if (!at(')')) do { args.push(expression()); } while (eat(','));
          want(')');
          x = { e: 'call', target: x, name, args, line };
        } else {
          x = { e: 'field', target: x, name, line };
        }
      } else if (at('[')) {
        want('[');
        const index = expression();
        want(']');
        x = { e: 'index', target: x, index, line };
      } else if (at('(') && x.e === 'name') {
        want('(');
        const args: Expr[] = [];
        if (!at(')')) do { args.push(expression()); } while (eat(','));
        want(')');
        x = { e: 'call', target: null, name: x.id, args, line };
      } else if (at('++') || at('--')) {
        const op = peek().v; p++;
        x = { e: 'post', op, x, line };
      } else {
        return x;
      }
    }
  };

  const unary = (): Expr => {
    const t = peek();
    if (at('++') || at('--')) { p++; return { e: 'pre', op: t.v, x: unary(), line: t.line }; }
    if (at('-') || at('+') || at('!') || at('~')) { p++; return { e: 'un', op: t.v, x: unary(), line: t.line }; }
    return postfix();
  };

  // Standard precedence climb. Each row binds tighter than the one below it.
  const LEVELS: string[][] = [
    ['||'], ['&&'], ['|'], ['^'], ['&'],
    ['==', '!='], ['<', '>', '<=', '>=', 'instanceof'],
    ['<<', '>>', '>>>'], ['+', '-'], ['*', '/', '%'],
  ];

  const binary = (lv = 0): Expr => {
    if (lv >= LEVELS.length) return unary();
    let l = binary(lv + 1);
    for (;;) {
      const t = peek();
      // `>` inside a generic argument list never reaches here, since types are
      // consumed whole by parseType().
      if (!LEVELS[lv].includes(t.v) || (t.k !== 'op' && t.v !== 'instanceof')) return l;
      p++;
      if (t.v === 'instanceof') { parseType(); l = { e: 'lit', t: 'boolean', v: true, line: t.line }; continue; }
      l = { e: 'bin', op: t.v, l, r: binary(lv + 1), line: t.line };
    }
  };

  const ternary = (): Expr => {
    const c = binary();
    if (!at('?')) return c;
    const line = peek().line;
    want('?');
    const a = expression();
    want(':');
    return { e: 'cond', c, a, b: expression(), line };
  };

  const ASSIGN_OPS = ['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '>>>='];

  function expression(): Expr {
    const left = ternary();
    const t = peek();
    if (t.k === 'op' && ASSIGN_OPS.includes(t.v)) {
      p++;
      return { e: 'assign', op: t.v, target: left, value: expression(), line: t.line };
    }
    return left;
  }

  /* ---- statements ---- */

  /**
   * `Foo bar` is a declaration; `foo.bar()` and `a * b` are not. Scanning ahead
   * for a type followed by a name is the only way to tell without types.
   */
  const isLocalDecl = (): boolean => {
    if (peek().k === 'kw' && PRIMS.has(peek().v)) return true;
    if (peek().k !== 'id' || !/^[A-Z]/.test(peek().v)) return false;
    let n = 1;
    if (peek(n).v === '<') {
      let depth = 0;
      do {
        if (peek(n).v === '<') depth++;
        else if (peek(n).v === '>') depth--;
        else if (peek(n).v === '>>') depth -= 2;
        n++;
      } while (depth > 0 && peek(n).k !== 'eof');
    }
    while (peek(n).v === '[' && peek(n + 1).v === ']') n += 2;
    return peek(n).k === 'id';
  };

  const varDecl = (): Stmt => {
    const line = peek().line;
    const type = parseType();
    const decls: { name: string; init: Expr | null; extraDims: number }[] = [];
    do {
      const name = wantId();
      let extraDims = 0;
      while (at('[') && peek(1).v === ']') { p += 2; extraDims++; }
      decls.push({ name, init: eat('=') ? expression() : null, extraDims });
    } while (eat(','));
    return { s: 'var', type, decls, line };
  };

  const block = (): Stmt => {
    const line = peek().line;
    want('{');
    const body: Stmt[] = [];
    while (!at('}') && peek().k !== 'eof') body.push(statement());
    want('}');
    return { s: 'block', body, line };
  };

  function statement(): Stmt {
    const line = peek().line;

    while (MODIFIERS.has(peek().v) && peek().k === 'kw') p++;   // `final int x = 1;`

    if (at('{')) return block();
    if (eat(';')) return { s: 'empty', line };

    if (eat('if')) {
      want('('); const c = expression(); want(')');
      const then = statement();
      return { s: 'if', c, then, else: eat('else') ? statement() : null, line };
    }

    if (eat('while')) {
      want('('); const c = expression(); want(')');
      return { s: 'while', c, body: statement(), line };
    }

    if (eat('do')) {
      const body = statement();
      want('while'); want('('); const c = expression(); want(')'); want(';');
      return { s: 'do', c, body, line };
    }

    if (eat('for')) {
      want('(');
      // for-each: `for (Type name : iterable)`
      const save = p;
      if (isLocalDecl()) {
        const type = parseType();
        if (peek().k === 'id' && peek(1).v === ':') {
          const name = wantId();
          want(':');
          const iter = expression();
          want(')');
          return { s: 'foreach', type, name, iter, body: statement(), line };
        }
        p = save;
      }

      const init = at(';') ? null : isLocalDecl() ? varDecl() : { s: 'expr' as const, x: expression(), line };
      want(';');
      const c = at(';') ? null : expression();
      want(';');
      const step: Expr[] = [];
      if (!at(')')) do { step.push(expression()); } while (eat(','));
      want(')');
      return { s: 'for', init, c, step, body: statement(), line };
    }

    if (eat('return')) {
      const x = at(';') ? null : expression();
      want(';');
      return { s: 'return', x, line };
    }
    if (eat('break')) { if (peek().k === 'id') p++; want(';'); return { s: 'break', line }; }
    if (eat('continue')) { if (peek().k === 'id') p++; want(';'); return { s: 'continue', line }; }

    if (isLocalDecl()) { const d = varDecl(); want(';'); return d; }

    const x = expression();
    want(';');
    return { s: 'expr', x, line };
  }

  /* ---- top level ---- */

  const classDecl = (): ClassDecl => {
    while (MODIFIERS.has(peek().v) && peek().k === 'kw') p++;
    if (!eat('class')) want('class');
    const name = wantId();
    if (eat('extends')) parseType();
    if (eat('implements')) do { parseType(); } while (eat(','));
    want('{');

    const methods: MethodDecl[] = [];
    const fields: Stmt[] = [];

    while (!at('}') && peek().k !== 'eof') {
      if (eat(';')) continue;
      while (MODIFIERS.has(peek().v) && peek().k === 'kw') p++;
      if (at('@')) { p++; wantId(); continue; }
      if (at('class')) { classDecl(); continue; }                 // nested class: parsed and dropped

      const line = peek().line;
      const ret = parseType();
      const nameTok = peek();

      // Constructor: the "return type" was actually the class name and a '(' follows.
      if (nameTok.v === '(' && ret === name) {
        want('(');
        const params: { type: string; name: string }[] = [];
        if (!at(')')) do { while (eat('final')); params.push({ type: parseType(), name: wantId() }); } while (eat(','));
        want(')');
        methods.push({ name: '<init>', ret: 'void', params, body: (block() as { body: Stmt[] }).body, line });
        continue;
      }

      const memberName = wantId();
      if (at('(')) {
        want('(');
        const params: { type: string; name: string }[] = [];
        if (!at(')')) do { while (eat('final')); params.push({ type: parseType(), name: wantId() }); } while (eat(','));
        want(')');
        if (eat('throws')) do { parseType(); } while (eat(','));
        if (eat(';')) { continue; }                                 // abstract
        methods.push({ name: memberName, ret, params, body: (block() as { body: Stmt[] }).body, line });
      } else {
        // Field. Rewind one so varDecl reads the whole thing including the type.
        p -= 1;
        let back = 1;
        while (toks[p - 1] && (toks[p - 1].v === '[' || toks[p - 1].v === ']')) { p--; back++; }
        p -= 1;
        void back;
        const d = varDecl();
        want(';');
        fields.push(d);
      }
    }
    want('}');
    return { name, methods, fields };
  };

  const classes: ClassDecl[] = [];
  while (peek().k !== 'eof') {
    if (eat('package') || eat('import')) { while (!at(';') && peek().k !== 'eof') p++; want(';'); continue; }
    if (at('@')) { p++; wantId(); continue; }
    classes.push(classDecl());
  }
  if (!classes.length) throw new JavaError('No class found — wrap your code in `class Main { … }`', 1);
  return { classes };
}

/* =========================================================== 3. Execution */

export type Val = { t: string; v: unknown };

export type Local = { name: string; type: string; text: string; value: Val };
export type FrameSnap = { sig: string; locals: Local[] };
export type HeapObj = { name: string; type: string; text: string; cells: string[] | null; size: number };

export type Step = {
  line: number;
  frames: FrameSnap[];
  heap: HeapObj[];
  out: number;          // console length at this step, so the UI can reveal output in time
  note: string;
};

export type RunResult = {
  out: string[];
  error: { message: string; line: number } | null;
  exit: number;
  ms: number;
  steps: number;
  truncated: boolean;
  frames: FrameSnap[];
  heap: HeapObj[];
  series: number[];
  trace: Step[];
};

const isNum = (t: string) => ['int', 'long', 'short', 'byte', 'double', 'float', 'char'].includes(t);
const isFloat = (t: string) => t === 'double' || t === 'float';
const isArr = (t: string) => t.endsWith('[]');

/** Java prints doubles with a decimal point even when they are whole. */
function dstr(n: number): string {
  if (Number.isNaN(n)) return 'NaN';
  if (n === Infinity) return 'Infinity';
  if (n === -Infinity) return '-Infinity';
  if (Number.isInteger(n) && Math.abs(n) < 1e7) return `${n}.0`;
  return String(n);
}

/** Java's array toString: a type descriptor, an @, and an identity hash. */
const ARR_TAG: Record<string, string> = {
  int: '[I', long: '[J', short: '[S', byte: '[B', double: '[D', float: '[F', char: '[C', boolean: '[Z',
};

export function str(x: Val): string {
  if (x.v === null || x.t === 'null') return 'null';
  if (x.t === 'char') return String.fromCharCode(x.v as number);
  if (isFloat(x.t)) return dstr(x.v as number);
  if (isArr(x.t)) {
    const elem = x.t.slice(0, -2);
    const tag = ARR_TAG[elem] ?? `[L${elem === 'String' ? 'java.lang.String' : elem};`;
    return `${tag}@${((x.v as Val[]).length * 31 + 7).toString(16)}`;
  }
  return String(x.v);
}

const truthy = (x: Val, line: number): boolean => {
  if (x.t !== 'boolean') throw new JavaError(`Expected a boolean, found ${x.t}`, line);
  return x.v as boolean;
};

/** Java's binary numeric promotion: double wins, then long, otherwise int. */
const promote = (a: string, b: string) =>
  isFloat(a) || isFloat(b) ? 'double' : a === 'long' || b === 'long' ? 'long' : 'int';

const asNum = (x: Val, line: number): number => {
  if (!isNum(x.t)) throw new JavaError(`Expected a number, found ${x.t}`, line);
  return x.v as number;
};

/** Narrow a value into a declared slot, the way an assignment would. */
function coerce(type: string, x: Val, line: number): Val {
  if (type === 'var' || type === x.t) return { t: type === 'var' ? x.t : type, v: x.v };
  if (type === 'String') {
    if (x.t === 'null') return { t: 'String', v: null };
    if (x.t !== 'String') throw new JavaError(`Cannot put ${x.t} into a String`, line);
    return x;
  }
  if (type === 'boolean') {
    if (x.t !== 'boolean') throw new JavaError(`Cannot put ${x.t} into a boolean`, line);
    return x;
  }
  if (isArr(type)) return { t: type, v: x.v };
  if (isNum(type)) {
    const n = asNum(x, line);
    if (isFloat(type)) return { t: type, v: n };
    if (type === 'char') return { t: 'char', v: Math.trunc(n) & 0xffff };
    if (type === 'byte') return { t: 'byte', v: (Math.trunc(n) << 24) >> 24 };
    if (type === 'short') return { t: 'short', v: (Math.trunc(n) << 16) >> 16 };
    if (type === 'long') return { t: 'long', v: Math.trunc(n) };
    return { t: 'int', v: Math.trunc(n) | 0 };
  }
  return x;
}

class Frame {
  scopes: Map<string, Val>[] = [new Map()];
  constructor(readonly sig: string) {}
  push() { this.scopes.push(new Map()); }
  pop() { this.scopes.pop(); }
  declare(name: string, v: Val) { this.scopes[this.scopes.length - 1].set(name, v); }
  find(name: string): Map<string, Val> | null {
    for (let i = this.scopes.length - 1; i >= 0; i--) if (this.scopes[i].has(name)) return this.scopes[i];
    return null;
  }
  get(name: string): Val | undefined { return this.find(name)?.get(name); }
  /** Flattened, in declaration order, for the call-stack panel. */
  locals(): Local[] {
    const out: Local[] = [];
    for (const sc of this.scopes) for (const [name, val] of sc) {
      out.push({ name, type: val.t, text: str(val), value: val });
    }
    return out;
  }
}

const BREAK = { signal: 'break' } as const;
const CONTINUE = { signal: 'continue' } as const;
type Flow = typeof BREAK | typeof CONTINUE | { signal: 'return'; value: Val } | null;

export function run(src: string, entry = 'main'): RunResult {
  const started = performance.now();
  const out: string[] = [];

  /**
   * System.out is a character stream, not a list of lines: print() leaves the
   * cursor mid-line and printf only breaks where the format says %n. So text
   * accumulates in `pending` and only becomes an `out` row at a newline.
   */
  let pending = '';
  const emit = (text: string) => {
    pending += text;
    const parts = pending.split('\n');
    pending = parts.pop() ?? '';
    for (const p of parts) out.push(p);
  };
  const flush = () => { if (pending) { out.push(pending); pending = ''; } };

  const series: number[] = [];
  const trace: Step[] = [];
  const stack: Frame[] = [];
  let steps = 0;
  let truncated = false;
  let error: { message: string; line: number } | null = null;

  let program: Program | null = null;
  try {
    program = parse(lex(src));
  } catch (e) {
    const je = e instanceof JavaError ? e : new JavaError(String(e), 1);
    return {
      out: [], error: { message: je.message, line: je.line }, exit: 1,
      ms: Math.round(performance.now() - started), steps: 0, truncated: false,
      frames: [], heap: [], series: [], trace: [],
    };
  }

  const methods = new Map<string, MethodDecl>();
  for (const c of program.classes) {
    for (const m of c.methods) {
      methods.set(m.name, m);
      methods.set(`${c.name}.${m.name}`, m);
    }
  }

  /* -------------------------------------------------- snapshots */

  const heapOf = (): HeapObj[] => {
    const seen = new Set<string>();
    const objs: HeapObj[] = [];
    for (let i = stack.length - 1; i >= 0; i--) {
      for (const l of stack[i].locals()) {
        if (seen.has(l.name)) continue;
        if (l.value.v === null) continue;
        if (l.type === 'String') {
          seen.add(l.name);
          const s = l.value.v as string;
          objs.push({ name: l.name, type: 'String', text: s, cells: [...s], size: s.length });
        } else if (isArr(l.type)) {
          seen.add(l.name);
          const items = l.value.v as Val[];
          // A zero-length array has nothing to show, and the empty `args` the
          // JVM hands main() would otherwise head the panel on every run.
          if (!items.length) continue;
          objs.push({
            name: l.name, type: l.type, text: `[${items.map(str).join(', ')}]`,
            cells: items.map(str), size: items.length,
          });
        }
      }
    }
    return objs;
  };

  const framesOf = (): FrameSnap[] => stack.map((f) => ({ sig: f.sig, locals: f.locals() }));

  const record = (line: number, note: string) => {
    if (trace.length >= TRACE_CAP) { truncated = true; return; }
    trace.push({ line, frames: framesOf(), heap: heapOf(), out: out.length, note });
  };

  /* -------------------------------------------------- expressions */

  const frame = () => stack[stack.length - 1];

  function lookup(name: string, line: number): Val {
    const v = frame()?.get(name);
    if (v === undefined) throw new JavaError(`Cannot find symbol '${name}'`, line);
    return v;
  }

  function assignTo(target: Expr, value: Val, line: number): Val {
    if (target.e === 'name') {
      const scope = frame().find(target.id);
      if (!scope) throw new JavaError(`Cannot find symbol '${target.id}'`, line);
      const declared = scope.get(target.id)!.t;
      const next = coerce(declared, value, line);
      scope.set(target.id, next);
      return next;
    }
    if (target.e === 'index') {
      const arr = evaluate(target.target);
      if (!isArr(arr.t)) throw new JavaError('Not an array', line);
      const items = arr.v as Val[];
      const i = asNum(evaluate(target.index), line);
      if (i < 0 || i >= items.length) {
        throw new JavaError(`ArrayIndexOutOfBoundsException: Index ${i} out of bounds for length ${items.length}`, line);
      }
      const next = coerce(arr.t.slice(0, -2), value, line);
      items[i] = next;
      return next;
    }
    throw new JavaError('Cannot assign to that', line);
  }

  function binop(op: string, l: Val, r: Val, line: number): Val {
    if (op === '+' && (l.t === 'String' || r.t === 'String')) return { t: 'String', v: str(l) + str(r) };

    if (op === '==' || op === '!=') {
      const eq = l.t === 'String' || r.t === 'String' || l.t === 'null' || r.t === 'null' || l.t === 'boolean'
        ? l.v === r.v
        : asNum(l, line) === asNum(r, line);
      return { t: 'boolean', v: op === '==' ? eq : !eq };
    }
    if (op === '&&' || op === '||') {
      return { t: 'boolean', v: op === '&&' ? truthy(l, line) && truthy(r, line) : truthy(l, line) || truthy(r, line) };
    }
    if (l.t === 'boolean' && r.t === 'boolean' && (op === '&' || op === '|' || op === '^')) {
      const a = l.v as boolean, b = r.v as boolean;
      return { t: 'boolean', v: op === '&' ? a && b : op === '|' ? a || b : a !== b };
    }

    const a = asNum(l, line);
    const b = asNum(r, line);

    switch (op) {
      case '<': return { t: 'boolean', v: a < b };
      case '>': return { t: 'boolean', v: a > b };
      case '<=': return { t: 'boolean', v: a <= b };
      case '>=': return { t: 'boolean', v: a >= b };
    }

    const t = promote(l.t, r.t);
    const int = t !== 'double';
    switch (op) {
      case '+': return { t, v: int ? trunc(a + b, t) : a + b };
      case '-': return { t, v: int ? trunc(a - b, t) : a - b };
      case '*': return { t, v: int ? trunc(a * b, t) : a * b };
      case '/':
        if (b === 0 && int) throw new JavaError('ArithmeticException: / by zero', line);
        return { t, v: int ? trunc(Math.trunc(a / b), t) : a / b };
      case '%':
        if (b === 0 && int) throw new JavaError('ArithmeticException: / by zero', line);
        return { t, v: a % b };
      case '&': return { t: 'int', v: a & b };
      case '|': return { t: 'int', v: a | b };
      case '^': return { t: 'int', v: a ^ b };
      case '<<': return { t: 'int', v: a << b };
      case '>>': return { t: 'int', v: a >> b };
      case '>>>': return { t: 'int', v: a >>> b };
    }
    throw new JavaError(`Unsupported operator '${op}'`, line);
  }

  // int wraps at 32 bits, long does not (JS numbers lose precision past 2^53 —
  // ponytail: swap in BigInt if anyone actually needs 64-bit wraparound).
  const trunc = (n: number, t: string) => (t === 'long' ? Math.trunc(n) : n | 0);

  function evaluate(x: Expr): Val {
    if (++steps > STEP_CAP) throw new JavaError('Program ran too long — is a loop missing its exit?', x.line, 'limit');

    switch (x.e) {
      case 'lit': return { t: x.t, v: x.v };
      case 'name': return lookup(x.id, x.line);
      case 'bin': {
        // Short-circuit before evaluating the right side.
        if (x.op === '&&') return { t: 'boolean', v: truthy(evaluate(x.l), x.line) ? truthy(evaluate(x.r), x.line) : false };
        if (x.op === '||') return { t: 'boolean', v: truthy(evaluate(x.l), x.line) ? true : truthy(evaluate(x.r), x.line) };
        return binop(x.op, evaluate(x.l), evaluate(x.r), x.line);
      }
      case 'un': {
        const v = evaluate(x.x);
        if (x.op === '!') return { t: 'boolean', v: !truthy(v, x.line) };
        if (x.op === '-') return { t: isFloat(v.t) ? 'double' : v.t === 'long' ? 'long' : 'int', v: -asNum(v, x.line) };
        if (x.op === '+') return v;
        return { t: 'int', v: ~asNum(v, x.line) };
      }
      case 'pre': {
        const cur = evaluate(x.x);
        const next = binop(x.op === '++' ? '+' : '-', cur, { t: 'int', v: 1 }, x.line);
        return assignTo(x.x, next, x.line);
      }
      case 'post': {
        const cur = evaluate(x.x);
        assignTo(x.x, binop(x.op === '++' ? '+' : '-', cur, { t: 'int', v: 1 }, x.line), x.line);
        return cur;
      }
      case 'assign': {
        const value = x.op === '='
          ? evaluate(x.value)
          : binop(x.op.slice(0, -1), evaluate(x.target), evaluate(x.value), x.line);
        return assignTo(x.target, value, x.line);
      }
      case 'cond': return truthy(evaluate(x.c), x.line) ? evaluate(x.a) : evaluate(x.b);
      case 'cast': {
        const v = evaluate(x.x);
        return coerce(x.type, v, x.line);
      }
      case 'index': {
        const arr = evaluate(x.target);
        if (!isArr(arr.t)) throw new JavaError('Not an array', x.line);
        const items = arr.v as Val[];
        const i = asNum(evaluate(x.index), x.line);
        if (i < 0 || i >= items.length) {
          throw new JavaError(`ArrayIndexOutOfBoundsException: Index ${i} out of bounds for length ${items.length}`, x.line);
        }
        return items[i];
      }
      case 'field': return field(x);
      case 'newarr': return newArray(x);
      case 'call': return call(x);
    }
  }

  function field(x: Expr & { e: 'field' }): Val {
    // Static-looking names first, so `Integer.MAX_VALUE` never shadows a local.
    if (x.target.e === 'name') {
      const owner = x.target.id;
      const key = `${owner}.${x.name}`;
      const konst: Record<string, Val> = {
        'Math.PI': { t: 'double', v: Math.PI },
        'Math.E': { t: 'double', v: Math.E },
        'Integer.MAX_VALUE': { t: 'int', v: 2147483647 },
        'Integer.MIN_VALUE': { t: 'int', v: -2147483648 },
        'Long.MAX_VALUE': { t: 'long', v: Number.MAX_SAFE_INTEGER },
        'Double.MAX_VALUE': { t: 'double', v: Number.MAX_VALUE },
      };
      if (konst[key] && !frame()?.get(owner)) return konst[key];
    }
    const t = evaluate(x.target);
    if (x.name === 'length') {
      if (isArr(t.t)) return { t: 'int', v: (t.v as Val[]).length };
      if (t.t === 'String') return { t: 'int', v: (t.v as string).length };
    }
    throw new JavaError(`Unknown field '${x.name}'`, x.line);
  }

  function newArray(x: Expr & { e: 'newarr' }): Val {
    const elem = x.type.endsWith('[]') ? x.type : x.type;
    if (x.init) {
      const items = x.init.map((i) => evaluate(i));
      const t = elem === 'var' ? (items[0]?.t ?? 'int') : elem;
      return { t: `${t}[]`, v: items.map((i) => coerce(t, i, x.line)) };
    }
    const n = asNum(evaluate(x.sizes[0]), x.line);
    if (n < 0) throw new JavaError('NegativeArraySizeException', x.line);
    if (n > 5_000_000) throw new JavaError('OutOfMemoryError: array too large', x.line);
    const zero: Val = elem === 'boolean' ? { t: 'boolean', v: false }
      : elem === 'String' ? { t: 'String', v: null }
      : isNum(elem) ? { t: elem, v: 0 }
      : { t: 'null', v: null };
    return { t: `${elem}[]`, v: Array.from({ length: n }, () => ({ ...zero })) };
  }

  function printed(args: Val[]): string {
    return args.map(str).join('');
  }

  function call(x: Expr & { e: 'call' }): Val {
    const line = x.line;

    /* System.out.* — matched on the shape `System.out.name(...)`. */
    if (x.target?.e === 'field' && x.target.name === 'out' && x.target.target.e === 'name' && x.target.target.id === 'System') {
      const args = x.args.map((a) => evaluate(a));
      if (x.name === 'println' || x.name === 'print') {
        emit(printed(args) + (x.name === 'println' ? '\n' : ''));
        // The printed-series chart only wants values that are actually numeric.
        if (args.length === 1 && isNum(args[0].t) && args[0].t !== 'char') series.push(args[0].v as number);
        return { t: 'void', v: null };
      }
      if (x.name === 'printf' || x.name === 'format') {
        emit(format(str(args[0]), args.slice(1)));
        return { t: 'void', v: null };
      }
      throw new JavaError(`System.out has no method '${x.name}'`, line);
    }

    /* Static helpers on a bare class name. */
    if (x.target?.e === 'name' && !frame()?.get(x.target.id)) {
      const owner = x.target.id;
      const args = x.args.map((a) => evaluate(a));
      const st = staticCall(owner, x.name, args, line);
      if (st) return st;
      const m = methods.get(`${owner}.${x.name}`);
      if (m) return invoke(m, args, line);
    }

    /* Instance methods — String only, which is the whole reference surface here. */
    if (x.target) {
      const recv = evaluate(x.target);
      const args = x.args.map((a) => evaluate(a));
      return instanceCall(recv, x.name, args, line);
    }

    /* Bare name: a method in this file, or a conversion from `new`. */
    if (x.name.startsWith('new ')) {
      const type = x.name.slice(4);
      const args = x.args.map((a) => evaluate(a));
      if (type === 'String') return { t: 'String', v: args.length ? str(args[0]) : '' };
      if (['Integer', 'Long', 'Short', 'Byte'].includes(type)) return { t: 'int', v: Math.trunc(asNum(args[0], line)) };
      if (['Double', 'Float'].includes(type)) return { t: 'double', v: asNum(args[0], line) };
      throw new JavaError(`'new ${type}' is outside the supported subset`, line);
    }

    const m = methods.get(x.name);
    if (!m) throw new JavaError(`Cannot find method '${x.name}'`, line);
    return invoke(m, x.args.map((a) => evaluate(a)), line);
  }

  function staticCall(owner: string, name: string, args: Val[], line: number): Val | null {
    const n = (i: number) => asNum(args[i], line);
    if (owner === 'Math') {
      switch (name) {
        case 'abs': return { t: args[0].t === 'double' ? 'double' : 'int', v: Math.abs(n(0)) };
        case 'max': return { t: promote(args[0].t, args[1].t), v: Math.max(n(0), n(1)) };
        case 'min': return { t: promote(args[0].t, args[1].t), v: Math.min(n(0), n(1)) };
        case 'pow': return { t: 'double', v: Math.pow(n(0), n(1)) };
        case 'sqrt': return { t: 'double', v: Math.sqrt(n(0)) };
        case 'cbrt': return { t: 'double', v: Math.cbrt(n(0)) };
        case 'floor': return { t: 'double', v: Math.floor(n(0)) };
        case 'ceil': return { t: 'double', v: Math.ceil(n(0)) };
        case 'round': return { t: 'long', v: Math.round(n(0)) };
        case 'random': return { t: 'double', v: Math.random() };
        case 'hypot': return { t: 'double', v: Math.hypot(n(0), n(1)) };
        case 'log': return { t: 'double', v: Math.log(n(0)) };
        case 'log10': return { t: 'double', v: Math.log10(n(0)) };
        case 'exp': return { t: 'double', v: Math.exp(n(0)) };
        case 'sin': return { t: 'double', v: Math.sin(n(0)) };
        case 'cos': return { t: 'double', v: Math.cos(n(0)) };
        case 'tan': return { t: 'double', v: Math.tan(n(0)) };
        case 'signum': return { t: 'double', v: Math.sign(n(0)) };
      }
      throw new JavaError(`Math has no method '${name}'`, line);
    }
    if (owner === 'Integer') {
      if (name === 'parseInt') {
        const parsed = parseInt(str(args[0]).trim(), args[1] ? n(1) : 10);
        if (Number.isNaN(parsed)) throw new JavaError(`NumberFormatException: For input string: "${str(args[0])}"`, line);
        return { t: 'int', v: parsed | 0 };
      }
      if (name === 'valueOf') return { t: 'int', v: Math.trunc(Number(str(args[0]))) };
      if (name === 'toString') return { t: 'String', v: String(Math.trunc(n(0))) };
      if (name === 'toBinaryString') return { t: 'String', v: (n(0) >>> 0).toString(2) };
      if (name === 'toHexString') return { t: 'String', v: (n(0) >>> 0).toString(16) };
      if (name === 'max') return { t: 'int', v: Math.max(n(0), n(1)) };
      if (name === 'min') return { t: 'int', v: Math.min(n(0), n(1)) };
    }
    if (owner === 'Double' || owner === 'Float') {
      if (name === 'parseDouble' || name === 'parseFloat') {
        const parsed = Number(str(args[0]).trim());
        if (Number.isNaN(parsed)) throw new JavaError(`NumberFormatException: For input string: "${str(args[0])}"`, line);
        return { t: 'double', v: parsed };
      }
      if (name === 'toString') return { t: 'String', v: dstr(n(0)) };
    }
    if (owner === 'String') {
      if (name === 'valueOf') return { t: 'String', v: str(args[0]) };
      if (name === 'join') {
        const parts = args.slice(1).flatMap((a) => (isArr(a.t) ? (a.v as Val[]).map(str) : [str(a)]));
        return { t: 'String', v: parts.join(str(args[0])) };
      }
      if (name === 'format') return { t: 'String', v: format(str(args[0]), args.slice(1)) };
    }
    if (owner === 'Arrays') {
      const arr = args[0];
      if (!isArr(arr.t)) throw new JavaError('Arrays methods need an array', line);
      const items = arr.v as Val[];
      if (name === 'toString') return { t: 'String', v: `[${items.map(str).join(', ')}]` };
      if (name === 'sort') {
        items.sort((a, b) => (isNum(a.t) ? (a.v as number) - (b.v as number) : str(a).localeCompare(str(b))));
        return { t: 'void', v: null };
      }
      if (name === 'fill') {
        const el = arr.t.slice(0, -2);
        for (let i = 0; i < items.length; i++) items[i] = coerce(el, args[1], line);
        return { t: 'void', v: null };
      }
      if (name === 'copyOf') {
        const len = n(1);
        const el = arr.t.slice(0, -2);
        const zero: Val = isNum(el) ? { t: el, v: 0 } : el === 'boolean' ? { t: 'boolean', v: false } : { t: el, v: null };
        return { t: arr.t, v: Array.from({ length: len }, (_, i) => items[i] ?? { ...zero }) };
      }
    }
    return null;
  }

  function instanceCall(recv: Val, name: string, args: Val[], line: number): Val {
    if (isArr(recv.t) && name === 'length') return { t: 'int', v: (recv.v as Val[]).length };

    if (recv.t !== 'String') throw new JavaError(`'${recv.t}' has no method '${name}' in this subset`, line);
    if (recv.v === null) throw new JavaError('NullPointerException', line);
    const s = recv.v as string;
    const n = (i: number) => asNum(args[i], line);

    switch (name) {
      case 'length': return { t: 'int', v: s.length };
      case 'charAt': {
        const i = n(0);
        if (i < 0 || i >= s.length) throw new JavaError(`StringIndexOutOfBoundsException: index ${i}, length ${s.length}`, line);
        return { t: 'char', v: s.charCodeAt(i) };
      }
      case 'substring': return { t: 'String', v: args.length > 1 ? s.slice(n(0), n(1)) : s.slice(n(0)) };
      case 'indexOf': return { t: 'int', v: s.indexOf(str(args[0]), args[1] ? n(1) : 0) };
      case 'lastIndexOf': return { t: 'int', v: s.lastIndexOf(str(args[0])) };
      case 'toUpperCase': return { t: 'String', v: s.toUpperCase() };
      case 'toLowerCase': return { t: 'String', v: s.toLowerCase() };
      case 'trim': case 'strip': return { t: 'String', v: s.trim() };
      case 'isEmpty': return { t: 'boolean', v: s.length === 0 };
      case 'isBlank': return { t: 'boolean', v: s.trim().length === 0 };
      case 'equals': return { t: 'boolean', v: args[0].t === 'String' && s === args[0].v };
      case 'equalsIgnoreCase': return { t: 'boolean', v: s.toLowerCase() === str(args[0]).toLowerCase() };
      case 'contains': return { t: 'boolean', v: s.includes(str(args[0])) };
      case 'startsWith': return { t: 'boolean', v: s.startsWith(str(args[0])) };
      case 'endsWith': return { t: 'boolean', v: s.endsWith(str(args[0])) };
      case 'concat': return { t: 'String', v: s + str(args[0]) };
      case 'replace': return { t: 'String', v: s.split(str(args[0])).join(str(args[1])) };
      case 'repeat': return { t: 'String', v: s.repeat(Math.max(0, n(0))) };
      case 'compareTo': return { t: 'int', v: s < str(args[0]) ? -1 : s > str(args[0]) ? 1 : 0 };
      case 'split': return { t: 'String[]', v: s.split(new RegExp(str(args[0]))).map((p) => ({ t: 'String', v: p })) };
      case 'toCharArray': return { t: 'char[]', v: [...s].map((ch) => ({ t: 'char', v: ch.charCodeAt(0) })) };
      case 'toString': return recv;
      case 'hashCode': {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
        return { t: 'int', v: h };
      }
    }
    throw new JavaError(`String has no method '${name}'`, line);
  }

  /** The %d / %s / %.2f subset of Formatter that beginner code actually uses. */
  function format(fmt: string, args: Val[]): string {
    let i = 0;
    return fmt.replace(/%(-)?(\d+)?(?:\.(\d+))?([dsfnb%])/g, (_m, left, width, prec, kind) => {
      if (kind === '%') return '%';
      if (kind === 'n') return '\n';
      const a = args[i++];
      let s: string;
      if (kind === 'f') s = (a ? asNum(a, 0) : 0).toFixed(prec === undefined ? 6 : Number(prec));
      else if (kind === 'd') s = String(Math.trunc(a ? asNum(a, 0) : 0));
      else if (kind === 'b') s = String(a ? a.v !== false && a.v !== null : false);
      else s = a ? str(a) : 'null';
      const w = Number(width ?? 0);
      return s.length >= w ? s : left ? s.padEnd(w) : s.padStart(w);
    });
  }

  function invoke(m: MethodDecl, args: Val[], line: number): Val {
    if (stack.length > 400) throw new JavaError('StackOverflowError', line);
    if (args.length !== m.params.length) {
      throw new JavaError(`${m.name} expects ${m.params.length} argument(s), got ${args.length}`, line);
    }

    const sig = `${m.name}(${m.params.map((p) => p.type).join(', ')})`;
    const f = new Frame(sig);
    m.params.forEach((prm, i) => f.declare(prm.name, coerce(prm.type, args[i], line)));
    stack.push(f);
    record(m.line, `call ${m.name}`);

    const flow = execBlock(m.body, f);
    const ret = flow && flow.signal === 'return' ? flow.value : { t: 'void' as const, v: null };

    record(m.line, `return ${m.ret === 'void' ? '' : str(ret)}`.trim());
    stack.pop();
    return m.ret === 'void' ? { t: 'void', v: null } : coerce(m.ret, ret, line);
  }

  /* -------------------------------------------------- statements */

  function execBlock(body: Stmt[], f: Frame): Flow {
    f.push();
    try {
      for (const st of body) {
        const flow = exec(st, f);
        if (flow) return flow;
      }
      return null;
    } finally {
      f.pop();
    }
  }

  function exec(st: Stmt, f: Frame): Flow {
    if (++steps > STEP_CAP) throw new JavaError('Program ran too long — is a loop missing its exit?', st.line, 'limit');

    switch (st.s) {
      case 'empty': return null;

      case 'var': {
        for (const d of st.decls) {
          const type = st.type + '[]'.repeat(d.extraDims);
          const value = d.init ? coerce(type, evaluate(d.init), st.line) : defaultOf(type);
          f.declare(d.name, value);
        }
        record(st.line, `${st.decls.map((d) => d.name).join(', ')} = ${st.decls.map((d) => str(f.get(d.name)!)).join(', ')}`);
        return null;
      }

      case 'expr': {
        evaluate(st.x);
        record(st.line, describe(st.x));
        return null;
      }

      case 'block': return execBlock(st.body, f);

      case 'if': {
        record(st.line, 'if');
        if (truthy(evaluate(st.c), st.line)) return exec(st.then, f);
        return st.else ? exec(st.else, f) : null;
      }

      case 'while': {
        while (truthy(evaluate(st.c), st.line)) {
          record(st.line, 'while');
          const flow = exec(st.body, f);
          if (flow === BREAK) break;
          if (flow && flow !== CONTINUE) return flow;
        }
        return null;
      }

      case 'do': {
        do {
          record(st.line, 'do');
          const flow = exec(st.body, f);
          if (flow === BREAK) break;
          if (flow && flow !== CONTINUE) return flow;
        } while (truthy(evaluate(st.c), st.line));
        return null;
      }

      case 'for': {
        f.push();
        try {
          if (st.init) exec(st.init, f);
          while (st.c === null || truthy(evaluate(st.c), st.line)) {
            record(st.line, 'for');
            const flow = exec(st.body, f);
            if (flow === BREAK) break;
            if (flow && flow !== CONTINUE) return flow;
            for (const s of st.step) evaluate(s);
          }
          return null;
        } finally {
          f.pop();
        }
      }

      case 'foreach': {
        const it = evaluate(st.iter);
        const items = isArr(it.t) ? (it.v as Val[])
          : it.t === 'String' ? [...(it.v as string)].map((c) => ({ t: 'char', v: c.charCodeAt(0) } as Val))
          : null;
        if (!items) throw new JavaError('Can only loop over an array or a String', st.line);
        f.push();
        try {
          f.declare(st.name, defaultOf(st.type));
          for (const item of items) {
            f.find(st.name)!.set(st.name, coerce(st.type, item, st.line));
            record(st.line, `${st.name} = ${str(item)}`);
            const flow = exec(st.body, f);
            if (flow === BREAK) break;
            if (flow && flow !== CONTINUE) return flow;
          }
          return null;
        } finally {
          f.pop();
        }
      }

      case 'return': {
        const value = st.x ? evaluate(st.x) : { t: 'void' as const, v: null };
        record(st.line, `return ${st.x ? str(value) : ''}`.trim());
        return { signal: 'return', value };
      }

      case 'break': return BREAK;
      case 'continue': return CONTINUE;
    }
  }

  function defaultOf(type: string): Val {
    if (isArr(type)) return { t: type, v: null };
    if (type === 'boolean') return { t: 'boolean', v: false };
    if (type === 'String') return { t: 'String', v: null };
    if (isNum(type)) return { t: type, v: 0 };
    return { t: type, v: null };
  }

  /** A short human label for the timeline, e.g. `total = total + i`. */
  function describe(x: Expr): string {
    if (x.e === 'assign' && x.target.e === 'name') return `${x.target.id} ${x.op} …`;
    if (x.e === 'post' && x.x.e === 'name') return `${x.x.id}${x.op}`;
    if (x.e === 'pre' && x.x.e === 'name') return `${x.op}${x.x.id}`;
    if (x.e === 'call') return `${x.name}()`;
    return '';
  }

  /* -------------------------------------------------- go */

  const main = methods.get(entry) ?? methods.get('main');
  if (!main) {
    return {
      out: [], error: { message: `No ${entry} method found`, line: 1 }, exit: 1,
      ms: Math.round(performance.now() - started), steps: 0, truncated: false,
      frames: [], heap: [], series: [], trace: [],
    };
  }

  let finalFrames: FrameSnap[] = [];
  let finalHeap: HeapObj[] = [];

  try {
    const args: Val[] = main.params.length ? [{ t: 'String[]', v: [] }] : [];
    const sig = `${main.name}(${main.params.map((p) => `${p.type} ${p.name}`).join(', ')})`;
    const f = new Frame(sig);
    main.params.forEach((prm, i) => f.declare(prm.name, args[i] ?? defaultOf(prm.type)));
    stack.push(f);
    record(main.line, `call ${main.name}`);

    // Deliberately not execBlock(): that pops the body scope on the way out,
    // and the call-stack panel is meant to show what main was holding at the
    // moment it returned. So run the body here and snapshot before unwinding.
    f.push();
    for (const st of main.body) if (exec(st, f)) break;
    finalFrames = framesOf();
    finalHeap = heapOf();
    record(main.line, 'exit');
    f.pop();
    stack.pop();
  } catch (e) {
    const je = e instanceof JavaError ? e : new JavaError(e instanceof Error ? e.message : String(e), 0);
    error = { message: je.message, line: je.line };
    finalFrames = framesOf();
    finalHeap = heapOf();
    record(je.line, 'threw');
  }

  flush();   // a trailing print() with no newline still belongs on screen

  return {
    out,
    error,
    exit: error ? 1 : 0,
    ms: Math.max(1, Math.round(performance.now() - started)),
    steps,
    truncated,
    frames: finalFrames,
    heap: finalHeap,
    series,
    trace,
  };
}

/* ============================================ 4. Syntax highlighting */

export type Piece = { text: string; cls: 'kw' | 'str' | 'num' | 'com' | 'typ' | 'fn' | 'pun' | 'txt' };

/**
 * Re-lexes for colour. Comments and whitespace are not tokens, so this walks the
 * source and fills the gaps between token spans — that way the output always
 * reconstructs the input exactly, and a lexer error still renders as plain text.
 */
export function highlight(src: string): Piece[] {
  let toks: Tok[];
  try { toks = lex(src); } catch { return [{ text: src, cls: 'txt' }]; }

  const out: Piece[] = [];
  let at = 0;

  const gap = (upto: number) => {
    if (upto <= at) return;
    const text = src.slice(at, upto);
    // Whitespace between tokens may hide a comment; colour it as one if so.
    for (const part of text.split(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g)) {
      if (!part) continue;
      out.push({ text: part, cls: part.startsWith('//') || part.startsWith('/*') ? 'com' : 'txt' });
    }
    at = upto;
  };

  toks.forEach((t, i) => {
    if (t.k === 'eof') return;
    gap(t.from);
    const raw = src.slice(t.from, t.to);
    const next = toks[i + 1]?.v;
    const cls: Piece['cls'] =
      t.k === 'kw' ? 'kw'
      : t.k === 'str' || t.k === 'chr' ? 'str'
      : t.k === 'num' ? 'num'
      : t.k === 'op' ? 'pun'
      : next === '(' ? 'fn'
      : /^[A-Z]/.test(t.v) ? 'typ'
      : 'txt';
    out.push({ text: raw, cls });
    at = t.to;
  });
  gap(src.length);
  return out;
}

/* ==================================================== 5. Self-check */

/**
 * One runnable check covering the paths that would silently give wrong answers:
 * integer division, string building, arrays, loops with break, recursion, and
 * the two error cases the UI has to render. Call from a scratch file:
 *   node -e "require('./lib/java').demo()"
 */
export function demo() {
  const ok = (label: string, got: unknown, want: unknown) => {
    const g = JSON.stringify(got);
    const w = JSON.stringify(want);
    if (g !== w) throw new Error(`${label}: got ${g}, wanted ${w}`);
  };

  const src = (body: string) => `public class Main { public static void main(String[] args) { ${body} } }`;

  ok('int division truncates', run(src('System.out.println(7 / 2);')).out, ['3']);
  ok('double division does not', run(src('System.out.println(7 / 2.0);')).out, ['3.5']);
  ok('whole doubles keep the point', run(src('System.out.println(4.0);')).out, ['4.0']);
  ok('string concat coerces', run(src('int n = 3; System.out.println("n=" + n + "!");')).out, ['n=3!']);
  ok('char prints as a character', run(src("char c = 'A'; System.out.println(c);")).out, ['A']);
  ok('char plus int promotes to int', run(src("char c = 'A'; System.out.println(c + 1);")).out, ['66']);

  ok('for loop accumulates',
    run(src('int t = 0; for (int i = 1; i <= 10; i++) { t = t + i; } System.out.println(t);')).out, ['55']);
  ok('while with break',
    run(src('int i = 0; while (true) { i++; if (i == 4) break; } System.out.println(i);')).out, ['4']);
  ok('arrays index and length',
    run(src('int[] a = {5, 6, 7}; System.out.println(a[1] + a.length);')).out, ['9']);
  ok('for-each over an array',
    run(src('int s = 0; for (int x : new int[]{1,2,3}) s += x; System.out.println(s);')).out, ['6']);
  ok('String methods',
    run(src('String s = "Mika"; System.out.println(s.length() + " " + s.toUpperCase().charAt(0));')).out, ['4 M']);

  ok('recursion',
    run('class Main { static int fib(int n) { if (n < 2) return n; return fib(n-1) + fib(n-2); } public static void main(String[] a) { System.out.println(fib(10)); } }').out,
    ['55']);

  ok('printf', run(src('System.out.printf("%.2f%n", 3.14159);')).out, ['3.14']);
  ok('print does not end the line', run(src('System.out.print("a"); System.out.print("b"); System.out.println("c");')).out, ['abc']);
  ok('a trailing print still shows', run(src('System.out.print("no newline");')).out, ['no newline']);

  const div = run(src('System.out.println(1 / 0);'));
  ok('divide by zero is caught', div.error?.message.includes('/ by zero'), true);

  const oob = run(src('int[] a = new int[2]; System.out.println(a[5]);'));
  ok('index out of bounds is caught', oob.error?.message.includes('out of bounds'), true);

  const loop = run(src('while (true) { int x = 1; }'));
  ok('runaway loop is stopped', loop.error?.message.includes('too long'), true);

  const bad = run('class Main { public static void main(String[] a) { int x = ; } }');
  ok('syntax errors report a line', typeof bad.error?.line, 'number');

  const traced = run(src('String name = "Mika"; int total = 0; for (int i = 1; i <= 10; i++) total += i; System.out.println("Sum = " + total);'));
  ok('trace is recorded', traced.trace.length > 5, true);
  ok('heap sees the String', traced.heap.some((h) => h.name === 'name' && h.size === 4), true);
  ok('call stack survives the return', traced.frames[0]?.locals.some((l) => l.name === 'total' && l.text === '55'), true);

  const series = run(src('for (int i = 1; i <= 3; i++) System.out.println(i * i);'));
  ok('printed series collected', series.series, [1, 4, 9]);

  return 'java: all checks passed';
}
