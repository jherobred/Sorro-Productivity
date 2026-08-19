'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { settler } from './settle';

/**
 * Block-structured notes, the way Notion, OneNote and RemNote model a document:
 * an ordered list of typed blocks rather than one blob of text. The schema for
 * this already existed (bd_note_blocks); nothing was writing to it.
 *
 * Wiki links are the RemNote/Obsidian half. `[[Another note]]` inside any block
 * is extracted on save into bd_note_links, which is what makes the backlinks
 * pane possible without scanning every note's text on every render.
 */

export type BlockKind =
  | 'text' | 'h1' | 'h2' | 'h3'
  | 'bullet' | 'number' | 'todo'
  | 'quote' | 'callout' | 'code' | 'divider';

export type Block = {
  id: string;
  note_id: string;
  kind: BlockKind;
  text: string;
  done: boolean;
  position: number;
};

export const BLOCK_MENU: { kind: BlockKind; label: string; hint: string; icon: string }[] = [
  { kind: 'text', label: 'Text', hint: 'Plain paragraph', icon: 'text' },
  { kind: 'h1', label: 'Heading 1', hint: 'Big section title', icon: 'heading' },
  { kind: 'h2', label: 'Heading 2', hint: 'Sub-section', icon: 'heading' },
  { kind: 'h3', label: 'Heading 3', hint: 'Smaller heading', icon: 'heading' },
  { kind: 'bullet', label: 'Bulleted list', hint: 'An unordered point', icon: 'list' },
  { kind: 'number', label: 'Numbered list', hint: 'A step in order', icon: 'list' },
  { kind: 'todo', label: 'To-do', hint: 'A checkbox you can tick', icon: 'check' },
  { kind: 'quote', label: 'Quote', hint: 'Someone else’s words', icon: 'quote' },
  { kind: 'callout', label: 'Callout', hint: 'A box that stands out', icon: 'flag' },
  { kind: 'code', label: 'Code', hint: 'Monospaced, unformatted', icon: 'code' },
  { kind: 'divider', label: 'Divider', hint: 'A horizontal rule', icon: 'minus' },
];

/**
 * Markdown-style shortcuts. Typing the prefix and a space converts the block —
 * the muscle memory every one of these editors shares.
 */
export const SHORTCUTS: [RegExp, BlockKind][] = [
  [/^# $/, 'h1'],
  [/^## $/, 'h2'],
  [/^### $/, 'h3'],
  [/^[-*+] $/, 'bullet'],
  [/^1\. $/, 'number'],
  [/^\[[ x]?\] $/, 'todo'],
  [/^> $/, 'quote'],
  [/^\|\| $/, 'callout'],
  [/^```$/, 'code'],
  [/^(---|\*\*\*)$/, 'divider'],
];

const key = (noteId: string | null) => ['note_blocks', noteId] as const;

export function useBlocks(noteId: string | null) {
  return useQuery({
    queryKey: key(noteId),
    enabled: !!noteId,
    queryFn: async (): Promise<Block[]> => {
      const { data, error } = await supabase.from('bd_note_blocks')
        .select('id,note_id,kind,text,done,position').eq('note_id', noteId!).order('position');
      if (error) throw error;
      return (data ?? []) as Block[];
    },
  });
}

/**
 * One line of each note's real content, for the tree.
 *
 * `bd_notes.body` is the pre-block storage and stops updating the moment a note
 * is migrated, so a preview built from it is either empty or years stale. The
 * text lives in blocks. One query for every block the user owns, reduced to a
 * first line per note, is cheaper than a query per row and small enough at a
 * student's note count; if that ever stops being true this becomes a view.
 *
 * ponytail: whole-table scan reduced client-side. Move to a Postgres view with
 * DISTINCT ON (note_id) if a heavy notebook makes it show.
 */
export function useNotePreviews() {
  return useQuery({
    queryKey: ['note_previews'],
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.from('bd_note_blocks')
        .select('note_id,text,position').order('position');
      if (error) throw error;
      const out: Record<string, string> = {};
      for (const b of data ?? []) {
        const t = (b.text ?? '').replace(/\s+/g, ' ').trim();
        if (!t) continue;
        if (!out[b.note_id]) out[b.note_id] = t;
      }
      return out;
    },
  });
}

/** Every note that links *to* this one — the backlinks pane. */
export function useBacklinks(noteId: string | null) {
  return useQuery({
    queryKey: ['backlinks', noteId],
    enabled: !!noteId,
    queryFn: async (): Promise<{ id: string; title: string }[]> => {
      const { data, error } = await supabase.from('bd_note_links')
        .select('note_id, bd_notes!bd_note_links_note_id_fkey(id,title)')
        .eq('target_id', noteId!);
      if (error) throw error;
      type Row = { bd_notes: { id: string; title: string } | { id: string; title: string }[] | null };
      return ((data ?? []) as Row[])
        .flatMap((r) => (Array.isArray(r.bd_notes) ? r.bd_notes : r.bd_notes ? [r.bd_notes] : []));
    },
  });
}

const ADD = defineMutation('block.add', async (v: Block) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_note_blocks').insert({ ...v, user_id });
  if (error) throw error;
});
const SAVE = defineMutation('block.save', async (v: { id: string; patch: Partial<Block> }) => {
  const { error } = await supabase.from('bd_note_blocks').update(v.patch).eq('id', v.id);
  if (error) throw error;
});
const DEL = defineMutation('block.del', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_note_blocks').delete().eq('id', v.id);
  if (error) throw error;
});
const REORDER = defineMutation('block.reorder', async (v: { ids: string[] }) => {
  // Positions are a dense index, so a move renumbers the run it touched.
  await Promise.all(v.ids.map((id, i) => supabase.from('bd_note_blocks').update({ position: i }).eq('id', id)));
});

const LINKS = defineMutation('block.links', async (v: { note_id: string; targets: string[] }) => {
  const user_id = await currentUserId();
  await supabase.from('bd_note_links').delete().eq('note_id', v.note_id);
  if (!v.targets.length) return;
  const { error } = await supabase.from('bd_note_links')
    .insert(v.targets.map((target_id) => ({ user_id, note_id: v.note_id, target_id })));
  if (error) throw error;
});

export function useBlockActions(noteId: string | null) {
  const qc = useQueryClient();
  const k = key(noteId);
  const settle = settler(qc, k);
  const patch = (fn: (p: Block[]) => Block[]) => {
    const prev = queryClient.getQueryData<Block[]>(k) ?? [];
    queryClient.setQueryData<Block[]>(k, fn(prev));
    return prev;
  };
  const rollback = (_e: unknown, _v: unknown, ctx: Block[] | undefined) => {
    if (ctx) queryClient.setQueryData(k, ctx);
  };

  return {
    /**
     * Put text on screen now, without asking the network.
     *
     * The editor calls this on every keystroke and debounces the real write,
     * so a sentence is one request rather than forty — and no character can be
     * rolled back by a failure belonging to the character before it.
     */
    patchLocal: (id: string, p: Partial<Block>) =>
      patch((prev) => prev.map((b) => (b.id === id ? { ...b, ...p } : b))),

    add: useMutation<unknown, Error, Block, Block[]>({
      mutationKey: ADD,
      onMutate: (v) => patch((p) => [...p, v].sort((a, b) => a.position - b.position)),
      onError: rollback,
      onSettled: settle,
    }),
    /**
     * No settle here, on purpose.
     *
     * Saving fired an invalidate, so every keystroke queued a refetch that
     * raced the write it was reporting on. When the read won, the block you
     * were editing was replaced by whatever the server last stored — the text
     * disappeared under the cursor. While you are typing, the local cache is
     * the truth; a refetch can only destroy. Structural changes below still
     * settle, because those genuinely need the server's ordering back.
     */
    save: useMutation<unknown, Error, { id: string; patch: Partial<Block> }, Block[]>({
      mutationKey: SAVE,
      onMutate: (v) => patch((p) => p.map((b) => (b.id === v.id ? { ...b, ...v.patch } : b))),
      onError: rollback,
    }),
    del: useMutation<unknown, Error, { id: string }, Block[]>({
      mutationKey: DEL,
      onMutate: (v) => patch((p) => p.filter((b) => b.id !== v.id)),
      onError: rollback,
      onSettled: settle,
    }),
    reorder: useMutation<unknown, Error, { ids: string[] }, Block[]>({
      mutationKey: REORDER,
      onMutate: (v) => patch((p) => v.ids.map((id, i) => ({ ...p.find((b) => b.id === id)!, position: i })).filter(Boolean)),
      onError: rollback,
      onSettled: settle,
    }),
    syncLinks: useMutation<unknown, Error, { note_id: string; targets: string[] }>({
      mutationKey: LINKS,
      onSettled: () => void qc.invalidateQueries({ queryKey: ['backlinks'] }),
    }),
  };
}

/** Every `[[target]]` in a block, in order, without the brackets. */
export function wikiTargets(text: string): string[] {
  return [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim()).filter(Boolean);
}

export type Span =
  | { s: 'text'; text: string }
  | { s: 'bold'; text: string }
  | { s: 'italic'; text: string }
  | { s: 'code'; text: string }
  | { s: 'link'; text: string };

/**
 * Inline formatting for the *unfocused* rendering of a block. The focused block
 * stays raw text in a textarea — the same source-mode trade Obsidian and Bear
 * make, and the reason this editor never fights the caret.
 */
export function spans(text: string): Span[] {
  const out: Span[] = [];
  const re = /\[\[([^\]]+)\]\]|\*\*([^*]+)\*\*|(?<!\*)\*([^*]+)\*(?!\*)|`([^`]+)`/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ s: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ s: 'link', text: m[1] });
    else if (m[2] !== undefined) out.push({ s: 'bold', text: m[2] });
    else if (m[3] !== undefined) out.push({ s: 'italic', text: m[3] });
    else out.push({ s: 'code', text: m[4] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ s: 'text', text: text.slice(last) });
  return out;
}

/** Plain text of a whole note, for search and the word count. */
export const blocksToText = (blocks: Block[]) => blocks.map((b) => b.text).join('\n');

/** Split a legacy `bd_notes.body` into blocks the first time a note is opened. */
export function textToBlocks(note_id: string, body: string): Block[] {
  const lines = body.split('\n');
  return lines.map((line, i) => {
    let kind: BlockKind = 'text';
    let text = line;
    for (const [re, k] of SHORTCUTS) {
      const withSpace = `${line.split(' ')[0]} `;
      if (re.test(withSpace)) { kind = k; text = line.slice(withSpace.length); break; }
    }
    return { id: crypto.randomUUID(), note_id, kind, text, done: false, position: i };
  });
}
