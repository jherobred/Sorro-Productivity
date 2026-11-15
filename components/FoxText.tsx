/**
 * What the fox said, a line at a time: lines starting with a bullet become an indented list.
 * Spans, not a list element, so it fits inside the log's buttons too.
 */
export function FoxText({ text }: { text: string }) {
  return <>{text.split('\n').filter(l => l.trim()).map((l, i) => {
    const item = /^\s*[•*-]\s+/.exec(l);
    return <span key={i} className="fx-text" data-bullet={item ? 'true' : undefined}>{item ? l.slice(item[0].length) : l}</span>;
  })}</>;
}
