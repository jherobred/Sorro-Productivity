'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { AsciiBar } from '@/components/AsciiBar';
import { jarPhoto, type JarRow } from '@/components/money/Jars';
import { colourOf } from '@/components/money/Instruments';
import { peso, type Txn } from '@/lib/money';
import { groupByLogDay, logDayLabel } from '@/lib/logday';
import { InlineForm, toCentavos, fromCentavos } from '@/components/MoneyRows';

/**
 * Inside a jar: what actually went through it.
 *
 * Grouped by lived day rather than calendar day, so a 01:20 tapsihan files
 * under the night it belonged to instead of opening a new heading for one row.
 * See lib/logday.ts — the same boundary drives today's spend and the burn
 * behind the runway, or the two would disagree at 2am.
 *
 * Rows the Lazy button created are marked rather than hidden. A stub with the
 * right number is worth keeping; pretending it is complete is not.
 */

export function JarPage({
  jar, txns, onBack, onEdit, onDelete, onArchive, onAdd,
}: {
  jar: JarRow;
  txns: Txn[];
  onBack: () => void;
  onEdit: (patch: { category: string; amount_centavos: number; photo_path: string | null }) => void;
  onDelete: (t: Txn) => void;
  onArchive: (t: Txn) => void;
  onAdd: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const over = jar.spent > jar.budget;
  const hue = over ? '#FF6B6B' : colourOf(jar.category);
  const photo = jarPhoto(jar.category, jar.photo_path);

  const days = useMemo(
    () => groupByLogDay(txns.filter((t) => t.category === jar.category), (t) => t.occurred_at),
    [txns, jar.category],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Mini onClick={onBack}>← Jars</Mini>
        <Mini onClick={() => setEditing((e) => !e)}>{editing ? 'Cancel' : 'Edit jar'}</Mini>
      </div>

      {editing ? (
        <div style={CARD}>
          <InlineForm
            fields={[
              { key: 'category', label: 'Name', kind: 'text' },
              { key: 'amount', label: 'Monthly limit', kind: 'money' },
              { key: 'photo', label: 'Photo URL — blank uses the stock one', kind: 'text' },
            ]}
            initial={{ category: jar.category, amount: fromCentavos(jar.budget), photo: jar.photo_path ?? '' }}
            submitLabel="Save jar"
            onCancel={() => setEditing(false)}
            onSubmit={(v) => {
              onEdit({
                category: v.category,
                amount_centavos: toCentavos(v.amount),
                photo_path: v.photo?.trim() || null,
              });
              setEditing(false);
            }}
          />
        </div>
      ) : (
        <div style={{
          position: 'relative', borderRadius: 13, overflow: 'hidden', minHeight: 96,
          background: 'var(--card2)', padding: 10, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        }}>
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" aria-hidden
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
          <span aria-hidden style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, rgba(11,10,19,.2), rgba(11,10,19,.92))',
          }} />
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ ...KICKER, color: hue }}>
              {over ? `${peso(jar.spent - jar.budget)} over` : `${peso(jar.budget - jar.spent)} left`}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.03em', marginTop: 2 }}>{jar.category}</div>
          </div>
        </div>
      )}

      <AsciiBar
        shape="jar"
        value={(jar.spent / Math.max(1, jar.budget)) * 100}
        hue={hue}
        text={`${peso(jar.spent)} spent`}
        rightText={peso(jar.budget)}
        label={`${jar.category} budget`}
      />

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: 1 }}>
        <div style={KICKER}>Logs</div>
        <span className="num" style={{ fontSize: 8.5, color: 'var(--tx3)' }}>DAY ENDS 04:00</span>
      </div>

      <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {days.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--tx3)', margin: 0 }}>Nothing logged to this jar yet.</p>
        )}
        {days.map(({ day, rows }) => (
          <div key={day}>
            <div style={{ ...KICKER, display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 2px' }}>
              {logDayLabel(day)}
              <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
              <span className="num" style={{ letterSpacing: 0 }}>
                {peso(rows.reduce((s, t) => s + Math.abs(t.amount_centavos), 0))}
              </span>
            </div>
            {rows.map((t) => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0',
                borderBottom: '1px solid var(--line)',
              }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {t.name || 'Untitled'}
                    {t.detailed === false && (
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 7, fontWeight: 700, letterSpacing: '.1em',
                        textTransform: 'uppercase', padding: '2px 4px', borderRadius: 3, flex: 'none',
                        background: 'color-mix(in srgb, #FFC24B 18%, transparent)', color: '#FFC24B',
                      }}>Lazy</span>
                    )}
                  </span>
                  <span className="num" style={{ fontSize: 9, color: 'var(--tx3)', marginTop: 2, display: 'block' }}>
                    {new Date(t.occurred_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    {t.place ? ` · ${t.place}` : ''}{t.who ? ` · ${t.who}` : ''}
                  </span>
                </span>
                <span className="num" style={{ fontSize: 12, fontWeight: 700 }}>{peso(Math.abs(t.amount_centavos))}</span>
                <Mini onClick={() => onArchive(t)}>Archive</Mini>
                <Mini danger onClick={() => onDelete(t)}>Remove</Mini>
              </div>
            ))}
          </div>
        ))}
      </div>

      <button onClick={onAdd} className="acc k-squish" style={{
        alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 9, background: 'var(--acc)',
        color: 'var(--ink)', fontSize: 12, fontWeight: 800, border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <Icon name="plus" size={13} color="var(--ink)" />Add to this jar
      </button>
    </div>
  );
}

const KICKER: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.13em',
  textTransform: 'uppercase', color: 'var(--tx3)',
};

const CARD: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 15, padding: '12px 14px',
};

function Mini({
  children, onClick, danger,
}: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className="hov" style={{
      border: `1px solid ${danger ? 'rgba(255,107,107,.4)' : 'var(--line2)'}`,
      background: 'var(--card2)', color: danger ? '#FF9B9B' : 'var(--tx2)', borderRadius: 6,
      fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '.05em',
      padding: '5px 7px', cursor: 'pointer', textTransform: 'uppercase', flex: 'none',
    }}>{children}</button>
  );
}
