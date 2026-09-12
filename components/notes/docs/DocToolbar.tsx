'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useEditorState } from '@tiptap/react';
import { Icon, type IconName } from '@/components/Icon';
import { MenuPanel, MenuSearch, type MenuTree } from './DocMenu';
import { Popover } from './Popover';
import { currentFont, currentFontSize, currentStyle, setFont, setFontSize } from './docCommands';
import { clearFormatting, listEntries, MODES, spacingEntries, styleEntries, zoomEntries, type DocContext } from './docMenus';
import { FONTS, FONT_SIZES, PARAGRAPH_STYLES, TEXT_PALETTE, colorName, loadFonts } from './palette';

type Open = { key: string; rect: DOMRect } | null;

function ToolButton({ label, icon, onClick, active, disabled, children, className = '', shortcut, anchor }: {
  label: string; icon?: IconName; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; active?: boolean; disabled?: boolean;
  children?: ReactNode; className?: string; shortcut?: string; anchor?: boolean;
}) {
  const tip = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button type="button" className={'doc-tool ' + className + (active ? ' is-active' : '')} data-doc-tip={tip} aria-label={label}
      aria-pressed={active === undefined ? undefined : active} disabled={disabled} data-popover-anchor={anchor ? true : undefined}
      data-menu-anchor={anchor ? true : undefined} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  );
}

function Palette({ value, onPick, resetLabel }: { value: string | null; onPick: (hex: string | null) => void; resetLabel: string }) {
  return (
    <div className="doc-palette">
      <button type="button" className="doc-palette-reset" onClick={() => onPick(null)}><Icon name="close" size={14} />{resetLabel}</button>
      {TEXT_PALETTE.map((row, r) => (
        <div key={r} className={'doc-palette-row' + (r === 2 ? ' is-spaced' : '')} role="group">
          {row.map((hex) => (
            <button key={hex} type="button" className={'doc-swatch' + (value?.toLowerCase() === hex ? ' is-on' : '')}
              style={{ background: hex }} aria-label={colorName(hex)} title={colorName(hex)} onClick={() => onPick(hex)} />
          ))}
        </div>
      ))}
      <label className="doc-palette-custom">
        <span>Custom</span>
        <input type="color" value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onPick(e.target.value)} />
      </label>
    </div>
  );
}

/**
 * The toolbar row. It re-renders from a narrow slice of editor state, so
 * typing a letter does not redraw every button.
 */
export function DocToolbar({ context, getMenus, phone, onPaint, painter }: {
  context: DocContext;
  getMenus: () => MenuTree;
  phone: boolean;
  onPaint: (action: 'once' | 'sticky' | 'off') => void;
  painter: 'once' | 'sticky' | null;
}) {
  const { editor, mode } = context;
  const [open, setOpen] = useState<Open>(null);
  const [sizeDraft, setSizeDraft] = useState<string | null>(null);
  const editing = mode !== 'viewing';
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  // The row scrolls sideways when the window is narrow; fade the side that has more tools past it.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setEdges((prev) => {
      const next = { left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 };
      return prev.left === next.left && prev.right === next.right ? prev : next;
    });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    return () => { observer.disconnect(); el.removeEventListener('scroll', measure); };
  }, []);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => (!e ? null : {
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'),
      color: (e.getAttributes('textStyle').color as string | undefined) ?? null,
      highlight: (e.getAttributes('highlight').color as string | undefined) ?? (e.isActive('highlight') ? '#ffff00' : null),
      align: (['center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? 'left',
      bullet: e.isActive('bulletList'), number: e.isActive('orderedList'), task: e.isActive('taskList'),
      link: e.isActive('link'), style: currentStyle(e), font: currentFont(e), size: currentFontSize(e),
      canUndo: e.can().undo(), canRedo: e.can().redo(), empty: e.state.selection.empty,
    }),
  });

  if (!state) return null;
  const toggle = (key: string) => (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setOpen((current) => (current?.key === key ? null : { key, rect }));
  };
  const close = () => setOpen(null);
  const chain = () => editor.chain().focus();
  const zoomLabel = context.zoom === 'fit' ? 'Fit' : `${Math.round(context.zoom * 100)}%`;
  const styleName = PARAGRAPH_STYLES.find((s) => s.id === state.style)?.name ?? 'Normal text';
  const commitSize = (value: string) => {
    const n = parseFloat(value);
    if (Number.isFinite(n) && n > 0) setFontSize(editor, n);
    setSizeDraft(null);
  };
  const alignIcon: IconName = state.align === 'center' ? 'alignCenter' : state.align === 'right' ? 'alignRight' : state.align === 'justify' ? 'alignJustify' : 'alignLeft';
  const modeInfo = MODES.find((m) => m.id === mode)!;
  const rule = <span className="doc-tool-rule" aria-hidden />;

  return (
    <div className="doc-toolbar" role="toolbar" aria-label="Formatting">
      <div ref={scroller} className={'doc-toolbar-scroll' + (edges.left ? ' fade-left' : '') + (edges.right ? ' fade-right' : '')}>
        <MenuSearch getMenus={getMenus} compact={phone} />
        <ToolButton label="Undo" shortcut="Ctrl+Z" icon="undo" disabled={!editing || !state.canUndo} onClick={() => chain().undo().run()} />
        <ToolButton label="Redo" shortcut="Ctrl+Y" icon="redo" disabled={!editing || !state.canRedo} onClick={() => chain().redo().run()} />
        {!phone && <ToolButton label="Print" shortcut="Ctrl+P" icon="print" onClick={context.print} />}
        <ToolButton label="Paint format" icon="paintFormat" active={!!painter} disabled={!editing}
          onClick={(e) => onPaint(e.detail > 1 ? 'sticky' : painter ? 'off' : 'once')} />
        {!phone && <ToolButton label="Zoom" className="doc-tool-select" anchor onClick={toggle('zoom')}><span>{zoomLabel}</span><Icon name="chevronDown" size={14} /></ToolButton>}
        {rule}
        <ToolButton label="Styles" className="doc-tool-select is-wide" anchor disabled={!editing} onClick={toggle('style')}><span>{styleName}</span><Icon name="chevronDown" size={14} /></ToolButton>
        {rule}
        <ToolButton label="Font" className="doc-tool-select is-font" anchor disabled={!editing}
          onClick={(e) => { loadFonts(FONTS.map((f) => f.name)); toggle('font')(e); }}>
          <span style={{ fontFamily: FONTS.find((f) => f.name === state.font)?.stack }}>{state.font}</span><Icon name="chevronDown" size={14} />
        </ToolButton>
        {rule}
        <div className="doc-size" role="group" aria-label="Font size">
          <ToolButton label="Decrease font size" shortcut="Ctrl+Shift+," icon="minus" disabled={!editing} onClick={() => setFontSize(editor, state.size - 1)} />
          <input aria-label="Font size" disabled={!editing} inputMode="decimal" data-popover-anchor
            value={sizeDraft ?? String(state.size)} onChange={(e) => setSizeDraft(e.target.value)}
            onFocus={(e) => { e.currentTarget.select(); setOpen({ key: 'size', rect: e.currentTarget.getBoundingClientRect() }); }}
            onBlur={(e) => { if (sizeDraft !== null) commitSize(e.currentTarget.value); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitSize(e.currentTarget.value); close(); } if (e.key === 'Escape') { setSizeDraft(null); close(); editor.commands.focus(); } }} />
          <ToolButton label="Increase font size" shortcut="Ctrl+Shift+." icon="plus" disabled={!editing} onClick={() => setFontSize(editor, state.size + 1)} />
        </div>
        {rule}
        <ToolButton label="Bold" shortcut="Ctrl+B" icon="bold" active={state.bold} disabled={!editing} onClick={() => chain().toggleBold().run()} />
        <ToolButton label="Italic" shortcut="Ctrl+I" icon="italic" active={state.italic} disabled={!editing} onClick={() => chain().toggleItalic().run()} />
        <ToolButton label="Underline" shortcut="Ctrl+U" icon="underline" active={state.underline} disabled={!editing} onClick={() => chain().toggleUnderline().run()} />
        <ToolButton label="Text color" className="doc-tool-color" anchor disabled={!editing} onClick={toggle('color')}>
          <Icon name="textColor" size={17} /><span className="doc-color-bar" style={{ background: state.color ?? '#000000' }} />
        </ToolButton>
        <ToolButton label="Highlight color" className="doc-tool-color" anchor disabled={!editing} onClick={toggle('highlight')}>
          <Icon name="highlighter" size={17} /><span className="doc-color-bar" style={{ background: state.highlight ?? 'transparent' }} />
        </ToolButton>
        {rule}
        <ToolButton label="Insert link" shortcut="Ctrl+K" icon="link" active={state.link} disabled={!editing} onClick={() => context.open('link')} />
        <ToolButton label="Add comment" shortcut="Ctrl+Alt+M" icon="comment" disabled={state.empty} onClick={context.addComment} />
        <ToolButton label="Insert image" className="doc-tool-select is-icon" anchor disabled={!editing} onClick={toggle('image')}><Icon name="image" size={18} /><Icon name="chevronDown" size={12} /></ToolButton>
        {rule}
        <ToolButton label="Align" className="doc-tool-select is-icon" anchor disabled={!editing} onClick={toggle('align')}><Icon name={alignIcon} size={18} /><Icon name="chevronDown" size={12} /></ToolButton>
        <ToolButton label="Line & paragraph spacing" icon="lineSpacing" anchor disabled={!editing} onClick={toggle('spacing')} />
        <ToolButton label="Checklist" shortcut="Ctrl+Shift+9" icon="listCheck" active={state.task} disabled={!editing} onClick={() => chain().toggleTaskList().run()} />
        <span className="doc-split">
          <ToolButton label="Bulleted list" shortcut="Ctrl+Shift+8" icon="listBullet" active={state.bullet} disabled={!editing} onClick={() => chain().toggleBulletList().run()} />
          <ToolButton label="Bullet styles" className="doc-split-arrow" anchor disabled={!editing} onClick={toggle('bullets')}><Icon name="chevronDown" size={12} /></ToolButton>
        </span>
        <span className="doc-split">
          <ToolButton label="Numbered list" shortcut="Ctrl+Shift+7" icon="listNumber" active={state.number} disabled={!editing} onClick={() => chain().toggleOrderedList().run()} />
          <ToolButton label="Number styles" className="doc-split-arrow" anchor disabled={!editing} onClick={toggle('numbers')}><Icon name="chevronDown" size={12} /></ToolButton>
        </span>
        <ToolButton label="Decrease indent" shortcut="Ctrl+[" icon="indentLess" disabled={!editing} onClick={() => chain().outdentBlock().run()} />
        <ToolButton label="Increase indent" shortcut="Ctrl+]" icon="indentMore" disabled={!editing} onClick={() => chain().indentBlock().run()} />
        <ToolButton label="Clear formatting" shortcut="Ctrl+\" icon="clearFormat" disabled={!editing} onClick={() => clearFormatting(editor)} />
      </div>
      <div className="doc-toolbar-end">
        <ToolButton label={`${modeInfo.name} mode`} className="doc-tool-select doc-mode" anchor onClick={toggle('mode')}>
          <Icon name={modeInfo.icon} size={17} />{!phone && <span>{modeInfo.name}</span>}<Icon name="chevronDown" size={14} />
        </ToolButton>
        {!phone && <ToolButton label={context.menusHidden ? 'Show the menus' : 'Hide the menus'} shortcut="Ctrl+Shift+F" icon={context.menusHidden ? 'chevronDown' : 'chevronUp'} onClick={context.toggleMenus} />}
      </div>

      {open?.key === 'zoom' && <MenuPanel entries={zoomEntries(context)} x={open.rect.left} y={open.rect.bottom + 4} onClose={close} label="Zoom" />}
      {open?.key === 'style' && <MenuPanel entries={styleEntries(editor)} x={open.rect.left} y={open.rect.bottom + 4} onClose={close} label="Styles" />}
      {open?.key === 'font' && (
        <MenuPanel x={open.rect.left} y={open.rect.bottom + 4} onClose={close} label="Font"
          entries={FONTS.map((f) => ({ label: f.name, checked: state.font === f.name, style: { fontFamily: f.stack, fontSize: '14px' }, run: () => setFont(editor, f.name) }))} />
      )}
      {open?.key === 'size' && (
        <Popover anchor={open.rect} onClose={close} label="Font size" className="doc-size-list">
          {FONT_SIZES.map((s) => (
            <button key={s} type="button" className={'doc-menu-item' + (s === state.size ? ' is-open' : '')}
              onMouseDown={(e) => e.preventDefault()} onClick={() => { setSizeDraft(null); setFontSize(editor, s); close(); }}>
              <span className="doc-menu-label">{s}</span>
            </button>
          ))}
        </Popover>
      )}
      {open?.key === 'color' && (
        <Popover anchor={open.rect} onClose={close} label="Text color">
          <Palette value={state.color} resetLabel="Reset" onPick={(hex) => { if (hex) chain().setColor(hex).run(); else chain().unsetColor().run(); close(); }} />
        </Popover>
      )}
      {open?.key === 'highlight' && (
        <Popover anchor={open.rect} onClose={close} label="Highlight color">
          <Palette value={state.highlight} resetLabel="None" onPick={(hex) => { if (hex) chain().setHighlight({ color: hex }).run(); else chain().unsetHighlight().run(); close(); }} />
        </Popover>
      )}
      {open?.key === 'image' && (
        <MenuPanel x={open.rect.left} y={open.rect.bottom + 4} onClose={close} label="Insert image" entries={[
          { label: 'Upload from computer', icon: 'upload', run: () => context.insertImage('upload') },
          { label: 'By URL', icon: 'link', run: () => context.insertImage('url') },
          { label: 'Camera', icon: 'camera', run: () => context.insertImage('camera') },
          'separator',
          { label: 'Drawing', icon: 'pen', run: context.insertDrawing },
        ]} />
      )}
      {open?.key === 'align' && (
        <Popover anchor={open.rect} onClose={close} label="Align" className="doc-align-row">
          {([['left', 'alignLeft', 'Left align', 'Ctrl+Shift+L'], ['center', 'alignCenter', 'Center align', 'Ctrl+Shift+E'], ['right', 'alignRight', 'Right align', 'Ctrl+Shift+R'], ['justify', 'alignJustify', 'Justify', 'Ctrl+Shift+J']] as const).map(([value, icon, label, shortcut]) => (
            <ToolButton key={value} label={label} shortcut={shortcut} icon={icon} active={state.align === value} onClick={() => { chain().setTextAlign(value).run(); close(); }} />
          ))}
        </Popover>
      )}
      {open?.key === 'spacing' && <MenuPanel entries={spacingEntries(editor)} x={open.rect.left} y={open.rect.bottom + 4} onClose={close} label="Line & paragraph spacing" />}
      {open?.key === 'bullets' && <MenuPanel entries={listEntries(editor, 'bullet')} x={open.rect.left} y={open.rect.bottom + 4} onClose={close} label="Bullet styles" />}
      {open?.key === 'numbers' && <MenuPanel entries={listEntries(editor, 'number')} x={open.rect.left} y={open.rect.bottom + 4} onClose={close} label="Number styles" />}
      {open?.key === 'mode' && (
        <MenuPanel x={open.rect.left} y={open.rect.bottom + 4} onClose={close} label="Mode"
          entries={MODES.map((m) => ({ label: `${m.name}: ${m.hint}`, icon: m.icon, checked: mode === m.id, run: () => context.setMode(m.id) }))} />
      )}
    </div>
  );
}
