/** Server-sent events. No imports, so the Deno function and the Next app both load this file. */
export type SseEvent = { event: string; data: string };

/** Pulls whole events (ended by a blank line) out of `buf`; `rest` is the unfinished tail to prepend to the next read. */
export function splitSse(buf: string): { events: SseEvent[]; rest: string } {
  const blocks = buf.replace(/\r\n/g, '\n').split('\n\n');
  const rest = blocks.pop() ?? '';
  const events: SseEvent[] = [];
  for (const block of blocks) {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (data.length) events.push({ event, data: data.join('\n') });
  }
  return { events, rest };
}
