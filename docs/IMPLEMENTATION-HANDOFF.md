# Basedly implementation guide and continuation handoff

For Claude Code, Gemini Antigravity, or the next Codex session. Baseline release: `b981642`, deployed to master on September 12, 2026. The second pass below is saved in the working tree, NOT committed or deployed. The last deployed baseline remains b981642. This guide distinguishes implemented source, verified behavior and pending work.

## Cutoff status: September 12, 2026

The account usage tool reached **95% weekly usage**, the user's explicit cutoff. Implementation stopped. All changes remain local and uncommitted on master. Do not assume they exist on the live site. `git diff --check`, TypeScript, production build and 45 automated tests passed. The production build emitted nonfatal autoprefixer warnings about `align-items:start`.

Final fresh visual review was started but interrupted at the cutoff, so **there is no second-pass ship verdict**. Impeccable documentation refresh also remains pending. `design.md` / `.impeccable/design.json` primarily describe the baseline; the current second-pass additions and confirmed decisions are recorded in this guide. The first-pass review verdict must not be reused for this pass.

Next agent should inspect the local diff and the validation boundaries below, finish the bounded review, resolve material issues, update design documentation, then commit/push master according to GEMINI.md and check Vercel. Do not start by rebuilding the app from scratch. No paid packages, backend collaboration migrations or invitation emails were introduced.

## Start here

1. Work in `C:\Users\J30N\BASEDLY`. Read `GEMINI.md` for repository operations, `AGENTS.md` for editor constraints, and the architecture cautions in `HANDOFF.md`.
2. `HANDOFF.md` contains historical product scope. Its social/onboarding descriptions are obsolete. Use `PRODUCT.md`, `design.md`, and this guide for current scope. Preserve its save/realtime cautions.
3. Run `git status --short`. Do not stage the pre-existing `.edge-tmp-profile`, `.npm-task-cache`, `.shots`, `.vercal-tmp.png`, or inspection images. They are not application source.
4. App: Next.js 15 / React 19 / TypeScript, TanStack Query, Supabase, static export to Vercel, Capacitor Android shell. `package.json` and the lockfile own exact dependencies.
5. Commands: `npm run dev -- --port 3010`, `npm run typecheck`, `npm test`, `npm run build`. Stop the dev server before building: both use `.next`, and a build can invalidate the running server's chunks.
6. Repo convention is commit and push master after verification. Never force push or overwrite concurrent changes. Do not claim deployed until Vercel reports success.

## Design authority

The user supplied UX+AI event posters: near-black fields, strong blue/yellow/red, geometric and halftone compositions, legible large type. This is a productivity app: poster energy belongs in discovery; working editors should be quiet.

- Preserve the original lowercase **basedly** wordmark. `app/layout.tsx` loads Familjen Grotesk for that mark. Do not replace it with another logo.
- The app uses an Apple-like native system stack: `-apple-system`, `BlinkMacSystemFont`, SF Pro, Segoe UI, Roboto, Helvetica, sans-serif. SF Pro is used where installed; do not redistribute Apple's font files.
- Retain grouped, rounded sidebar navigation without its former gradient. Desktop groups are Plan / Think / Self. Mobile has Today / Calendar / Tasks / Notebooks / More. Compact sidebar remains available.
- Dark fields: `#111315`, `#17191c`, `#1c1f22`; light fields: `#f7f7f2`, `#efefea`, white. Use foreground/border tokens in every editor state.
- `app/studio.css` owns the current shell/home/library tokens and layouts. It has earlier rules followed by overrides: selector specificity matters. Effective dark poster accents are `#345cff`, `#f5df4d`, `#f26047`; light accents are `#3165f5`, `#f4d65d`, `#f16d56`.
- `design.md` records the implemented system, `.impeccable/design.json` contains component previews, and `.impeccable/direction.md` records the user-pinned direction. They describe a code-led build, with no approved raster comp.
- Motion must respect preferences/reduced motion. Use transforms/opacity for transitions and avoid continuously animating layout dimensions or hiding content until an animation finishes.

## Application map

| Area | Main files | Behavior |
| --- | --- | --- |
| Shell | `components/Shell.tsx`, `app/studio.css`, `lib/destinations.ts`, `lib/useLayout.ts` | Navigation, responsive layout, compact mode, theme, account, lazy search/settings, online status. Tablet layout follows width rather than Android user-agent detection. |
| Today | `app/(shell)/home/page.tsx` | Greeting, current/next event, earliest unfinished task with overdue labeling, remaining agenda, quick scratch/task capture, habits, notebook links, recent pages. Uses actual queries/mutations, not static marketing cards. |
| Tasks | `app/(shell)/tasks/page.tsx`, `lib/tasks.ts`, `components/TaskComposer.tsx`, `components/tasks/TaskTable.tsx` | Existing CRUD, groups/list/table/board, deadlines, priorities/stars, detail panel, cover photography. Deadline rows show one status; detailed countdown remains in the detail panel. |
| Calendar | `app/(shell)/calendar/page.tsx`, `lib/events.ts` | Existing calendar CRUD/views and integrations; new shell/theme/title spacing. Preserve existing calendar data handling. |
| Focus | `app/(shell)/focus/page.tsx`, `lib/focusClock.ts` | Timestamp-based timer, pause/resume, intention, daily goal and device-local progress. Time continues correctly while tab timers are suspended. |
| Habits / Gym / Fuel / Money | Their `app/(shell)` routes and existing feature components | Existing domain functionality retained within the current shell/theme. Habits and Fuel hero washes/buddy removed; Money columns adapt and Jars have no redundant outer enclosure. These are not rewrites of their backend schemas. |
| Search / utility UI | `SearchPalette.tsx`, `SettingsModal.tsx`, `AccountSheet.tsx`, `TabRail.tsx`, `Page.tsx` | Search active tools/tasks/notes/events with debounced remote search and cached results. Settings/account switching retained. Blue segmented controls; shared page heading/measure. |

Community, Messaging, Files, Projects, Profile, onboarding and buddy are absent from the active product. Old route files redirect instead of deleting user data. Legacy data tables/components can still exist; their presence is not authority to restore navigation.

## Library and notebook routing

`app/(shell)/notebooks/page.tsx` is the library and mixed-page controller. The Notebook nav opens the library immediately, without the old notebook/graph/java pill switcher.

- `nbId` chooses the notebook; `noteId` chooses the page. Other local states own the page chooser, move chooser, camera, Trash and legacy tools.
- Deep links accept `?notebook=<id>`, `?open=<note-id>` and the older `?note=<note-id>`.
- `useNotebooks`, `useNotes`, `useTrash`, `useTags` come from `lib/notes.ts`.
- Each page is still one `bd_notes` row with `notebook_id`, title and body. Mixed editors are selected from the body format. There is no new page-type database column.
- Editors load dynamically. Document/Journal originally used `NoteEditor`; structured study pages use `StudyPage`; boards/PDF use `FreeBoard`; snippets use `CodePage`.
- Legacy boards (`lib/canvas.ts`), saved journals and saved Java files remain in the library's “Earlier…” disclosure to preserve access to old content.
- `components/notes/NotebookCover.tsx` draws deterministic flat cover geometry and actual object-cover images; it falls back to legacy shelf wallpaper URLs. `lib/shelfPrefs.ts` is the older shelf customization store.

## Body formats and backward compatibility

`lib/pageKinds.ts` defines discriminated documents and validators:

- Ordinary Markdown is Document. Do not reinterpret a Markdown code fence as a structured Code page; prose after that fence must survive.
- `<!-- basedly-board:v1 -->` followed by JSON stores board version/kind/items and optional PDF source. Existing kinds include `whiteboard`, `moodboard`, `pdf`.
- `<!-- basedly-page:v1 -->` followed by JSON stores checklist, flashcards, Cornell notes and Code.
- Journal currently recognizes the `# Journal · ` Markdown prefix. Keep legacy Journal data separate unless implementing an explicit migration.
- Assets store `{localId, path?, name}`. `path` is a private storage object path, never a public URL or signed URL persisted as content.
- Additive new item fields must be optional for old documents. Update validators, previews, rendering, copy/delete behavior and regression tests together. Never silently replace unreadable documents with blank content.

## Saving and offline behavior: do not regress

`components/notes/usePageDraft.ts` uses a 600 ms debounce, marks pending text immediately, and flushes on pagehide, hidden visibility and editor unmount. Its cleanup keys off note identity, not an unstable save callback.

`lib/notes.ts` defines mutation defaults used by the persisted mutation queue. `SAVE_NOTE` is an upsert and intentionally has no rollback on error. Refetches overlay pending local title/body. Pending notes absent from a returned server list are preserved in the cache. A delayed create must not overwrite an already saved edit: new-note creation uses upsert with duplicate-ignore behavior.

Other mutation invalidation uses the existing settler. Realtime is one session-owned channel in `lib/realtime.ts`; `lib/liveInvalidation.ts` batches notifications and defers them around active writes. Preserve correct query-key prefixes and every cached event window.

Never show “saved to cloud” based only on the debounce timer ending. The original “Autosave on” wording describes mode, not server acknowledgment. Visible errors and local asset indicators matter. A page reload with a persisted cache is not proof of cross-device sync.

## Infinite board and PDF implementation

- `FreeBoard.tsx` maintains board content separately from viewport state. `boardRef` and `viewRef` keep pointer handlers current without waiting for React renders.
- `lib/boardGeometry.ts`: screen/world conversion, zoom anchored at pointer, content fitting, stroke bounds and pressure-outline path generation. Coordinates stored with items are world coordinates.
- Drawing uses Pointer Events, coalesced samples and pressure. Live SVG strokes update through a ref; committed objects enter the saved document. Pen activity suppresses incidental touch briefly. Touch pinch/pan and middle-button pan are supported.
- Existing tools: select, pan, pen, text, object erase, photos, undo/redo, colors, width, finger drawing. Undo history is capped at 60 snapshots.
- Image imports resize to a bounded WebP, then save private asset references. Board text/images can move/resize; strokes retain their own geometry.
- `PdfBackground.tsx` imports PDF.js lazily and uses `public/vendor/pdf.worker.min.mjs` from the same `pdfjs-dist` version. The worker license/provenance live beside it. Keep versions matched.
- PDFs render at a logical width of 760, offset 360 into a 1480-wide annotation field. That gives 360 units on each side. PDF pages stay actual document paper; the outside canvas follows the active editor-paper theme; actual PDF pages remain white.
- PDF pages render lazily when near the viewport. Dispose loading tasks and cancel render tasks on unmount. Import limit is 40 MB; image import is 25 MB before resizing.
- `lib/pageAssets.ts` stores files in IndexedDB then attempts the existing private uploader. Local-only references display Retry cloud sync. This code needs further offline/sync refinement, not invented success messages.

## Other page editors

- `StudyPage.tsx`: editable checklists and completion progress; flashcard creation/question-answer editing/practice/reveal/previous/next; Cornell cues, notes and summary.
- `CodePage.tsx` at the baseline is a plain snippet textarea with selectable language, copy and Tab indentation. It does **not** execute Java or provide IDE diagnostics. The next request explicitly replaces this with a Java-only VSCode-like editor.
- `NoteEditor.tsx` is the existing Markdown editor with formatting helpers, read/write modes, equations, images, tags, links and existing save safeguards. It is **not** yet Google Docs parity. Inspect it before replacing any feature.
- `Journal.tsx` and its `JournalWindow` preserve the older day/night journal UI in the legacy collection. The next request asks to bring that feel into notebook Journal pages without losing the old collection.

## Camera, cutouts and image synchronization

`CoverCapture.tsx` / its CSS module implement choose → camera/photo → process → review → apply → done, with file input fallback. The modal traps focus, participates in Back handling, and stops media tracks on every exit. Cancel terminates the inference worker.

`lib/coverProcessing.ts` validates/decodes/resizes input to a maximum 1280 edge and manages the worker/deadline. `lib/cover.worker.ts` uses Transformers.js and the MIT `studioludens/birefnet-lite-512` model pinned to revision `4a3c40c36c94093cc1e724d9ea428b8fa4b57dc7`. Runtime/model download is roughly 220 MB on first use; no per-image fee. The 1024 model previously failed browser inference. Do not restore it without measured device evidence. Model runs locally; the original photo is not sent to a cutout service.

`lib/objectCovers.ts` stores owner-scoped metadata and an IndexedDB image first, then uploads the applied result to private `bd-files/<uid>/object-covers/<kind>__<id>__<timestamp>.png`. It lists remote covers and chooses the latest version, uses signed URLs for display, and retries pending uploads on reconnect/focus. Stale upload responses must not supersede a newer cover. `NotebookCover` and `ObjectCoverImage` subscribe through `useObjectCover`.

Apply animates a copy of the image toward the actual `[data-object-cover]` target when visible. The UI must use the actual notebook/task title. Device-local saves must remain distinguishable from synced covers.

`docs/PHOTO-COVERS.md` records the free/on-device versus cloud comparison, licenses and limits. CSP in `app/layout.tsx` and `vercel.json` allows the model/runtime hosts, WASM compilation, and self/blob workers. Do not broadly relax CSP to fix a worker error. Android camera hardware is optional in `AndroidManifest.xml`.

The next pass explicitly requests reliable desktop↔phone wallpaper sync. Audit the legacy shelf image path as well as object covers. They are two separate systems; fixing one does not prove the other.

## Back navigation and contextual UI

`lib/navigationHistory.ts` is a framework-independent overlay-history controller. `lib/nav.ts` installs it once from Shell and exposes `useOverlayBack`.

- One temporary history entry protects the current page. Back closes the top overlay and re-arms only if another remains.
- A real navigation replaces the temporary entry, preserving actual route history rather than inserting phantom pages.
- Programmatic close can trigger asynchronous history cleanup. Route writes queue until that traversal finishes, preventing a double return.
- Mouse side buttons use native browser Back. Do not reintroduce global mouse-button listeners that call Back in addition to the browser.
- Escape allows local handlers first, then closes one registered overlay. Nested editing/selection must register in order.
- Capacitor hardware Back uses the same history behavior, or minimizes at the app root.
- `ContextMenu.tsx` supports groups, submenus, disabled reasons, checks, swatches and shortcuts. It portals to body, measures its bounds, and clamps a keyboard-accessible popover to the viewport. Mobile rows have 44 px targets. Submenus open within the same panel and register a nested Back layer. Extend this shared component instead of making separate bespoke menus everywhere.
- Fixed UI inside the main zoom/transformed area must portal to body; otherwise viewport pointer coordinates place it incorrectly.

## Verification baseline

- Baseline production build and TypeScript passed; 41 automated tests passed. See `docs/REDESIGN-VALIDATION.md` for exact scope.
- Browser checks covered 390×844, 1024×1366, 1440×900 and actual 1910×855, dark/light, board Back nesting, PDF margin annotation, cutout apply/reload, checklist and flashcards, and focus reload.
- After deployment, a temporary checklist in the existing TEST1 notebook was created, completed, reloaded successfully and moved to Trash. No permanent purge occurred.
- Fixture IDs such as `nb1` are invalid production UUIDs. Fixture mutations can report errors and cannot validate authenticated cloud writes. Dev fixtures are guarded from production.
- Physical Android, mouse hardware event delivery, camera hardware, Xiaomi stylus and authenticated cross-device asset sync remain unverified. Never promote browser emulation into device validation.
- Latest visual reviewer marked seven corrective findings resolved, a ship verdict at those fixes' scope. It did not certify every backend/device feature.

## Next pass requested by the user

The user prioritizes this Markdown handoff. Build improvements while usage allows; when approaching 95% account usage, stop starting new feature groups, record exact remaining work, verify/stabilize what is already changed and hand off. At the start of this pass, weekly usage was 67%. Refresh the usage tool periodically; do not assume token count equals account usage.

| ID | Requested outcome | Current status (second pass) |
| --- | --- | --- |
| N1 | Separate notebook artwork and title; visual creation with colour/photo preview. | Implemented; browser checked. NotebookBuilder.tsx, NotebookCover.tsx, notebooks/page.tsx and CSS. |
| N2 | Shared right-click menus for applicable objects/pages/notebooks. | Implemented shared keyboard menu; added library/page/board/connection coverage. Nested Back browser checked. Additional context coverage remains incremental. |
| N3 | Pen/marker/highlighter previews, circular size-aware pen/eraser, Ctrl+Draw drag pan, Ctrl+eraser marquee, text/paper colors. | Implemented in FreeBoard; drawing, erasing, undo browser checked. Ctrl modifier drag and physical stylus remain manual tests. Legacy NoteSketchpad/Canvas still use older tools. |
| N4 | PDF outside margins follow dark/light theme. | Implemented theme CSS. Previous PDF import/margin pipeline retained; current physical-device checks pending. |
| N5 | Google Docs-level document utilities, comments, suggestions and invite-only simultaneous collaboration. | NOT implemented in full. Existing WYSIWYG/Markdown toolbar retained. New task panel added and document title/body shrink bug corrected. See collaboration plan below. |
| N6 | Editable titled schema cards with fields and draggable connections. | Implemented; two-card edit, arrange and connection browser checked. Referenced blueprint image was not available; design follows user description. |
| N7 | Document left task panel: create note-specific tasks and attach existing My Tasks entries. | Implemented via DocumentWorkspace.tsx and existing task named links. UI/Back checked. Authenticated create/link/reload verification remains required. |
| N8 | Combine Board/Moodboard; opening an existing board shows compressed content; center click restores original positions. | Implemented, view-only gathered state. Old moodboard bodies remain readable. Card coordinates preserved in browser gather/expand check. No library energy preview. |
| N9 | Editors fill available width/height with compact title/back chrome. | Implemented and checked at desktop and 390px phone for Board, Java and document task layout. |
| N10 | Larger camera UI. | Implemented 860px maximum dialog and responsive 50dvh stage. Previous camera/cutout pipeline retained; new size needs hardware validation. |
| N11 | Desktop to phone image/wallpaper sync. | Added visible 30-second cover refresh, reconnect refresh, guarded migration of legacy local wallpapers after remote lookup. Authenticated cross-device validation NOT completed. |
| N12 | Journal day/night graphic at top left and subtle notebook rules. | Implemented JournalPage with existing JournalWindow; marker retained. New journal prompts are plain text. Legacy collection remains accessible. |
| N13 | Java-only VSCode-like editor with real-time syntax colors. | Implemented lossless display lexer, file tab, breadcrumb, line numbers, wrap, copy, download and cursor status. No compiler/LSP/autocomplete/debugger. Existing code is preserved. |
| N14 | Illustrated Add page choices. | Implemented PageTypeArt using CSS/SVG previews of every type. Cornell class collision corrected after browser check. |
| N15 | Rework progress bars. | Shared AsciiBar rebuilt with flat fills, outside labels, transform animation and preserved vertical/jar/slim/edge APIs. Native progress themed. Not every bespoke legacy widget migrated. |

## Continuation record

Second pass is on master after baseline b981642. At 88% weekly usage the builder stopped starting feature groups and entered stabilization. This file is the priority deliverable requested by the user. Check git log/status for the final second-pass commit; do not assume the baseline contains these changes.

Validation so far: npm test passed 45 tests; npm run typecheck passed; npm run build passed (nonfatal autoprefixer start-value warnings). Static design detector found no non-advisory findings for scanned editor targets. Browser fixtures checked two editable cards, draggable connection, gather/expand preservation, sparse-stroke erasing/undo, right-click menu, Back closes menu then selection, Java source/colour rendering, task-panel Back, creation preview, Add page previews and Journal. Screenshots use editor-* filenames under .impeccable/review. Those local images are not required to run the app.

Fixtures use notebook id nb1 and user me, so their attempted writes report invalid UUID errors. This is NOT evidence of broken production schema, and it is NOT proof that cloud saving works. Do not hide these errors or report local cache replay as server persistence. Physical Android/tablet/stylus/camera, cross-device sync and collaboration remain unverified. No collaboration tables, invitation endpoints, CRDT provider or paid editor packages were added in this pass.

New modules: NotebookBuilder.tsx, PageTypeArt.tsx, JournalPage.tsx, DocumentWorkspace.tsx; lib/javaTokens.ts, lib/noteTaskLinks.ts, lib/editorTools.check.ts. Existing modules changed: FreeBoard, CodePage, NotebookCover, CoverCapture.module.css, ContextMenu, AsciiBar, NoteEditor layout, notebooks route/CSS, studio.css, objectCovers, boardGeometry and pageKinds.

Board data additions are optional fields: schema title/fields, background, brush, opacity; document connections {id,from,to}. Deleting an item removes incident edges. Undo snapshots include edges. Gathered state is React viewport state only and is never written to body. Expanding fits the existing world coordinates to the viewport. Preserve this separation. Circle erasing uses distance to stroke segments rather than just sparse sample points. Ctrl+eraser selects intersecting objects, and Delete or the selection toolbar removes them.

Task links reuse a named URL line in Task.notes (Basedly note: <origin>/notebooks/?note=<id>). attachNoteToTask is idempotent and detach removes only the matching link line. This intentionally uses current task APIs/cache/queue rather than inventing a parallel task store. Future multiuser task visibility requires separate permissions; sharing a document must not reveal the author's personal task list.

Java lexer is syntax colouring only and React-escapes every token. Existing non-Java code pages remain readable; a source edit sets language to java while retaining the entire code string. Wrapped mode hides line numbers to avoid incorrect row alignment. Do not claim an actual Java runtime.

Cover sync uses private storage and owner-scoped local references. Legacy migration runs only for notebooks returned by the active user's notebook query, checks remote covers first, skips existing refs and keeps original legacy image data. The 30-second poll exists only while cover subscribers exist and only fetches when visible/online. No device sync success claim is made until two authenticated devices confirm the same applied cover.

## Next agent: Google Docs editor and live collaboration

The user has already answered these. Do not ask again:

- Include formatting, headings, lists, tables, images, links, undo/redo/export, plus comments, suggestions and collaboration.
- Only explicitly invited Google-account emails may collaborate on that particular document.
- Simultaneous live editing, presence and comments are required in the first collaboration version. Suggestions also remain in scope.
- Free as much as possible. No public share links, no access to a whole notebook by implication, no paid-service dependency silently introduced.

Implementation proposal, not existing architecture:

1. Audit NoteEditor.tsx and lib/md.ts before changing serialization. The existing editor includes WYSIWYG block rendering, text/highlight colour, media, tables, columns, math, backlinks, tags and paper styles. Preserve all current note bytes. Introduce a separate versioned rich-document record, an explicit migration preserving original Markdown, and a safe legacy view for unsupported nodes. Never feed unknown saved JSON into a blank default editor.
2. Use a mature transaction-based rich text engine. Tiptap's open-source core wraps ProseMirror and provides a configurable schema; its hosted/pro comments are paid, so they do not satisfy free-by-default without a deliberate choice. Own comments/suggestions need real transaction/anchor handling, not local arrays attached to character offsets. See [Tiptap editor documentation](https://tiptap.dev/docs/editor/getting-started/overview) and [Comments](https://tiptap.dev/docs/comments/getting-started/overview), checked September 12, 2026.
3. Use Yjs or an equivalent CRDT for simultaneous edits. Persist durable updates and snapshots, keep a local offline store, deduplicate update ids and replay missed updates on reconnect. A last-writer-wins upsert of bd_notes.body cannot be the shared live-editor protocol. Presence/cursors are transient, document state is durable. [Yjs WebSocket provider documentation](https://docs.yjs.dev/ecosystem/connection-provider/y-websocket) describes synchronization, awareness and server persistence; this is a candidate architecture, not an installed dependency.
4. Add document-scoped membership and invitations with normalized email, role (owner/editor/commenter/viewer), expiry, revocation and audit fields. Claim invitations server-side only after verified Google identity matches the invited email. Do not trust client-supplied email/user ids or turn an arbitrary matching email profile into membership. Keep notebook ownership unchanged. Invitations must not send email until the user explicitly sends an invitation in the product.
5. Enforce membership in RLS for documents, updates, comments, suggestion decisions and shared assets. Invitees need specifically scoped access to document attachments, while current storage policy is owner-path based. Do not expose the entire private bd-files bucket to solve image sharing. A server checks identity and membership before issuing signed attachment URLs.
6. If reusing Supabase Realtime, use private document channels with authorization for broadcast/presence and durable Postgres state. [Supabase Realtime authorization](https://supabase.com/docs/guides/realtime/authorization) is the official reference. RLS for notes alone does not authorize Realtime channels. Test active-session revocation explicitly; joining once must not give indefinite access after removal. A custom Yjs provider over this transport needs a state-vector handshake, reliable catch-up and acknowledgement, not just broadcasting each textarea value. Alternatively deploy a dedicated authenticated Yjs/Hocuspocus service and document hosting cost. This decision is still open.
7. Comments need stable CRDT-relative range anchors, replies, resolve/reopen, author, timestamps and orphaned-range treatment after deletion. Suggestions need insert/delete/format operations with accept/reject transformations that converge under concurrent edits. Preserve authorship and avoid resurrecting deleted content on reload. Implement keyboard/mobile controls and retain the left task panel.
8. Build the real document shell around the editor: compact accessible formatting menus, paragraph/style controls, alignment/indent/spacing, tables, image sizing/wrapping, links, find/replace, undo/redo, page/pageless layout, export/print, selection affordances and comments sidebar. Do not ship decorative disabled menus that imply missing features work. A Google Docs-like appearance alone does not complete this item.
9. Validate with two distinct invited Google accounts plus one outsider: simultaneous typing at the same position, reconnect while offline, attachments, comments on edited/deleted ranges, accepted/rejected suggestions, reload, membership revocation, sign-out/account switch and no personal-task disclosure. Do not certify this through two fixture tabs with owner-only local data.

## Final continuation checklist

- Finish authenticated notebook creation with photo, existing task linking, board reload and desktop↔phone cover tests. Create clearly temporary data and use normal Trash/Undo for cleanup; do not permanently purge user content.
- Test Ctrl+drag panning, Ctrl+eraser marquee selection, pressure/palm rejection and mouse side buttons with actual hardware. Browser Back tests cover routing logic, not physical mouse event delivery.
- Apply drawing improvements to legacy NoteSketchpad/Canvas if those remain exposed through Document; they currently retain older tools. Further progress-widget migration also remains.
- Implement Google Docs/live collaboration as above, including backend migrations and authorization tests, then APK packaging/device validation when requested.
- Preserve unrelated existing untracked .edge-tmp-profile/, .npm-task-cache/, .shots/, .vercal-tmp.png, REDESIGN-INVENTORY.md and REDESIGN-PROMPT.md. Do not stage or delete them wholesale.
- Read GEMINI.md for repository workflow and HANDOFF.md for original offline/save rules. User instructions in this handoff supersede older product scope but not data-preservation invariants.

