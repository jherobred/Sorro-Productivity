/**
 * Sorro as an MCP server, so Claude (claude.ai, Desktop, Code) can keep
 * HTML artifacts in a notebook and edit them there.
 *
 * Stateless Streamable HTTP: every POST is one JSON-RPC message answered with
 * plain JSON. No sessions and no SSE, which the spec allows and which is all a
 * request/response tool server needs.
 *
 * An artifact is an ordinary Code page with language "html", the same thing
 * the notebook's own "Code" page type writes, so the app already edits it and
 * runs it in its sandboxed preview. Nothing new to render.
 */

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

// Must match PAGE_MARKER and writeStudy in lib/pageKinds.ts.
const PAGE_MARKER = '<!-- sorro-page:v1 -->\n';
const htmlPage = (code: string) => PAGE_MARKER + JSON.stringify({ version: 1, kind: 'code', language: 'html', code });
const readCode = (body: string): { language: string; code: string } | null => {
  if (!body.startsWith(PAGE_MARKER)) return null;
  try {
    const d = JSON.parse(body.slice(PAGE_MARKER.length));
    return d?.kind === 'code' && typeof d.code === 'string' ? { language: String(d.language), code: d.code } : null;
  } catch { return null; }
};

const TOOLS = [
  {
    name: 'list_notebooks',
    description: "List the user's Sorro notebooks.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_pages',
    description: 'List the pages in one notebook. HTML artifacts show kind "artifact".',
    inputSchema: { type: 'object', properties: { notebook: { type: 'string', description: 'Notebook name or id' } }, required: ['notebook'] },
  },
  {
    name: 'read_page',
    description: 'Read one page. For an HTML artifact, returns its full HTML source.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'save_artifact',
    description: 'Create an HTML artifact page in a notebook, or with id replace an existing artifact\'s title and HTML. The user sees and edits it in Sorro as a Code page and runs it there. Read the page first when editing, since the user may have changed it.',
    inputSchema: {
      type: 'object',
      properties: {
        notebook: { type: 'string', description: 'Notebook name or id. Ignored when id is given.' },
        title: { type: 'string' },
        html: { type: 'string', description: 'A complete HTML document' },
        id: { type: 'string', description: 'Existing artifact page id, to update it' },
      },
      required: ['title', 'html'],
    },
  },
];

type Args = Record<string, string | undefined>;

async function findNotebook(db: SupabaseClient, uid: string, ref: string) {
  const { data, error } = await db.from('sorro_notebooks').select('id,name').eq('user_id', uid).is('deleted_at', null);
  if (error) throw new Error(error.message);
  const hit = (data ?? []).find((n) => n.id === ref) ?? (data ?? []).find((n) => n.name.toLowerCase() === ref.trim().toLowerCase());
  if (!hit) throw new Error(`No notebook "${ref}". Notebooks: ${(data ?? []).map((n) => n.name).join(', ')}`);
  return hit;
}

async function callTool(db: SupabaseClient, uid: string, name: string, a: Args): Promise<unknown> {
  switch (name) {
    case 'list_notebooks': {
      const { data, error } = await db.from('sorro_notebooks').select('id,name').eq('user_id', uid).is('deleted_at', null).order('position');
      if (error) throw new Error(error.message);
      return data;
    }
    case 'list_pages': {
      const nb = await findNotebook(db, uid, a.notebook ?? '');
      const { data, error } = await db.from('sorro_notes').select('id,title,body,updated_at')
        .eq('user_id', uid).eq('notebook_id', nb.id).is('deleted_at', null).order('position');
      if (error) throw new Error(error.message);
      return (data ?? []).map((n) => ({ id: n.id, title: n.title, updated_at: n.updated_at, kind: readCode(n.body)?.language === 'html' ? 'artifact' : 'page' }));
    }
    case 'read_page': {
      const { data, error } = await db.from('sorro_notes').select('id,title,body,notebook_id,updated_at')
        .eq('user_id', uid).eq('id', a.id ?? '').is('deleted_at', null).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('No such page');
      const code = readCode(data.body);
      return code?.language === 'html'
        ? { id: data.id, title: data.title, kind: 'artifact', updated_at: data.updated_at, html: code.code }
        : { id: data.id, title: data.title, kind: 'page', updated_at: data.updated_at, body: data.body };
    }
    case 'save_artifact': {
      if (!a.title?.trim() || typeof a.html !== 'string' || !a.html.trim()) throw new Error('title and html are required');
      if (a.html.length > 2_000_000) throw new Error('HTML is over 2 MB');
      if (a.id) {
        // Only an existing HTML artifact. Overwriting a document or board with HTML would lose it.
        const { data: cur } = await db.from('sorro_notes').select('body').eq('user_id', uid).eq('id', a.id).is('deleted_at', null).maybeSingle();
        if (!cur) throw new Error('No such page');
        if (readCode(cur.body)?.language !== 'html') throw new Error('That page is not an HTML artifact; create a new one instead');
        const { error } = await db.from('sorro_notes').update({ title: a.title.trim(), body: htmlPage(a.html), updated_at: new Date().toISOString() })
          .eq('user_id', uid).eq('id', a.id);
        if (error) throw new Error(error.message);
        return { id: a.id, updated: true };
      }
      const nb = await findNotebook(db, uid, a.notebook ?? '');
      const id = crypto.randomUUID();
      const { error } = await db.from('sorro_notes').insert({ id, user_id: uid, notebook_id: nb.id, title: a.title.trim(), body: htmlPage(a.html), position: 0 });
      if (error) throw new Error(error.message);
      return { id, notebook: nb.name, created: true };
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

const rpc = (id: unknown, result: unknown) => Response.json({ jsonrpc: '2.0', id, result });
const rpcError = (id: unknown, code: number, message: string) => Response.json({ jsonrpc: '2.0', id, error: { code, message } });

export async function handleMcp(req: Request, db: SupabaseClient, uid: string): Promise<Response> {
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  let msg: { id?: unknown; method?: string; params?: Record<string, unknown> };
  try { msg = await req.json(); } catch { return rpcError(null, -32700, 'Parse error'); }
  // Notifications (no id) get no body.
  if (msg.id === undefined) return new Response(null, { status: 202 });
  switch (msg.method) {
    case 'initialize':
      return rpc(msg.id, {
        protocolVersion: (msg.params?.protocolVersion as string) ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'sorro', version: '1.0.0' },
      });
    case 'ping':
      return rpc(msg.id, {});
    case 'tools/list':
      return rpc(msg.id, { tools: TOOLS });
    case 'tools/call': {
      const name = String(msg.params?.name ?? '');
      const args = (msg.params?.arguments ?? {}) as Args;
      try {
        const out = await callTool(db, uid, name, args);
        return rpc(msg.id, { content: [{ type: 'text', text: JSON.stringify(out, null, 1) }] });
      } catch (e) {
        return rpc(msg.id, { isError: true, content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }] });
      }
    }
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
