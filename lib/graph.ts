/**
 * The graph, as data. No React, no Supabase — one pure function, so the shape
 * of the picture can be checked by `node lib/graph.check.ts` rather than by
 * squinting at dots.
 *
 * What the graph is made of, and why:
 *
 * Obsidian's graph draws the vault — files and the links between them. Here the
 * vault is the canvases. A **board** is a node, every **card** on it is a node
 * hanging off it, and the connections you drew between cards are edges. A card
 * that embeds a note joins up with that **note**, and notes join to each other
 * through their `[[wiki links]]`. So the boards you draw are the spine of the
 * picture and the notebook hangs off them, which is what "the canvas is the
 * source of the graph's data" means in practice.
 *
 * Three edge kinds, drawn differently:
 *   holds   — a board and a card on it (the spokes of each cluster)
 *   links   — a connection you drew, or a [[wiki link]] you wrote
 *   embeds  — a card that *is* a note, or a card that opens another board
 */

export type GKind = 'canvas' | 'card' | 'note';
export type EKind = 'holds' | 'links' | 'embeds';

export type GNode = {
  /** Namespaced, because a card and a note can never collide but ids might. */
  id: string;
  kind: GKind;
  /** The row this node stands for — what a click opens. */
  ref: string;
  title: string;
  color: string;
  /** Board id for cards, notebook id for notes. Used to keep clusters together. */
  group: string;
};

export type GEdge = { from: string; to: string; kind: EKind };

export type GraphInput = {
  boards: { id: string; name: string; color: string }[];
  cards: {
    id: string; canvas_id: string; kind: string; text: string; color: string;
    note_id: string | null; ref_canvas: string | null;
  }[];
  cardEdges: { from_node: string; to_node: string }[];
  notes: { id: string; title: string; notebook_id: string }[];
  noteLinks: { from: string; to: string }[];
  notebookColor: Record<string, string>;
};

export type GraphOptions = {
  canvases: boolean;
  cards: boolean;
  notes: boolean;
  orphans: boolean;
};

export const boardNode = (id: string) => `board:${id}`;
export const cardNode = (id: string) => `card:${id}`;
export const noteNode = (id: string) => `note:${id}`;

export function buildGraph(input: GraphInput, opt: GraphOptions): { nodes: GNode[]; edges: GEdge[] } {
  const nodes: GNode[] = [];
  const add = (n: GNode) => { nodes.push(n); };

  if (opt.canvases) {
    for (const b of input.boards) {
      add({ id: boardNode(b.id), kind: 'canvas', ref: b.id, title: b.name, color: b.color, group: b.id });
    }
  }

  if (opt.cards) {
    for (const c of input.cards) {
      // A group is a frame drawn round other cards, not a thing in itself.
      if (c.kind === 'group') continue;
      const label = c.kind === 'note'
        ? (input.notes.find((n) => n.id === c.note_id)?.title || c.text)
        : c.kind === 'canvas'
          ? (input.boards.find((b) => b.id === c.ref_canvas)?.name || c.text)
          : c.text;
      add({
        id: cardNode(c.id), kind: 'card', ref: c.id,
        title: (label || 'Empty card').split('\n')[0].slice(0, 60),
        color: c.color, group: c.canvas_id,
      });
    }
  }

  if (opt.notes) {
    for (const n of input.notes) {
      add({
        id: noteNode(n.id), kind: 'note', ref: n.id,
        title: n.title || 'Untitled', color: input.notebookColor[n.notebook_id] ?? '#7C6CFF',
        group: n.notebook_id,
      });
    }
  }

  const have = new Set(nodes.map((n) => n.id));
  const edges: GEdge[] = [];
  const seen = new Set<string>();
  const join = (from: string, to: string, kind: EKind) => {
    if (from === to || !have.has(from) || !have.has(to)) return;
    // One edge per pair per kind, whichever way round it was found.
    const key = [from, to].sort().join('|') + kind;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, kind });
  };

  for (const c of input.cards) {
    if (c.kind === 'group') continue;
    join(boardNode(c.canvas_id), cardNode(c.id), 'holds');
    if (c.note_id) join(cardNode(c.id), noteNode(c.note_id), 'embeds');
    if (c.ref_canvas) join(cardNode(c.id), boardNode(c.ref_canvas), 'embeds');
  }
  for (const e of input.cardEdges) join(cardNode(e.from_node), cardNode(e.to_node), 'links');
  for (const l of input.noteLinks) join(noteNode(l.from), noteNode(l.to), 'links');

  if (opt.orphans) return { nodes, edges };

  const touched = new Set<string>();
  for (const e of edges) { touched.add(e.from); touched.add(e.to); }
  return { nodes: nodes.filter((n) => touched.has(n.id)), edges };
}

/** How many edges touch each node — the graph's dot sizes come from this. */
export function degrees(edges: GEdge[]): Map<string, number> {
  const d = new Map<string, number>();
  for (const e of edges) {
    d.set(e.from, (d.get(e.from) ?? 0) + 1);
    d.set(e.to, (d.get(e.to) ?? 0) + 1);
  }
  return d;
}

/** Everything one hop from `id`, for the hover highlight. */
export function neighbours(edges: GEdge[], id: string): Set<string> {
  const out = new Set<string>([id]);
  for (const e of edges) {
    if (e.from === id) out.add(e.to);
    if (e.to === id) out.add(e.from);
  }
  return out;
}
