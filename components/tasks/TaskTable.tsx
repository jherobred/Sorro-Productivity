'use client';

import { useMemo, useState } from 'react';
import { Icon } from '../Icon';
import { PAL } from '@/lib/pal';
import type { Task } from '@/lib/tasks';

/**
 * Tasks as a spreadsheet.
 *
 * The grouped view answers "what should I do next" — three buckets, big rows,
 * one thing at a time. It is the wrong shape for "which of these forty is on
 * the wrong list", which is a question about columns. This is that shape: one
 * line per task, every field in its own column, and a header you can sort by.
 *
 * Deliberately not the swipeable row from the grouped view. A dense table with
 * swipe actions on every line is a table you cannot scroll on a phone without
 * setting something off.
 */

export type TableRow = {
  task: Task;
  listName: string;
  listColor: string;
  late: number;
  dueLabel: string;
  pri: 'High' | 'Med' | 'Low';
};

export type SortKey = 'title' | 'list' | 'due' | 'pri' | 'stars';

const PRI_RANK: Record<TableRow['pri'], number> = { High: 3, Med: 2, Low: 1 };
const PRI_COL: Record<TableRow['pri'], string> = { High: PAL.coral, Med: PAL.amber, Low: 'var(--tx3)' };

const HEAD: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: 'var(--tx3)', letterSpacing: '.06em',
  textTransform: 'uppercase', textAlign: 'left', padding: '9px 10px', whiteSpace: 'nowrap',
  position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1,
};

const CELL: React.CSSProperties = { padding: '9px 10px', fontSize: 12.5, color: 'var(--tx2)' };

export function TaskTable({
  rows, phone, onOpen, onCheck,
}: {
  rows: TableRow[];
  phone: boolean;
  onOpen: (t: Task) => void;
  onCheck: (t: Task) => void;
}) {
  const [key, setKey] = useState<SortKey>('due');
  const [desc, setDesc] = useState(false);

  const sorted = useMemo(() => {
    const dir = desc ? -1 : 1;
    return [...rows].sort((a, b) => dir * (
      key === 'title' ? a.task.title.localeCompare(b.task.title)
        : key === 'list' ? a.listName.localeCompare(b.listName)
          : key === 'pri' ? PRI_RANK[b.pri] - PRI_RANK[a.pri]
            : key === 'stars' ? b.task.stars - a.task.stars
              : (a.task.due_on ?? '9999').localeCompare(b.task.due_on ?? '9999')
    ));
  }, [rows, key, desc]);

  const Th = ({ k, label, w }: { k: SortKey; label: string; w?: number }) => (
    <th style={{ ...HEAD, width: w }} aria-sort={key === k ? (desc ? 'descending' : 'ascending') : 'none'}>
      <button
        onClick={() => { if (key === k) setDesc((v) => !v); else { setKey(k); setDesc(false); } }}
        className="hov"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 4px', borderRadius: 5,
          font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit',
          color: key === k ? 'var(--tx)' : 'var(--tx3)',
        }}>
        {label}
        {key === k && (
          <Icon name="chev" size={11} color="var(--tx2)"
            style={{ transform: desc ? 'rotate(-90deg)' : 'rotate(90deg)' }} />
        )}
      </button>
    </th>
  );

  if (rows.length === 0) {
    return (
      <div style={{
        marginTop: 14, padding: '30px 14px', borderRadius: 16, textAlign: 'center',
        background: 'var(--card)', border: '1px solid var(--line)',
      }}>
        <div className="metaline">Nothing open. Everything on this list is done.</div>
      </div>
    );
  }

  return (
    <div className="navsb" style={{
      marginTop: 14, background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--sh)',
      border: '1px solid var(--line)', overflow: 'auto', minHeight: 0,
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: phone ? 520 : undefined }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--line)' }}>
            <th style={{ ...HEAD, width: 38 }} aria-label="Done" />
            <Th k="title" label="Task" />
            <Th k="list" label="List" w={130} />
            <Th k="due" label="Due" w={110} />
            <Th k="pri" label="Priority" w={92} />
            {!phone && <Th k="stars" label="Stars" w={86} />}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.task.id} className="hov"
              style={{ borderBottom: '1px solid var(--line)', cursor: 'pointer' }}
              onClick={() => onOpen(r.task)}>
              <td style={{ ...CELL, paddingRight: 0 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); onCheck(r.task); }}
                  aria-label={`Complete ${r.task.title}`}
                  style={{
                    width: 17, height: 17, borderRadius: '50%', display: 'grid', placeItems: 'center',
                    border: `1.8px solid ${PRI_COL[r.pri]}`,
                  }} />
              </td>
              <td style={{ ...CELL, color: 'var(--tx)', fontWeight: 600 }}>
                <span style={{ display: 'block', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.task.title}
                </span>
              </td>
              <td style={CELL}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, flex: 'none', background: r.listColor }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.listName}</span>
                </span>
              </td>
              <td style={{ ...CELL, color: r.late > 0 ? PAL.coral : 'var(--tx2)' }} className="num">
                {r.task.due_on ? r.dueLabel : '—'}
              </td>
              <td style={CELL}>
                <span style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 700,
                  color: PRI_COL[r.pri],
                  border: `1px solid color-mix(in srgb, ${PRI_COL[r.pri]} 40%, transparent)`,
                  background: `color-mix(in srgb, ${PRI_COL[r.pri]} 12%, transparent)`,
                }}>{r.pri}</span>
              </td>
              {!phone && (
                <td style={CELL} className="num">
                  {r.task.stars > 0
                    ? <span style={{ color: PAL.amber }}>{'★'.repeat(Math.min(5, r.task.stars))}</span>
                    : <span style={{ color: 'var(--tx3)' }}>—</span>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
