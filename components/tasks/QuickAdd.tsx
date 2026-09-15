'use client';

import { useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { ContextMenu, type CtxContent } from '@/components/ContextMenu';
import { parseQuickTask, type QuickTokenKind } from '@/lib/taskParse';
import type { List, NewTask } from '@/lib/tasks';
import type { Tag } from '@/lib/tagList';
import { toast } from '@/lib/toast';

const TOKEN_ICON: Record<QuickTokenKind, IconName> = { date: 'cal', time: 'clock', priority: 'flag', course: 'tag', list: 'list' };
const compact = (name: string) => name.replace(/\s+/g, '');

/**
 * The line at the top of My Tasks. Type a task the way you would say it and
 * the date, time, priority, course and list are read out of it, shown as
 * chips before anything is saved. A chip's × keeps those words in the title.
 * The buttons beside the field write the same words for you.
 */
export function QuickAdd({ lists, tags, defaults, onCreate, inputRef }: {
  lists: List[];
  tags: Tag[];
  /** What the current view adds to a new task: its list, course or day. */
  defaults: { listId: string | null; course: string | null; due_on: string | null; hint: string | null };
  onCreate: (task: NewTask) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [text, setText] = useState('');
  const [ignore, setIgnore] = useState<Set<string>>(() => new Set());
  const [focused, setFocused] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; label: string; items: CtxContent } | null>(null);
  const ownRef = useRef<HTMLInputElement>(null);
  const field = inputRef ?? ownRef;

  const parsed = useMemo(() => parseQuickTask(text, new Date(), { lists, tags, ignore }), [text, lists, tags, ignore]);

  const add = (words: string) => {
    setText((current) => `${current.trimEnd()}${current.trim() ? ' ' : ''}${words} `);
    requestAnimationFrame(() => field.current?.focus());
  };

  const submit = () => {
    const title = parsed.title.trim();
    if (!title) {
      toast(text.trim() ? 'Those words all became details. Add a name for the task.' : 'Type a task first');
      return;
    }
    onCreate({
      id: crypto.randomUUID(),
      title,
      due_on: parsed.due_on ?? defaults.due_on,
      due_at: parsed.due_at,
      priority: parsed.priority,
      course: parsed.course ?? defaults.course,
      listId: parsed.listId ?? defaults.listId,
    });
    setText('');
    setIgnore(new Set());
  };

  const openMenu = (e: React.MouseEvent<HTMLElement>, label: string, items: CtxContent) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ x: Math.max(8, r.right - 260), y: r.bottom + 6, label, items });
  };

  const expanded = focused || !!text;

  return (
    <div className={'quick-add' + (expanded ? ' is-open' : '')}>
      <div className="quick-add-row">
        <span className="quick-add-plus" aria-hidden="true"><Icon name="plus" size={16} /></span>
        <input ref={field} value={text} aria-label="Add a task" enterKeyHint="done"
          placeholder={defaults.hint ? `Add a task to ${defaults.hint}` : 'Add a task'}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
            if (e.key === 'Escape' && text) { e.preventDefault(); e.stopPropagation(); setText(''); setIgnore(new Set()); }
          }} />
        <div className="quick-add-tools" onMouseDown={(e) => e.preventDefault()}>
          <button type="button" aria-label="Add a date" title="Date" onClick={(e) => openMenu(e, 'Date', [
            { icon: 'cal', label: 'Today', run: () => add('today') },
            { icon: 'cal', label: 'Tomorrow', run: () => add('tomorrow') },
            { icon: 'cal', label: 'Next week', run: () => add('next week') },
            { icon: 'clock', label: 'Tonight', hint: '8:00 PM today', run: () => add('tonight') },
          ])}><Icon name="cal" size={15} /></button>
          <button type="button" aria-label="Set a priority" title="Priority" onClick={(e) => openMenu(e, 'Priority', [
            { icon: 'flag', label: 'High', swatch: '#f26047', run: () => add('!high') },
            { icon: 'flag', label: 'Medium', swatch: '#e0a100', run: () => add('!med') },
            { icon: 'flag', label: 'Low', swatch: '#345cff', run: () => add('!low') },
          ])}><Icon name="flag" size={15} /></button>
          {lists.length > 0 && (
            <button type="button" aria-label="Choose a list" title="List" onClick={(e) => openMenu(e, 'List', lists.map((l) => ({ icon: 'list' as const, label: l.name, swatch: l.color, run: () => add('@' + compact(l.name)) })))}>
              <Icon name="list" size={15} />
            </button>
          )}
          {tags.length > 0 && (
            <button type="button" aria-label="Choose a course" title="Course" onClick={(e) => openMenu(e, 'Course', tags.map((t) => ({ icon: 'tag' as const, label: t.name, swatch: t.color, run: () => add('#' + compact(t.name)) })))}>
              <Icon name="tag" size={15} />
            </button>
          )}
          <button type="button" className="quick-add-submit" disabled={!parsed.title.trim()} onClick={submit}>Add</button>
        </div>
      </div>

      {(parsed.tokens.length > 0 || expanded) && (
        <div className="quick-add-foot" aria-live="polite">
          {parsed.tokens.length > 0 ? parsed.tokens.map((token) => (
            <span key={token.kind + token.raw} className="quick-token" data-kind={token.kind}>
              <Icon name={TOKEN_ICON[token.kind]} size={12} />
              {token.label}
              {token.raw && (
                <button type="button" aria-label={`Keep “${token.raw}” in the title`} title="Keep these words in the title"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setIgnore((set) => new Set(set).add(token.raw))}>
                  <Icon name="close" size={10} />
                </button>
              )}
            </span>
          )) : (
            <span className="quick-add-hint">Try “Essay friday 3pm !high{tags[0] ? ` #${compact(tags[0].name)}` : ''}{lists[0] ? ` @${compact(lists[0].name)}` : ''}”</span>
          )}
        </div>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} kind="tasks" label={menu.label} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}
