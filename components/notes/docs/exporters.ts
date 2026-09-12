import { htmlText, PAPER, type DocPage } from '@/lib/docFormat';

/**
 * Downloads and printing. Everything here works from the HTML the editor
 * serialised from its own schema, never from a stored string, so nothing the
 * schema would not allow reaches the printed or downloaded file.
 */

export const PRINT_STYLES = `
body{margin:0;font:11pt/1.15 Arial,Helvetica,sans-serif;color:#000;background:#fff}
.doc{word-wrap:break-word;white-space:pre-wrap;tab-size:48px}
p,h1,h2,h3,h4,h5,h6,ul,ol,blockquote,pre{margin:0}
h1{font-size:20pt;font-weight:400;padding:20pt 0 6pt}h2{font-size:16pt;font-weight:400;padding:18pt 0 6pt}
h3{font-size:14pt;font-weight:400;color:#434343;padding:16pt 0 4pt}h4{font-size:12pt;font-weight:400;color:#666;padding:14pt 0 4pt}
h5{font-size:11pt;font-weight:400;color:#666;padding:12pt 0 4pt}h6{font-size:11pt;font-weight:400;font-style:italic;color:#666;padding:12pt 0 4pt}
p[data-style=title]{font-size:26pt;padding-bottom:3pt}p[data-style=subtitle]{font-size:15pt;color:#666;padding-bottom:16pt}
ul,ol{padding-left:36px}li p{margin:0}
ul[data-type=taskList]{list-style:none;padding-left:4px}li[data-type=taskItem]{display:flex;gap:8px}li[data-type=taskItem][data-checked=true]>div{text-decoration:line-through;color:#777}
li[data-type=taskItem]>label{flex:none}
blockquote{border-left:3px solid #ccc;padding-left:14px;color:#444}
pre{background:#f1f3f4;padding:10px 12px;border-radius:4px;font:10pt/1.4 "Roboto Mono",monospace;white-space:pre-wrap}
code{font-family:"Roboto Mono",monospace}
hr{border:0;border-top:1px solid #aaa;margin:10px 0}
table{border-collapse:collapse;width:100%;margin:4px 0}td,th{border:1px solid #000;padding:5px 7px;vertical-align:top}th{background:#f3f3f3}
img{max-width:100%}a{color:#1155cc}
del.doc-deletion{color:#c5221f}ins.doc-insertion{color:#146c2e;text-decoration:underline}
div[data-type=page-break]{break-after:page;height:0}
span[data-type=math-inline],div[data-type=math-block]{font-family:"Times New Roman",serif}
div[data-type=math-block]{text-align:center;padding:6px 0}
`;

function inlineMath(html: string) {
  // Equation nodes serialise as empty elements that carry their source. Show
  // that source, so a printout or a saved file still has the equation in it.
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  doc.querySelectorAll<HTMLElement>('[data-type="math-inline"],[data-type="math-block"]').forEach((el) => { el.textContent = el.dataset.latex ?? ''; });
  return doc.body.innerHTML;
}

export function documentHtml(title: string, tabs: { title: string; html: string }[], page: DocPage) {
  const paper = PAPER[page.size];
  const [w, h] = page.orientation === 'landscape' ? [paper.h, paper.w] : [paper.w, paper.h];
  const m = page.margins;
  const body = tabs.map((tab, i) => `${tabs.length > 1 ? `<h1 class="tab-title">${escapeText(tab.title)}</h1>` : ''}<div class="doc">${inlineMath(tab.html)}</div>${i < tabs.length - 1 ? '<div data-type="page-break"></div>' : ''}`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeText(title)}</title><style>@page{size:${w}in ${h}in;margin:${m.top}in ${m.right}in ${m.bottom}in ${m.left}in}${PRINT_STYLES}body{background:${page.color}}</style></head><body>${body}</body></html>`;
}

const escapeText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function printDocument(title: string, tabs: { title: string; html: string }[], page: DocPage) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  frame.srcdoc = documentHtml(title, tabs, page);
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) { frame.remove(); return; }
    win.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 100));
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  document.body.append(frame);
}

function save(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120) || 'Document';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadDocument(format: 'html' | 'txt' | 'md', title: string, tabs: { title: string; html: string }[], page: DocPage) {
  const name = title || 'Untitled document';
  if (format === 'html') return save(name + '.html', 'text/html', documentHtml(name, tabs, page));
  if (format === 'txt') return save(name + '.txt', 'text/plain', tabs.map((t) => (tabs.length > 1 ? t.title + '\n\n' : '') + htmlText(t.html)).join('\n\n'));
  return save(name + '.md', 'text/markdown', tabs.map((t) => (tabs.length > 1 ? `# ${t.title}\n\n` : '') + htmlToMarkdown(t.html)).join('\n\n'));
}

/** Markdown for the parts of a document Markdown can hold. Fonts, colours and spacing are left behind. */
export function htmlToMarkdown(html: string): string {
  const root = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  const inline = (node: ChildNode): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/([*_`[\]])/g, '\\$1');
    if (!(node instanceof HTMLElement)) return '';
    const inner = Array.from(node.childNodes).map(inline).join('');
    switch (node.tagName) {
      case 'STRONG': case 'B': return inner.trim() ? `**${inner}**` : inner;
      case 'EM': case 'I': return inner.trim() ? `*${inner}*` : inner;
      case 'S': case 'DEL': return inner.trim() ? `~~${inner}~~` : inner;
      case 'CODE': return '`' + (node.textContent ?? '') + '`';
      case 'A': return `[${inner}](${node.getAttribute('href') ?? ''})`;
      case 'IMG': return node.getAttribute('src') ? `![${node.getAttribute('alt') ?? ''}](${node.getAttribute('src')})` : '';
      case 'BR': return '  \n';
      case 'SPAN': return node.dataset.type === 'math-inline' ? `$${node.dataset.latex ?? ''}$` : inner;
      default: return inner;
    }
  };
  const block = (node: ChildNode, depth = 0): string => {
    if (!(node instanceof HTMLElement)) return node.textContent?.trim() ? inline(node) : '';
    const tag = node.tagName;
    if (/^H[1-6]$/.test(tag)) return '#'.repeat(Number(tag[1])) + ' ' + inline(node);
    if (tag === 'P') return node.dataset.style === 'title' ? '# ' + inline(node) : inline(node);
    if (tag === 'BLOCKQUOTE') return Array.from(node.children).map((c) => '> ' + block(c)).join('\n');
    if (tag === 'PRE') return '```\n' + (node.textContent ?? '') + '\n```';
    if (tag === 'HR') return '---';
    if (tag === 'DIV' && node.dataset.type === 'math-block') return `$$\n${node.dataset.latex ?? ''}\n$$`;
    if (tag === 'DIV' && node.dataset.type === 'page-break') return '';
    if (tag === 'UL' || tag === 'OL') {
      return Array.from(node.children).map((li, i) => {
        const task = (li as HTMLElement).dataset.type === 'taskItem';
        const marker = task ? `- [${(li as HTMLElement).dataset.checked === 'true' ? 'x' : ' '}] ` : tag === 'OL' ? `${i + 1}. ` : '- ';
        const parts = Array.from(li.children).filter((c) => c.tagName !== 'LABEL');
        const content = (parts.length ? parts : [li]).map((c) => (c.tagName === 'UL' || c.tagName === 'OL' ? '\n' + block(c, depth + 1) : c.tagName === 'DIV' ? Array.from(c.children).map((x) => block(x, depth + 1)).join('\n') : inline(c))).join('');
        return '  '.repeat(depth) + marker + content;
      }).join('\n');
    }
    if (tag === 'TABLE') {
      const rows = Array.from(node.querySelectorAll('tr')).map((tr) => Array.from(tr.children).map((cell) => inline(cell).replace(/\|/g, '\\|').trim()));
      if (!rows.length) return '';
      const width = Math.max(...rows.map((r) => r.length));
      const line = (r: string[]) => '| ' + Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ') + ' |';
      return [line(rows[0]), '| ' + Array(width).fill('---').join(' | ') + ' |', ...rows.slice(1).map(line)].join('\n');
    }
    return inline(node);
  };
  return Array.from(root.childNodes).map((n) => block(n)).filter((b) => b !== '').join('\n\n');
}

