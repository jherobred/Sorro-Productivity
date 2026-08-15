'use client';

import { useMemo, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { usePrefs } from '@/lib/prefs';
import { useOverlayBack } from '@/lib/nav';
import { toast } from '@/lib/toast';
import { useHabits } from '@/lib/habits';
import { rankOf, standings, rpFor, TIERS, METRICS, RULES, type MetricId, type RuleId } from '@/lib/rank';
import {
  useChallenges, useMembers, useRanked, useChallengeActions, phaseOf, daysLeft,
  type Challenge, type Member,
} from '@/lib/challenges';

/**
 * Community → Challenges: accountability as a competitive mode.
 *
 * A challenge names a metric the app already tracks (a habit, tasks, project
 * progress, gym days, study hours), a rule for deciding it (most, first to a
 * target, longest streak) and a window. Everyone in it accrues progress; when
 * it settles, places convert to rank points on a Marvel-Rivals-shaped ladder.
 */

const CARD: React.CSSProperties = { background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--sh)', border: '1px solid var(--line)' };
const KICKER: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)' };

const ME = 'me';   // stands in for the signed-in id in the preview fixtures

export function Challenges() {
  const { prefs } = usePrefs();
  const { data: challenges = [] } = useChallenges();
  const { data: members = [] } = useMembers();
  const { data: ranked } = useRanked();
  const A = useChallengeActions();
  const [composing, setComposing] = useState(false);
  const [filter, setFilter] = useState<'live' | 'upcoming' | 'over'>('live');

  const byChallenge = useMemo(() => {
    const m = new Map<string, Member[]>();
    for (const x of members) m.set(x.challenge_id, [...(m.get(x.challenge_id) ?? []), x]);
    return m;
  }, [members]);

  const shown = challenges.filter((c) => phaseOf(c, byChallenge.get(c.id) ?? []) === filter);
  const counts = {
    live: challenges.filter((c) => phaseOf(c, byChallenge.get(c.id) ?? []) === 'live').length,
    upcoming: challenges.filter((c) => phaseOf(c, byChallenge.get(c.id) ?? []) === 'upcoming').length,
    over: challenges.filter((c) => phaseOf(c, byChallenge.get(c.id) ?? []) === 'over').length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <RankCard ranked={ranked} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        {(['live', 'upcoming', 'over'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className="k-chip" aria-pressed={filter === f}
            style={{
              padding: '7px 14px', borderRadius: 999, minHeight: 36, fontSize: 11.5, fontWeight: 700,
              border: `1px solid ${filter === f ? 'var(--acc)' : 'var(--line2)'}`,
              background: filter === f ? 'color-mix(in srgb, var(--acc) 16%, transparent)' : 'transparent',
              color: filter === f ? 'var(--accTx)' : 'var(--tx2)',
            }}>
            {f[0].toUpperCase() + f.slice(1)} <span style={{ opacity: .65 }}>{counts[f]}</span>
          </button>
        ))}

        <button onClick={() => setComposing(true)} className="k-squish"
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px',
            borderRadius: 11, background: 'var(--acc)', color: 'var(--ink)', fontSize: 12, fontWeight: 800, minHeight: 38,
          }}>
          <Icon name="plus" size={14} color="var(--ink)" />New challenge
        </button>
      </div>

      {shown.length === 0 && (
        <div style={{ ...CARD, padding: '34px 20px', textAlign: 'center', fontSize: 12.5, color: 'var(--tx3)', lineHeight: 1.7 }}>
          {filter === 'live' ? 'Nothing running. Start one and drag a friend in.' : `No ${filter} challenges.`}
        </div>
      )}

      <div className="k-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12, alignItems: 'start' }}>
        {shown.map((c, i) => (
          <div key={c.id} style={{ '--i': i } as React.CSSProperties}>
            <ChallengeCard challenge={c} members={byChallenge.get(c.id) ?? []} A={A} accent={prefs.accent} />
          </div>
        ))}
      </div>

      {composing && <Composer onClose={() => setComposing(false)} onCreate={(c) => { A.create.mutate(c); setComposing(false); toast(`${c.name} created`); }} />}
    </div>
  );
}

/* ------------------------------------------------------------ rank badge */

function RankCard({ ranked }: { ranked?: { rp: number; peak_rp: number; wins: number; losses: number; season: string } }) {
  const r = rankOf(ranked?.rp ?? 0);
  const games = (ranked?.wins ?? 0) + (ranked?.losses ?? 0);

  return (
    <div style={{ ...CARD, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
      {/* tier wash */}
      <span aria-hidden className="aur" style={{
        position: 'absolute', right: '-8%', top: '-40%', width: '44%', height: '180%', borderRadius: '50%',
        background: `radial-gradient(circle, color-mix(in srgb, ${r.tier.hue} 30%, transparent) 0%, transparent 70%)`,
        filter: 'blur(30px)', pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
        <span className="glowring" style={{
          width: 52, height: 52, flex: 'none', borderRadius: 15, display: 'grid', placeItems: 'center',
          background: `color-mix(in srgb, ${r.tier.hue} 20%, var(--card2))`,
          border: `1.5px solid color-mix(in srgb, ${r.tier.hue} 55%, transparent)`,
          ['--gl2' as string]: `color-mix(in srgb, ${r.tier.hue} 45%, transparent)`,
        }}>
          <Icon name="trophy" size={24} color={r.tier.hue} />
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...KICKER, marginBottom: 2 }}>Season {ranked?.season ?? 's1'}</div>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.024em', color: r.tier.hue }}>{r.label}</div>
          <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 3 }}>
            {r.rp} RP{r.toNext !== null ? ` · ${r.toNext} to promote` : ' · nothing above this'}
            {games > 0 && ` · ${ranked?.wins}W ${ranked?.losses}L`}
          </div>
        </div>

        <div style={{ textAlign: 'right', flex: 'none' }}>
          <div style={{ ...KICKER, marginBottom: 2 }}>Peak</div>
          <div style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{ranked?.peak_rp ?? 0}</div>
        </div>
      </div>

      <div style={{ marginTop: 12, height: 7, borderRadius: 4, background: 'var(--card2)', overflow: 'hidden', position: 'relative' }}>
        <div className="k-progress" style={{
          height: '100%', width: `${Math.round(r.progress * 100)}%`, borderRadius: 4,
          background: `linear-gradient(90deg, color-mix(in srgb, ${r.tier.hue} 60%, transparent), ${r.tier.hue})`,
        }} />
      </div>

      {/* the whole ladder, so the next rung is always visible */}
      <div className="hbar" style={{ display: 'flex', gap: 4, marginTop: 10, overflowX: 'auto', paddingBottom: 2 }}>
        {TIERS.map((t) => {
          const reached = (ranked?.rp ?? 0) >= t.from;
          const current = t.name === r.tier.name;
          return (
            <span key={t.name} title={`${t.name} — ${t.from} RP`} style={{
              flex: 'none', padding: '3px 9px', borderRadius: 7, fontSize: 9.5, fontWeight: 800, whiteSpace: 'nowrap',
              background: current ? `color-mix(in srgb, ${t.hue} 24%, transparent)` : 'transparent',
              border: `1px solid ${current ? t.hue : 'var(--line)'}`,
              color: reached ? t.hue : 'var(--tx3)', opacity: reached ? 1 : 0.45,
            }}>
              {t.name}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- one challenge */

function ChallengeCard({ challenge: c, members, A, accent }: {
  challenge: Challenge; members: Member[]; A: ReturnType<typeof useChallengeActions>; accent: string;
}) {
  const phase = phaseOf(c, members);
  const { rows, winner } = standings(members, c.rule, c.target);
  const mine = members.find((m) => m.user_id === ME || m.display_name === 'You');
  const joined = !!mine;
  const leader = rows[0];
  const metric = METRICS.find((m) => m.id === c.metric);
  const rule = RULES.find((r) => r.id === c.rule);
  const max = Math.max(c.target ?? 0, ...rows.map((r) => r.progress), 1);
  const left = daysLeft(c);

  return (
    <div style={{ ...CARD, padding: '14px 15px 15px', borderColor: phase === 'live' ? `color-mix(in srgb, ${c.color} 34%, transparent)` : 'var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, marginBottom: 11 }}>
        <span style={{
          width: 34, height: 34, flex: 'none', borderRadius: 11, display: 'grid', placeItems: 'center',
          background: `color-mix(in srgb, ${c.color} 20%, transparent)`,
        }}>
          <Icon name={(metric?.icon ?? 'trophy') as IconName} size={16} color={c.color} />
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: '-.015em', overflowWrap: 'anywhere' }}>{c.name}</div>
          <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 2 }}>
            {rule?.label}
            {c.target != null && c.rule === 'first_to' && ` ${c.target} ${c.unit}`}
            {' · '}
            {phase === 'live' ? `${left} day${left === 1 ? '' : 's'} left` : phase === 'upcoming' ? `starts ${c.starts_on}` : 'finished'}
            {c.ranked && ' · ranked'}
          </div>
        </div>

        <JoinButton phase={phase} joined={joined} color={c.color}
          onJoin={() => A.join.mutate({ challenge_id: c.id }, { onSuccess: () => toast(`Joined ${c.name}`) })}
          onLeave={() => A.leave.mutate({ challenge_id: c.id }, { onSuccess: () => toast(`Left ${c.name}`) })} />
      </div>

      {c.description && (
        <p style={{ fontSize: 11.5, color: 'var(--tx2)', lineHeight: 1.55, marginBottom: 11 }}>{c.description}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {rows.slice(0, 6).map((m) => {
          const you = m.user_id === ME || m.display_name === 'You';
          return (
            <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{
                width: 22, flex: 'none', fontSize: 10, fontWeight: 800, textAlign: 'right',
                color: m.place === 1 ? c.color : 'var(--tx3)', fontVariantNumeric: 'tabular-nums',
              }}>
                #{m.place}
              </span>
              <span style={{
                width: 62, flex: 'none', fontSize: 11.5, fontWeight: you ? 800 : 600,
                color: you ? 'var(--accTx)' : 'var(--tx2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {m.display_name ?? 'You'}
              </span>
              <span style={{ flex: 1, minWidth: 0, height: 8, borderRadius: 4, background: 'var(--card2)', overflow: 'hidden' }}>
                <span className="k-progress" style={{
                  display: 'block', height: '100%', borderRadius: 4,
                  width: `${Math.min(100, (m.progress / max) * 100)}%`,
                  background: m.place === 1 ? c.color : `color-mix(in srgb, ${c.color} 55%, transparent)`,
                }} />
              </span>
              <span style={{ width: 26, flex: 'none', fontSize: 11.5, fontWeight: 800, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {m.progress}
              </span>
            </div>
          );
        })}
        {rows.length === 0 && <p style={{ fontSize: 11.5, color: 'var(--tx3)' }}>Nobody has joined yet.</p>}
      </div>

      {c.target != null && (
        <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 9, textAlign: 'right' }}>
          Target {c.target} {c.unit}
        </div>
      )}

      {/* Logging is manual here because the metric sources are per-user and
          private; the counters the app already keeps drive the suggestion. */}
      {phase === 'live' && joined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, paddingTop: 11, borderTop: '1px solid var(--line)' }}>
          <span style={{ fontSize: 10.5, color: 'var(--tx3)', flex: 1 }}>
            {metric?.hint}
          </span>
          <button
            onClick={() => A.bump.mutate({ challenge_id: c.id, progress: Math.max(0, (mine?.progress ?? 0) - 1) })}
            className="hov k-squish" aria-label="Log one less" style={STEP}>
            <Icon name="minus" size={13} color="var(--tx2)" />
          </button>
          <button
            onClick={() => {
              A.bump.mutate({ challenge_id: c.id, progress: (mine?.progress ?? 0) + 1 });
              if (c.rule === 'first_to' && c.target != null && (mine?.progress ?? 0) + 1 >= c.target) {
                toast(`You hit ${c.target} ${c.unit} — that takes it`);
              }
            }}
            className="k-squish" aria-label="Log one more"
            style={{ ...STEP, background: accent, border: 0 }}>
            <Icon name="plus" size={13} color="var(--ink)" />
          </button>
        </div>
      )}

      {phase === 'over' && !c.settled_at && rows.length > 0 && (
        <button onClick={() => A.finish(c, members)} className="k-squish"
          style={{
            width: '100%', marginTop: 12, minHeight: 40, borderRadius: 11,
            background: `color-mix(in srgb, ${c.color} 20%, transparent)`,
            border: `1px solid color-mix(in srgb, ${c.color} 45%, transparent)`,
            fontSize: 12, fontWeight: 800, color: c.color,
          }}>
          Settle and award RP
        </button>
      )}

      {c.settled_at && (
        <div style={{ marginTop: 12, paddingTop: 11, borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="trophy" size={14} color={c.color} />
          <span style={{ fontSize: 11.5, fontWeight: 700 }}>
            {rows.find((r) => r.user_id === c.winner_id)?.display_name ?? leader?.display_name ?? '—'} took it
          </span>
          {mine && (
            <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: (mine.rp_delta ?? 0) >= 0 ? 'var(--pal-mint)' : 'var(--pal-coral)' }}>
              {(mine.rp_delta ?? 0) >= 0 ? '+' : ''}{mine.rp_delta ?? 0} RP
            </span>
          )}
        </div>
      )}

      {winner && !c.settled_at && (
        <p style={{ fontSize: 10.5, color: c.color, marginTop: 9, fontWeight: 700 }}>
          {winner.display_name ?? 'You'} reached {c.target} — settle it to bank the points.
        </p>
      )}
    </div>
  );
}

const STEP: React.CSSProperties = {
  width: 34, height: 34, flex: 'none', borderRadius: 10, border: '1px solid var(--line2)',
  display: 'grid', placeItems: 'center',
};

function JoinButton({ phase, joined, color, onJoin, onLeave }: {
  phase: string; joined: boolean; color: string; onJoin: () => void; onLeave: () => void;
}) {
  if (phase === 'over') {
    return <span style={{ ...PILL, color: 'var(--tx3)', border: '1px solid var(--line2)' }}>Closed</span>;
  }
  return (
    <button onClick={joined ? onLeave : onJoin} className="k-chip k-squish"
      aria-pressed={joined}
      style={{
        ...PILL,
        background: joined ? `color-mix(in srgb, ${color} 20%, transparent)` : color,
        color: joined ? color : 'var(--ink)',
        border: joined ? `1px solid color-mix(in srgb, ${color} 50%, transparent)` : 'none',
      }}>
      {joined ? 'Joined' : 'Join'}
    </button>
  );
}

const PILL: React.CSSProperties = {
  flex: 'none', padding: '6px 14px', borderRadius: 9, fontSize: 11.5, fontWeight: 800, minHeight: 32,
};

/* ------------------------------------------------------------- composer */

function Composer({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (c: Partial<Challenge> & { id: string; name: string }) => void;
}) {
  const { prefs } = usePrefs();
  const { data: habits = [] } = useHabits();
  useOverlayBack(true, onClose);

  const today = new Date().toISOString().slice(0, 10);
  const inTwoWeeks = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [metric, setMetric] = useState<MetricId>('habit');
  const [habitId, setHabitId] = useState<string>('');
  const [rule, setRule] = useState<RuleId>('most');
  const [target, setTarget] = useState('14');
  const [starts, setStarts] = useState(today);
  const [ends, setEnds] = useState(inTwoWeeks);
  const [visibility, setVisibility] = useState<'public' | 'invite'>('public');
  const [ranked, setRanked] = useState(true);
  const [color, setColor] = useState(prefs.accent);

  const unit = METRICS.find((m) => m.id === metric)?.unit ?? 'times';
  const swatches = ['#7C6CFF', '#FF6B6B', '#FFC24B', '#34D9A0', '#38D6F2', '#FF6FA8', '#B07CFF'];
  const valid = name.trim().length > 1 && ends >= starts && (rule !== 'first_to' || Number(target) > 0);

  const submit = () => {
    if (!valid) return;
    onCreate({
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description.trim(),
      metric, rule, unit, color, visibility, ranked,
      habit_label: habits.find((h) => h.id === habitId)?.name ?? METRICS.find((m) => m.id === metric)?.label ?? '',
      target: rule === 'first_to' ? Number(target) : null,
      starts_on: starts,
      ends_on: ends,
      join_code: visibility === 'invite' ? Math.random().toString(36).slice(2, 8).toUpperCase() : null,
    });
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="New challenge" className="k-bloom navsb"
        style={{ ...CARD, width: 560, maxWidth: '100%', maxHeight: '88dvh', overflowY: 'auto', padding: 20 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 4 }}>New challenge</h2>
        <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginBottom: 16, lineHeight: 1.6 }}>
          Pick something the app already counts, decide how it is won, and set a window.
        </p>

        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="6 a.m. club" style={INPUT} autoFocus />
        </Field>

        <Field label="What it is" hint="Optional — the pitch that makes people join.">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            placeholder="Wake before six. Photo of the clock or it did not happen."
            style={{ ...INPUT, resize: 'vertical', minHeight: 62 }} />
        </Field>

        <Field label="What counts">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {METRICS.map((m) => (
              <button key={m.id} onClick={() => setMetric(m.id)} aria-pressed={metric === m.id} className="k-chip"
                title={m.hint}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 10, minHeight: 38,
                  fontSize: 11.5, fontWeight: 700,
                  border: `1px solid ${metric === m.id ? 'var(--acc)' : 'var(--line2)'}`,
                  background: metric === m.id ? 'color-mix(in srgb, var(--acc) 14%, transparent)' : 'transparent',
                  color: metric === m.id ? 'var(--accTx)' : 'var(--tx2)',
                }}>
                <Icon name={m.icon as IconName} size={13} color={metric === m.id ? 'var(--accTx)' : 'var(--tx3)'} />
                {m.label}
              </button>
            ))}
          </div>
          {metric === 'habit' && habits.length > 0 && (
            <select value={habitId} onChange={(e) => setHabitId(e.target.value)} aria-label="Which habit"
              style={{ ...INPUT, marginTop: 8 }}>
              <option value="">Any habit</option>
              {habits.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          )}
        </Field>

        <Field label="How it is won">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {RULES.map((r) => (
              <button key={r.id} onClick={() => setRule(r.id)} aria-pressed={rule === r.id} className="row"
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 11, textAlign: 'left', minHeight: 48,
                  border: `1px solid ${rule === r.id ? 'var(--acc)' : 'var(--line)'}`,
                  background: rule === r.id ? 'color-mix(in srgb, var(--acc) 10%, transparent)' : 'transparent',
                }}>
                <span aria-hidden style={{
                  width: 15, height: 15, flex: 'none', borderRadius: 8,
                  border: `1.5px solid ${rule === r.id ? 'var(--acc)' : 'var(--line2)'}`,
                  background: rule === r.id ? 'var(--acc)' : 'transparent',
                }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700 }}>{r.label}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'var(--tx3)', marginTop: 1 }}>{r.hint}</span>
                </span>
              </button>
            ))}
          </div>
          {rule === 'first_to' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 9 }}>
              <input type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)}
                aria-label="Target" style={{ ...INPUT, width: 110 }} />
              <span style={{ fontSize: 12, color: 'var(--tx2)', fontWeight: 600 }}>{unit} to win</span>
            </div>
          )}
        </Field>

        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Starts"><input type="date" value={starts} onChange={(e) => setStarts(e.target.value)} style={INPUT} /></Field>
          <Field label="Ends"><input type="date" value={ends} min={starts} onChange={(e) => setEnds(e.target.value)} style={INPUT} /></Field>
        </div>

        <Field label="Who can join">
          <div style={{ display: 'flex', gap: 7 }}>
            {([['public', 'Anyone'], ['invite', 'Invite code only']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setVisibility(v)} aria-pressed={visibility === v} className="k-chip"
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 10, minHeight: 40, fontSize: 11.5, fontWeight: 700,
                  border: `1px solid ${visibility === v ? 'var(--acc)' : 'var(--line2)'}`,
                  background: visibility === v ? 'color-mix(in srgb, var(--acc) 14%, transparent)' : 'transparent',
                  color: visibility === v ? 'var(--accTx)' : 'var(--tx2)',
                }}>
                {label}
              </button>
            ))}
          </div>
        </Field>

        <button onClick={() => setRanked((v) => !v)} role="switch" aria-checked={ranked} className="row"
          style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '11px 12px', borderRadius: 11, textAlign: 'left', minHeight: 52, marginBottom: 14 }}>
          <Icon name="trophy" size={15} color={ranked ? 'var(--accTx)' : 'var(--tx3)'} />
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700 }}>Ranked</span>
            <span style={{ display: 'block', fontSize: 10.5, color: 'var(--tx3)', marginTop: 2 }}>
              Places pay rank points. Turn off for a friendly run.
            </span>
          </span>
          <span aria-hidden style={{
            width: 42, height: 24, flex: 'none', borderRadius: 12, padding: 3,
            background: ranked ? 'var(--acc)' : 'var(--card2)',
            border: `1px solid ${ranked ? 'var(--acc)' : 'var(--line2)'}`,
            transition: 'background .3s var(--k-expo)',
          }}>
            <span style={{
              display: 'block', width: 16, height: 16, borderRadius: 8,
              background: ranked ? 'var(--ink)' : 'var(--tx3)',
              transform: ranked ? 'translateX(18px)' : 'none',
              transition: 'transform .4s var(--k-spring)',
            }} />
          </span>
        </button>

        <Field label="Colour">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {swatches.map((c) => (
              <button key={c} onClick={() => setColor(c)} aria-label={`Colour ${c}`} aria-pressed={color === c}
                className={`k-swatch${color === c ? ' on' : ''}`}
                style={{ width: 28, height: 28, borderRadius: 9, background: c, boxShadow: color === c ? `0 0 0 2px var(--card), 0 0 0 4px ${c}` : 'none' }} />
            ))}
          </div>
        </Field>

        {ranked && (
          <p style={{ fontSize: 10.5, color: 'var(--tx3)', lineHeight: 1.6, marginBottom: 14 }}>
            With a field of six, first place is worth {rpFor(1, 6)} RP, a top-third finish {rpFor(2, 6)},
            and simply taking part {rpFor(6, 6)}.
          </p>
        )}

        <div style={{ display: 'flex', gap: 9 }}>
          <button onClick={onClose} className="hov k-squish"
            style={{ flex: 1, minHeight: 44, borderRadius: 12, border: '1px solid var(--line2)', fontSize: 13, fontWeight: 700, color: 'var(--tx2)' }}>
            Cancel
          </button>
          <button onClick={submit} disabled={!valid} className="k-squish"
            style={{ flex: 1, minHeight: 44, borderRadius: 12, background: 'var(--acc)', color: 'var(--ink)', fontSize: 13, fontWeight: 800, opacity: valid ? 1 : 0.45 }}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14, flex: 1, minWidth: 0 }}>
      <div style={{ ...KICKER, marginBottom: 6 }}>{label}</div>
      {hint && <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginBottom: 6 }}>{hint}</div>}
      {children}
    </div>
  );
}

const INPUT: React.CSSProperties = {
  width: '100%', minHeight: 42, padding: '10px 12px', borderRadius: 10,
  border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--tx)',
  fontSize: 12.5, fontFamily: 'inherit',
};
