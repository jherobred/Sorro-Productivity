/**
 * A full-featured Java AST interpreter and execution trace engine for the
 * Notebooks → Java tab and interactive 3D Visualizer.
 *
 * Supports:
 *   - Variables, primitive types (int, long, short, byte, double, float, char, boolean, String)
 *   - Multi-dimensional arrays (1D, 2D matrices, array literals, length, indexing, assignment)
 *   - Object-oriented features: classes, static nested/inner classes, fields, constructors,
 *     object instantiation (new Node(...)), field access/mutation, this references
 *   - Control flow: if/else, while, do/while, for, for-each, break, continue, return
 *   - Recursion and deep call stack tracing
 *   - Standard library: System.out (println, print, printf), Math (abs, max, min, pow, sqrt, etc.),
 *     Arrays (toString, sort, fill, copyOf), Integer/Double parse and helper methods, String methods
 *   - Rich execution trace recording: Call stack frames with typed badges, deep heap snapshots
 *     (1D arrays, 2D terrain grids, binary trees, linked list node chains), and descriptive step notes.
 */

const STEP_CAP = 400_000;
const TRACE_CAP = 1_500;

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

// Fields are declared and assigned by hand rather than as constructor
// parameter properties: `npm test` runs these files through Node's strip-only
// type stripping, which cannot rewrite a parameter property into an assignment.
export class JavaError extends Error {
  readonly line: number;
  readonly kind: string;
  constructor(message: string, line: number, kind = 'error') {
    super(message);
    this.line = line;
    this.kind = kind;
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

export type Expr =
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
  | { e: 'newobj'; className: string; args: Expr[]; line: number }
  | { e: 'cast'; type: string; x: Expr; line: number };

export type Stmt =
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

export type FieldDecl = {
  name: string;
  type: string;
  init: Expr | null;
  line: number;
  isStatic?: boolean;
};

export type MethodDecl = {
  name: string;
  ret: string;
  params: { type: string; name: string }[];
  body: Stmt[];
  line: number;
  isStatic?: boolean;
};

export type ClassDecl = {
  name: string;
  methods: MethodDecl[];
  fields: FieldDecl[];
  innerClasses: ClassDecl[];
  isStatic?: boolean;
};

export type Program = {
  classes: ClassDecl[];
};

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
    return t.k === 'id' && /^[A-Za-z_$]/.test(t.v);
  };

  const parseType = (): string => {
    let name = wantId();
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
      const isFloatLit = suffix === 'f' || suffix === 'd' || /[.eE]/.test(body.replace(/^0[xX]/, ''));
      const v = /^0[xX]/.test(body) ? parseInt(body, 16) : Number(body);
      return { e: 'lit', t: isFloatLit ? 'double' : suffix === 'l' ? 'long' : 'int', v, line };
    }
    if (t.k === 'str') { p++; return { e: 'lit', t: 'String', v: t.v, line }; }
    if (t.k === 'chr') { p++; return { e: 'lit', t: 'char', v: t.v.charCodeAt(0), line }; }
    if (at('true') || at('false')) { p++; return { e: 'lit', t: 'boolean', v: t.v === 'true', line }; }
    if (eat('null')) return { e: 'lit', t: 'null', v: null, line };

    if (eat('new')) {
      let type = wantId();
      if (at('<')) {
        let depth = 0;
        do {
          if (at('<')) depth++;
          if (at('>')) depth--;
          if (at('>>')) depth -= 2;
          p++;
        } while (depth > 0 && peek().k !== 'eof');
      }

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
        return { e: 'newarr', type: type + '[]'.repeat(dims), sizes, init, line };
      }

      want('(');
      const args: Expr[] = [];
      if (!at(')')) do { args.push(expression()); } while (eat(','));
      want(')');
      return { e: 'newobj', className: type, args, line };
    }

    if (eat('(')) {
      if (looksLikeType() && (peek(1).v === ')' || (peek(1).v === '[' && peek(2).v === ']'))) {
        const save = p;
        const type = parseType();
        if (eat(')')) {
          const nxt = peek();
          const startsValue = nxt.k === 'num' || nxt.k === 'str' || nxt.k === 'chr' || nxt.k === 'id'
            || nxt.v === '(' || nxt.v === '-' || nxt.v === '!' || nxt.v === '~' || nxt.v === 'new';
          if (startsValue && (PRIMS.has(type.replace('[]', '')) || /^[A-Za-z_$]/.test(type))) {
            return { e: 'cast', type, x: unary(), line };
          }
        }
        p = save;
      }
      const x = expression();
      want(')');
      return x;
    }

    if (at('{')) {
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
        if (at('}')) break;
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

  const isLocalDecl = (): boolean => {
    if (peek().k === 'kw' && PRIMS.has(peek().v)) return true;
    if (peek().k !== 'id') return false;
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

    while (MODIFIERS.has(peek().v) && peek().k === 'kw') p++;

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

  /* ---- top level & classes ---- */

  const classDecl = (): ClassDecl => {
    let isStatic = false;
    while (MODIFIERS.has(peek().v) && peek().k === 'kw') {
      if (peek().v === 'static') isStatic = true;
      p++;
    }
    if (!eat('class')) want('class');
    const name = wantId();
    if (eat('extends')) parseType();
    if (eat('implements')) do { parseType(); } while (eat(','));
    want('{');

    const methods: MethodDecl[] = [];
    const fields: FieldDecl[] = [];
    const innerClasses: ClassDecl[] = [];

    while (!at('}') && peek().k !== 'eof') {
      if (eat(';')) continue;
      let memberStatic = false;
      while (MODIFIERS.has(peek().v) && peek().k === 'kw') {
        if (peek().v === 'static') memberStatic = true;
        p++;
      }
      if (at('@')) { p++; wantId(); continue; }

      if (at('class')) {
        innerClasses.push(classDecl());
        continue;
      }

      const line = peek().line;
      const typeOrRet = parseType();
      const nextTok = peek();

      // Constructor: Type matches class name and is followed by '('
      if (nextTok.v === '(' && typeOrRet === name) {
        want('(');
        const params: { type: string; name: string }[] = [];
        if (!at(')')) do {
          while (eat('final'));
          params.push({ type: parseType(), name: wantId() });
        } while (eat(','));
        want(')');
        if (eat('throws')) do { parseType(); } while (eat(','));
        const body = (block() as { body: Stmt[] }).body;
        methods.push({ name: '<init>', ret: 'void', params, body, line, isStatic: false });
        continue;
      }

      const memberName = wantId();
      if (at('(')) {
        // Method declaration
        want('(');
        const params: { type: string; name: string }[] = [];
        if (!at(')')) do {
          while (eat('final'));
          params.push({ type: parseType(), name: wantId() });
        } while (eat(','));
        want(')');
        if (eat('throws')) do { parseType(); } while (eat(','));
        if (eat(';')) { continue; }
        const body = (block() as { body: Stmt[] }).body;
        methods.push({ name: memberName, ret: typeOrRet, params, body, line, isStatic: memberStatic });
      } else {
        // Field declaration
        let extraDims = 0;
        while (at('[') && peek(1).v === ']') { p += 2; extraDims++; }
        let init: Expr | null = eat('=') ? expression() : null;
        fields.push({
          name: memberName,
          type: typeOrRet + '[]'.repeat(extraDims),
          init,
          line,
          isStatic: memberStatic,
        });

        while (eat(',')) {
          const extraName = wantId();
          let extraDims2 = 0;
          while (at('[') && peek(1).v === ']') { p += 2; extraDims2++; }
          const extraInit = eat('=') ? expression() : null;
          fields.push({
            name: extraName,
            type: typeOrRet + '[]'.repeat(extraDims2),
            init: extraInit,
            line,
            isStatic: memberStatic,
          });
        }
        want(';');
      }
    }
    want('}');
    return { name, methods, fields, innerClasses, isStatic };
  };

  const classes: ClassDecl[] = [];
  while (peek().k !== 'eof') {
    if (eat('package') || eat('import')) { while (!at(';') && peek().k !== 'eof') p++; want(';'); continue; }
    if (at('@')) { p++; wantId(); continue; }
    classes.push(classDecl());
  }
  if (!classes.length) throw new JavaError('No class found — wrap your code in `public class Main { … }`', 1);
  return { classes };
}

/* =========================================================== 3. Execution */

export type JavaObject = {
  _id: number;
  className: string;
  fields: Map<string, Val>;
};

export type Val = { t: string; v: unknown };

export type Local = { name: string; type: string; text: string; value: Val };
export type FrameSnap = { sig: string; locals: Local[] };
export type HeapObj = { name: string; type: string; text: string; cells: string[] | null; size: number };

export type Step = {
  line: number;
  frames: FrameSnap[];
  heap: HeapObj[];
  out: number;
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

function dstr(n: number): string {
  if (Number.isNaN(n)) return 'NaN';
  if (n === Infinity) return 'Infinity';
  if (n === -Infinity) return '-Infinity';
  if (Number.isInteger(n) && Math.abs(n) < 1e7) return `${n}.0`;
  return String(n);
}

export function str(x: Val | undefined | null): string {
  if (!x || x.v === null || x.t === 'null') return 'null';
  if (x.t === 'char') return String.fromCharCode(x.v as number);
  if (isFloat(x.t)) return dstr(x.v as number);
  if (isArr(x.t)) {
    const items = x.v as Val[];
    return `[${items.map(str).join(', ')}]`;
  }
  if (typeof x.v === 'object' && x.v !== null && '_id' in x.v) {
    const obj = x.v as JavaObject;
    if (obj.fields.has('val')) {
      const valV = obj.fields.get('val');
      return `${obj.className}(${str(valV)})`;
    }
    return `${obj.className}#${obj._id}`;
  }
  return String(x.v);
}

const truthy = (x: Val, line: number): boolean => {
  if (x.t !== 'boolean') throw new JavaError(`Expected a boolean, found ${x.t}`, line);
  return x.v as boolean;
};

const promote = (a: string, b: string) =>
  isFloat(a) || isFloat(b) ? 'double' : a === 'long' || b === 'long' ? 'long' : 'int';

const asNum = (x: Val, line: number): number => {
  if (!isNum(x.t)) throw new JavaError(`Expected a number, found ${x.t}`, line);
  return x.v as number;
};

function coerce(type: string, x: Val, line: number): Val {
  if (type === 'var' || type === x.t) return { t: type === 'var' ? x.t : type, v: x.v };
  if (type === 'String') {
    if (x.t === 'null' || x.v === null) return { t: 'String', v: null };
    return { t: 'String', v: str(x) };
  }
  if (type === 'boolean') {
    if (x.t !== 'boolean') throw new JavaError(`Cannot put ${x.t} into a boolean`, line);
    return x;
  }
  if (isArr(type)) {
    if (x.t === 'null' || x.v === null) return { t: type, v: null };
    return { t: type, v: x.v };
  }
  if (isNum(type)) {
    const n = asNum(x, line);
    if (isFloat(type)) return { t: type, v: n };
    if (type === 'char') return { t: 'char', v: Math.trunc(n) & 0xffff };
    if (type === 'byte') return { t: 'byte', v: (Math.trunc(n) << 24) >> 24 };
    if (type === 'short') return { t: 'short', v: (Math.trunc(n) << 16) >> 16 };
    if (type === 'long') return { t: 'long', v: Math.trunc(n) };
    return { t: 'int', v: Math.trunc(n) | 0 };
  }
  // User object references
  if (x.t === 'null' || x.v === null) return { t: type, v: null };
  return { t: type, v: x.v };
}

class Frame {
  scopes: Map<string, Val>[] = [new Map()];
  readonly sig: string;
  thisVal: Val | null;
  constructor(sig: string, thisVal: Val | null = null) {
    this.sig = sig;
    this.thisVal = thisVal;
  }

  push() { this.scopes.push(new Map()); }
  pop() { this.scopes.pop(); }
  declare(name: string, v: Val) { this.scopes[this.scopes.length - 1].set(name, v); }

  find(name: string): Map<string, Val> | null {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) return this.scopes[i];
    }
    return null;
  }

  get(name: string): Val | undefined {
    const s = this.find(name);
    if (s) return s.get(name);
    if (this.thisVal && this.thisVal.v && typeof this.thisVal.v === 'object') {
      const obj = this.thisVal.v as JavaObject;
      return obj.fields?.get(name);
    }
    return undefined;
  }

  setField(name: string, value: Val): boolean {
    if (this.thisVal && this.thisVal.v && typeof this.thisVal.v === 'object') {
      const obj = this.thisVal.v as JavaObject;
      if (obj.fields && (obj.fields.has(name) || name in obj.fields)) {
        obj.fields.set(name, value);
        return true;
      }
    }
    return false;
  }

  locals(): Local[] {
    const out: Local[] = [];
    for (const sc of this.scopes) {
      for (const [name, val] of sc) {
        if (name === 'this') continue;
        out.push({ name, type: val.t, text: str(val), value: val });
      }
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
  let objectIdCounter = 0;

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

  const classMap = new Map<string, ClassDecl>();
  const methods = new Map<string, MethodDecl>();

  function registerClass(c: ClassDecl, outerName = '') {
    const fullName = outerName ? `${outerName}.${c.name}` : c.name;
    classMap.set(c.name, c);
    if (outerName) classMap.set(fullName, c);

    for (const m of c.methods) {
      if (m.name === '<init>') {
        methods.set(`${c.name}.<init>`, m);
        if (outerName) methods.set(`${fullName}.<init>`, m);
      } else {
        methods.set(m.name, m);
        methods.set(`${c.name}.${m.name}`, m);
        if (outerName) methods.set(`${fullName}.${m.name}`, m);
      }
    }

    for (const inner of c.innerClasses) {
      registerClass(inner, fullName);
    }
  }

  for (const c of program.classes) {
    registerClass(c);
  }

  /* -------------------------------------------------- snapshots */

  const heapOf = (): HeapObj[] => {
    const seen = new Set<string>();
    const seenObjIds = new Set<number>();
    const objs: HeapObj[] = [];

    const flatten2D = (arrVal: Val): string[] => {
      const rows = arrVal.v as Val[];
      const cells: string[] = [];
      for (const row of rows) {
        if (isArr(row.t)) {
          for (const item of row.v as Val[]) {
            cells.push(str(item));
          }
        } else {
          cells.push(str(row));
        }
      }
      return cells;
    };

    const recordObject = (name: string, obj: JavaObject) => {
      if (seenObjIds.has(obj._id)) return;
      seenObjIds.add(obj._id);

      const isTree = obj.fields.has('val') && (obj.fields.has('left') || obj.fields.has('right'));
      const isList = obj.fields.has('val') && obj.fields.has('next');
      const valStr = obj.fields.has('val') ? str(obj.fields.get('val')!) : '';

      if (isTree) {
        const leftObj = obj.fields.get('left')?.v as JavaObject | undefined;
        const leftVal = leftObj && leftObj.fields ? (leftObj.fields.has('val') ? str(leftObj.fields.get('val')) : 'Node') : 'null';
        const rightObj = obj.fields.get('right')?.v as JavaObject | undefined;
        const rightVal = rightObj && rightObj.fields ? (rightObj.fields.has('val') ? str(rightObj.fields.get('val')) : 'Node') : 'null';
        objs.push({
          name: `${name || obj.className}#${obj._id}`,
          type: obj.className,
          text: `Node(${valStr})`,
          cells: [valStr, `L:${leftVal}`, `R:${rightVal}`],
          size: 3,
        });

        const lObj = obj.fields.get('left')?.v;
        if (lObj && typeof lObj === 'object' && '_id' in lObj) recordObject(`${name}.left`, lObj as JavaObject);
        const rObj = obj.fields.get('right')?.v;
        if (rObj && typeof rObj === 'object' && '_id' in rObj) recordObject(`${name}.right`, rObj as JavaObject);
      } else if (isList) {
        const nextObjVal = obj.fields.get('next')?.v as JavaObject | undefined;
        const nextVal = nextObjVal && nextObjVal.fields ? (nextObjVal.fields.has('val') ? str(nextObjVal.fields.get('val')) : 'Node') : 'null';
        objs.push({
          name: `${name || obj.className}#${obj._id}`,
          type: obj.className,
          text: `ListNode(${valStr})`,
          cells: [valStr, `-> ${nextVal}`],
          size: 2,
        });

        const nextObj = obj.fields.get('next')?.v;
        if (nextObj && typeof nextObj === 'object' && '_id' in nextObj) recordObject(`${name}.next`, nextObj as JavaObject);
      } else {
        const fieldEntries = Array.from(obj.fields.entries());
        objs.push({
          name: `${name || obj.className}#${obj._id}`,
          type: obj.className,
          text: `${obj.className}#${obj._id}`,
          cells: fieldEntries.map(([k, v]) => `${k}=${str(v)}`),
          size: fieldEntries.length,
        });
      }
    };

    for (let i = stack.length - 1; i >= 0; i--) {
      for (const l of stack[i].locals()) {
        if (seen.has(l.name)) continue;
        if (l.value.v === null || l.value.t === 'null') continue;

        if (l.type === 'String') {
          seen.add(l.name);
          const s = l.value.v as string;
          objs.push({ name: l.name, type: 'String', text: `"${s}"`, cells: [...s], size: s.length });
        } else if (l.type.endsWith('[][]')) {
          seen.add(l.name);
          const rows = l.value.v as Val[];
          const flatCells = flatten2D(l.value);
          const numCols = rows[0] && isArr(rows[0].t) ? (rows[0].v as Val[]).length : 0;
          objs.push({
            name: l.name,
            type: l.type,
            text: `${rows.length}x${numCols} Matrix`,
            cells: flatCells,
            size: flatCells.length,
          });
        } else if (isArr(l.type)) {
          seen.add(l.name);
          const items = l.value.v as Val[];
          if (!items.length && l.name === 'args') continue;
          objs.push({
            name: l.name,
            type: l.type,
            text: `[${items.map(str).join(', ')}]`,
            cells: items.map(str),
            size: items.length,
          });
        } else if (typeof l.value.v === 'object' && l.value.v !== null && '_id' in l.value.v) {
          seen.add(l.name);
          recordObject(l.name, l.value.v as JavaObject);
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

  /* -------------------------------------------------- expression stringifier */

  function exprToString(x: Expr): string {
    switch (x.e) {
      case 'lit': return str({ t: x.t, v: x.v });
      case 'name': return x.id;
      case 'bin': return `${exprToString(x.l)} ${x.op} ${exprToString(x.r)}`;
      case 'un': return `${x.op}${exprToString(x.x)}`;
      case 'pre': return `${x.op}${exprToString(x.x)}`;
      case 'post': return `${exprToString(x.x)}${x.op}`;
      case 'assign': return `${exprToString(x.target)} ${x.op} ${exprToString(x.value)}`;
      case 'cond': return `${exprToString(x.c)} ? ${exprToString(x.a)} : ${exprToString(x.b)}`;
      case 'call': {
        const targetStr = x.target ? `${exprToString(x.target)}.` : '';
        return `${targetStr}${x.name}(${x.args.map(exprToString).join(', ')})`;
      }
      case 'field': return `${exprToString(x.target)}.${x.name}`;
      case 'index': return `${exprToString(x.target)}[${exprToString(x.index)}]`;
      case 'newobj': return `new ${x.className}(${x.args.map(exprToString).join(', ')})`;
      case 'newarr': return `new ${x.type}`;
      case 'cast': return `(${x.type}) ${exprToString(x.x)}`;
    }
  }

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
      if (scope) {
        const declared = scope.get(target.id)!.t;
        const next = coerce(declared, value, line);
        scope.set(target.id, next);
        return next;
      }
      if (frame().setField(target.id, value)) {
        return value;
      }
      throw new JavaError(`Cannot find symbol '${target.id}'`, line);
    }
    if (target.e === 'field') {
      const recv = evaluate(target.target);
      if (recv.v === null || recv.t === 'null') {
        throw new JavaError(`NullPointerException: Cannot assign field '${target.name}' because target is null`, line);
      }
      if (typeof recv.v === 'object' && recv.v !== null && '_id' in recv.v) {
        const obj = recv.v as JavaObject;
        obj.fields.set(target.name, value);
        return value;
      }
      throw new JavaError(`Cannot assign field '${target.name}' on type '${recv.t}'`, line);
    }
    if (target.e === 'index') {
      const arr = evaluate(target.target);
      if (!isArr(arr.t)) throw new JavaError('Not an array', line);
      const items = arr.v as Val[];
      const i = asNum(evaluate(target.index), line);
      if (i < 0 || i >= items.length) {
        throw new JavaError(`ArrayIndexOutOfBoundsException: Index ${i} out of bounds for length ${items.length}`, line);
      }
      const elemType = arr.t.slice(0, -2);
      const next = coerce(elemType, value, line);
      items[i] = next;
      return next;
    }
    throw new JavaError('Cannot assign to that', line);
  }

  function binop(op: string, l: Val, r: Val, line: number): Val {
    if (op === '+' && (l.t === 'String' || r.t === 'String')) return { t: 'String', v: str(l) + str(r) };

    if (op === '==' || op === '!=') {
      if (l.t === 'null' || r.t === 'null' || l.v === null || r.v === null) {
        const isNullL = l.t === 'null' || l.v === null;
        const isNullR = r.t === 'null' || r.v === null;
        const eq = isNullL === isNullR;
        return { t: 'boolean', v: op === '==' ? eq : !eq };
      }
      if (l.t === 'String' && r.t === 'String') {
        const eq = l.v === r.v;
        return { t: 'boolean', v: op === '==' ? eq : !eq };
      }
      if (l.t === 'boolean' && r.t === 'boolean') {
        const eq = l.v === r.v;
        return { t: 'boolean', v: op === '==' ? eq : !eq };
      }
      if (typeof l.v === 'object' && typeof r.v === 'object' && l.v !== null && r.v !== null) {
        const eq = l.v === r.v;
        return { t: 'boolean', v: op === '==' ? eq : !eq };
      }
      if (isNum(l.t) && isNum(r.t)) {
        const eq = asNum(l, line) === asNum(r, line);
        return { t: 'boolean', v: op === '==' ? eq : !eq };
      }
      const eq = l.v === r.v;
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

  const trunc = (n: number, t: string) => (t === 'long' ? Math.trunc(n) : n | 0);

  function evaluate(x: Expr): Val {
    if (++steps > STEP_CAP) throw new JavaError('Program ran too long — is a loop missing its exit?', x.line, 'limit');

    switch (x.e) {
      case 'lit': return { t: x.t, v: x.v };
      case 'name': return lookup(x.id, x.line);
      case 'bin': {
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
      case 'newobj': return instantiateClass(x.className, x.args.map(evaluate), x.line);
      case 'call': return call(x);
    }
  }

  function field(x: Expr & { e: 'field' }): Val {
    if (x.target.e === 'name') {
      const owner = x.target.id;
      const key = `${owner}.${x.name}`;
      const konst: Record<string, Val> = {
        'Math.PI': { t: 'double', v: Math.PI },
        'Math.E': { t: 'double', v: Math.E },
        'Integer.MAX_VALUE': { t: 'int', v: 2147483647 },
        'Integer.MIN_VALUE': { t: 'int', v: -2147483648 },
        'Long.MAX_VALUE': { t: 'long', v: Number.MAX_SAFE_INTEGER },
        'Long.MIN_VALUE': { t: 'long', v: -Number.MAX_SAFE_INTEGER },
        'Double.MAX_VALUE': { t: 'double', v: Number.MAX_VALUE },
      };
      if (konst[key] && !frame()?.find(owner)) return konst[key];
    }

    const t = evaluate(x.target);
    if (x.name === 'length') {
      if (isArr(t.t)) return { t: 'int', v: (t.v as Val[]).length };
      if (t.t === 'String') return { t: 'int', v: (t.v as string).length };
    }

    if (t.v === null || t.t === 'null') {
      throw new JavaError(`NullPointerException: Cannot read field '${x.name}' because target is null`, x.line);
    }

    if (typeof t.v === 'object' && t.v !== null && '_id' in t.v) {
      const obj = t.v as JavaObject;
      const fVal = obj.fields.get(x.name);
      if (fVal !== undefined) return fVal;
      return { t: 'null', v: null };
    }

    throw new JavaError(`Unknown field '${x.name}' on '${t.t}'`, x.line);
  }

  function allocMultiArray(baseElem: string, sizes: number[], dimIdx: number, line: number): Val {
    const n = sizes[dimIdx];
    if (n < 0) throw new JavaError('NegativeArraySizeException', line);
    if (n > 5_000_000) throw new JavaError('OutOfMemoryError: array too large', line);
    const remainingDims = sizes.length - 1 - dimIdx;
    const currentType = baseElem + '[]'.repeat(remainingDims + 1);

    if (remainingDims === 0) {
      const zero: Val = baseElem === 'boolean' ? { t: 'boolean', v: false }
        : baseElem === 'String' ? { t: 'String', v: null }
        : isNum(baseElem) ? { t: baseElem, v: 0 }
        : { t: baseElem, v: null };
      return {
        t: currentType,
        v: Array.from({ length: n }, () => ({ ...zero })),
      };
    }

    return {
      t: currentType,
      v: Array.from({ length: n }, () => allocMultiArray(baseElem, sizes, dimIdx + 1, line)),
    };
  }

  function newArray(x: Expr & { e: 'newarr' }): Val {
    if (x.init) {
      const items = x.init.map((i) => evaluate(i));
      const firstT = items[0]?.t ?? 'int';
      const declaredType = x.type === 'var' ? `${firstT}[]` : x.type;
      const elemType = declaredType.endsWith('[]') ? declaredType.slice(0, -2) : firstT;
      return {
        t: declaredType,
        v: items.map((i) => coerce(elemType, i, x.line)),
      };
    }

    const sizes = x.sizes.map((s) => asNum(evaluate(s), x.line));
    const baseElem = x.type.replace(/\[\]/g, '');
    return allocMultiArray(baseElem, sizes, 0, x.line);
  }

  function instantiateClass(className: string, args: Val[], line: number): Val {
    if (className === 'String') return { t: 'String', v: args.length ? str(args[0]) : '' };
    if (['Integer', 'Long', 'Short', 'Byte'].includes(className)) {
      return { t: 'int', v: Math.trunc(asNum(args[0], line)) };
    }
    if (['Double', 'Float'].includes(className)) {
      return { t: 'double', v: asNum(args[0], line) };
    }

    const cls = classMap.get(className);
    if (!cls) {
      throw new JavaError(`'new ${className}' is outside the supported subset`, line);
    }

    const objId = ++objectIdCounter;
    const fields = new Map<string, Val>();

    for (const f of cls.fields) {
      if (!f.isStatic) {
        fields.set(f.name, f.init ? coerce(f.type, evaluate(f.init), f.line) : defaultOf(f.type));
      }
    }

    const obj: JavaObject = {
      _id: objId,
      className: cls.name,
      fields,
    };
    const objVal: Val = { t: cls.name, v: obj };

    const ctor = cls.methods.find((m) => m.name === '<init>' && m.params.length === args.length);
    if (ctor) {
      invoke(ctor, args, line, objVal);
    } else if (args.length > 0) {
      throw new JavaError(`Constructor ${cls.name} with ${args.length} argument(s) not found`, line);
    }

    return objVal;
  }

  function printed(args: Val[]): string {
    return args.map(str).join('');
  }

  function call(x: Expr & { e: 'call' }): Val {
    const line = x.line;

    /* System.out.* */
    if (x.target?.e === 'field' && x.target.name === 'out' && x.target.target.e === 'name' && x.target.target.id === 'System') {
      const args = x.args.map((a) => evaluate(a));
      if (x.name === 'println' || x.name === 'print') {
        const text = printed(args);
        emit(text + (x.name === 'println' ? '\n' : ''));
        if (args.length === 1 && isNum(args[0].t) && args[0].t !== 'char') series.push(args[0].v as number);
        return { t: 'void', v: null };
      }
      if (x.name === 'printf' || x.name === 'format') {
        const fmtStr = str(args[0]);
        const formatted = format(fmtStr, args.slice(1));
        emit(formatted);
        return { t: 'void', v: null };
      }
      throw new JavaError(`System.out has no method '${x.name}'`, line);
    }

    /* Static helpers on a class name */
    if (x.target?.e === 'name' && !frame()?.find(x.target.id)) {
      const owner = x.target.id;
      const args = x.args.map((a) => evaluate(a));
      const st = staticCall(owner, x.name, args, line);
      if (st) return st;
      const m = methods.get(`${owner}.${x.name}`);
      if (m) return invoke(m, args, line);
    }

    /* Instance methods */
    if (x.target) {
      const recv = evaluate(x.target);
      const args = x.args.map((a) => evaluate(a));
      return instanceCall(recv, x.name, args, line);
    }

    /* Bare name: method in this file */
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

    if (recv.t !== 'String') {
      const cls = classMap.get(recv.t);
      if (cls) {
        const m = cls.methods.find((method) => method.name === name && method.params.length === args.length);
        if (m) {
          return invoke(m, args, line, recv);
        }
      }
      throw new JavaError(`'${recv.t}' has no method '${name}' in this subset`, line);
    }

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

  function invoke(m: MethodDecl, args: Val[], line: number, thisVal: Val | null = null): Val {
    if (stack.length > 400) throw new JavaError('StackOverflowError: Call stack depth exceeded', line);
    if (args.length !== m.params.length) {
      throw new JavaError(`${m.name} expects ${m.params.length} argument(s), got ${args.length}`, line);
    }

    const argList = m.params.map((p, i) => `${p.name}=${str(args[i])}`).join(', ');
    const sig = `${m.name}(${argList})`;
    const f = new Frame(sig, thisVal);
    if (thisVal) {
      f.declare('this', thisVal);
    }
    m.params.forEach((prm, i) => f.declare(prm.name, coerce(prm.type, args[i], line)));
    stack.push(f);
    record(m.line, `call ${m.name}(${args.map(str).join(', ')})`);

    const flow = execBlock(m.body, f);
    const ret = flow && flow.signal === 'return' ? flow.value : { t: 'void' as const, v: null };

    record(m.line, `return ${m.ret === 'void' ? 'void' : str(ret)}`.trim());
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
        const note = st.decls.map((d) => `${d.name} = ${str(f.get(d.name)!)}`).join(', ');
        record(st.line, note);
        return null;
      }

      case 'expr': {
        const prevOutLen = out.length;
        const res = evaluate(st.x);
        if (out.length > prevOutLen) {
          const latest = out[out.length - 1] ?? '';
          record(st.line, `print: "${latest.slice(0, 48)}"`);
        } else if (st.x.e === 'assign') {
          const targetStr = exprToString(st.x.target);
          record(st.line, `${targetStr} = ${str(res)}`);
        } else {
          record(st.line, describe(st.x));
        }
        return null;
      }

      case 'block': return execBlock(st.body, f);

      case 'if': {
        const cStr = exprToString(st.c);
        const cVal = truthy(evaluate(st.c), st.line);
        record(st.line, `if (${cStr}) -> ${cVal ? 'true' : 'false'}`);
        if (cVal) return exec(st.then, f);
        return st.else ? exec(st.else, f) : null;
      }

      case 'while': {
        const cStr = exprToString(st.c);
        while (truthy(evaluate(st.c), st.line)) {
          record(st.line, `while (${cStr}): true`);
          const flow = exec(st.body, f);
          if (flow === BREAK) break;
          if (flow && flow !== CONTINUE) return flow;
        }
        record(st.line, `while (${cStr}): false (exit loop)`);
        return null;
      }

      case 'do': {
        do {
          record(st.line, 'do loop body iteration');
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
            const condStr = st.c ? exprToString(st.c) : 'true';
            record(st.line, `for condition (${condStr})`);
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
            record(st.line, `for-each: ${st.name} = ${str(item)}`);
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
        record(st.line, `return ${st.x ? str(value) : 'void'}`);
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

  function describe(x: Expr): string {
    if (x.e === 'assign') {
      const targetStr = exprToString(x.target);
      return `${targetStr} = …`;
    }
    if (x.e === 'post' || x.e === 'pre') return exprToString(x);
    if (x.e === 'call') {
      const targetStr = x.target ? `${exprToString(x.target)}.` : '';
      return `${targetStr}${x.name}(…)`;
    }
    if (x.e === 'newobj') return `new ${x.className}(…)`;
    if (x.e === 'newarr') return `new ${x.type}`;
    return exprToString(x);
  }

  /* -------------------------------------------------- execution entry */

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
    record(je.line, `threw: ${je.message}`);
  }

  flush();

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

export function highlight(src: string): Piece[] {
  let toks: Tok[];
  try { toks = lex(src); } catch { return [{ text: src, cls: 'txt' }]; }

  const out: Piece[] = [];
  let at = 0;

  const gap = (upto: number) => {
    if (upto <= at) return;
    const text = src.slice(at, upto);
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
      : /^[A-Za-z_$]/.test(t.v) && (toks[i - 1]?.v === 'class' || /^[A-Z]/.test(t.v)) ? 'typ'
      : 'txt';
    out.push({ text: raw, cls });
    at = t.to;
  });
  gap(src.length);
  return out;
}

/* ==================================================== 5. Self-check */

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

  ok('2D array matrices',
    run(src('int[][] m = new int[2][2]; m[0][1] = 99; System.out.println(m[0][1]);')).out, ['99']);

  ok('user classes and instantiation',
    run('class Main { static class Node { int val; Node next; Node(int v) { this.val = v; } } public static void main(String[] args) { Node n = new Node(42); System.out.println(n.val); } }').out,
    ['42']);

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
