'use client';

import { useState } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { useOverlayBack } from '@/lib/nav';
import { toast } from '@/lib/toast';
import { playTick } from '@/lib/audio';
import { Trail, type Walker } from './Trail';
import { Mascot } from './Mascot';
import { moodOf } from '@/lib/mascot';
import { standings } from '@/lib/rank';
import { metricDef } from '@/lib/metrics';
import {
  daysLeft,
  phaseOf,
  payout,
  type Challenge,
  type Member,
  type Day,
} from '@/lib/challenges';
import { displayOf, type Person } from '@/lib/people';

export function ChallengeDetailModal({
  challenge,
  members = [],
  days = [],
  profiles = {},
  me,
  isOwner,
  onClose,
  onEdit,
  onDelete,
  onLeave,
  onBump,
  onSettle,
  onShareToFeed,
}: {
  challenge: Challenge;
  members: Member[];
  days: Day[];
  profiles: Record<string, Person>;
  me: string;
  isOwner: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onLeave: () => void;
  onBump: (progress: number) => void;
  onSettle: () => void;
  onShareToFeed: () => void;
}) {
  useOverlayBack(true, onClose);

  const def = metricDef(challenge.metric);
  const phase = phaseOf(challenge, members);
  const { rows, winner } = standings(members, challenge.rule, challenge.target);
  const myMember = members.find((m) => m.user_id === me || m.display_name === 'You');

  const [tab, setTab] = useState<'leaderboard' | 'trail' | 'activity'>('leaderboard');
  const [bumpValue, setBumpValue] = useState(myMember?.progress ?? 0);

  // Walkers for the animated trail
  const maxScore = Math.max(1, ...(challenge.target ? [challenge.target] : members.map((m) => m.progress)));
  const walkers: Walker[] = rows.slice(0, 8).map((r) => {
    const isMe = r.user_id === me || r.display_name === 'You';
    const name = isMe ? 'You' : displayOf(profiles, r.user_id, me).label;

    return {
      id: r.user_id,
      label: name,
      color: r.place === 1 ? challenge.color : '#6C7CF5',
      at: maxScore > 0 ? r.progress / maxScore : 0,
      score: r.progress,
      you: isMe,
      mood: moodOf({ daysSince: 0, leading: r.place === 1 }),
    };
  });

  const handleBump = () => {
    playTick();
    onBump(bumpValue);
    toast(`Progress updated to ${bumpValue} ${challenge.unit || 'points'}! 🔥`);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99,
        background: 'rgba(0,0,0,.65)',
        backdropFilter: 'blur(6px)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="k-bloom navsb"
        style={{
          width: 640,
          maxWidth: '100%',
          maxHeight: '88dvh',
          overflowY: 'auto',
          background: 'var(--card)',
          border: '1px solid var(--line2)',
          borderRadius: 22,
          padding: 22,
          boxShadow: 'var(--shl)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: `color-mix(in srgb, ${challenge.color} 22%, transparent)`,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name={(def.icon as IconName) || 'trophy'} size={22} color={challenge.color} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0, letterSpacing: '-.02em', color: 'var(--tx)' }}>
                  {challenge.name}
                </h2>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: phase === 'live' ? 'rgba(52,217,160,.16)' : 'var(--card2)',
                    color: phase === 'live' ? '#34D9A0' : 'var(--tx3)',
                    textTransform: 'uppercase',
                  }}
                >
                  {phase}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2 }}>
                {challenge.description || def.hint}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="hov k-squish"
            aria-label="Close"
            style={{ width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center' }}
          >
            <Icon name="close" size={14} color="var(--tx2)" />
          </button>
        </div>

        {/* 3 Overview Badges */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          <div style={{ background: 'var(--card2)', padding: '10px 12px', borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--accTx)' }}>
              {challenge.stake_rp ? `${challenge.stake_rp} RP Pot` : 'Friendly Match'}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', marginTop: 2 }}>STAKES</div>
          </div>
          <div style={{ background: 'var(--card2)', padding: '10px 12px', borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--tx)' }}>
              {challenge.target ? `${challenge.target} ${challenge.unit}` : 'Most wins'}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', marginTop: 2 }}>OBJECTIVE</div>
          </div>
          <div style={{ background: 'var(--card2)', padding: '10px 12px', borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--pal-amber)', fontVariantNumeric: 'tabular-nums' }}>
              {daysLeft(challenge)} Days
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', marginTop: 2 }}>TIME REMAINING</div>
          </div>
        </div>

        {/* Sub-tabs: Leaderboard vs Live Trail vs Activity */}
        <div style={{ display: 'flex', gap: 6, background: 'var(--card2)', padding: 3, borderRadius: 12, marginBottom: 16 }}>
          {(
            [
              { id: 'leaderboard', label: '🏆 Leaderboard', count: rows.length },
              { id: 'trail', label: '🏃 Live Trail', count: walkers.length },
              { id: 'activity', label: '⚡ Activity & Rules' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="k-squish"
              style={{
                flex: 1,
                padding: '7px',
                borderRadius: 9,
                fontSize: 12,
                fontWeight: 700,
                border: 'none',
                background: tab === t.id ? 'var(--card)' : 'transparent',
                color: tab === t.id ? 'var(--tx)' : 'var(--tx3)',
                boxShadow: tab === t.id ? 'var(--sh)' : 'none',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab 1: Leaderboard Standings */}
        {tab === 'leaderboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {rows.map((r) => {
              const isMe = r.user_id === me || r.display_name === 'You';
              const name = isMe ? 'You' : displayOf(profiles, r.user_id, me).label;
              const rpDelta = payout(challenge, r.place, rows.length);

              return (
                <div
                  key={r.user_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 14,
                    background: isMe ? 'color-mix(in srgb, var(--acc) 14%, var(--card2))' : 'var(--card2)',
                    border: isMe ? '1px solid var(--acc)' : '1px solid var(--line)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: r.place === 1 ? '#FFC24B' : r.place === 2 ? '#B0B0B0' : r.place === 3 ? '#CD7F32' : 'var(--card)',
                        color: r.place <= 3 ? '#0C0F16' : 'var(--tx3)',
                        fontSize: 11,
                        fontWeight: 900,
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      {r.place}
                    </span>

                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx)' }}>
                        {name} {isMe && <span style={{ color: 'var(--accTx)' }}>(You)</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                        {r.progress} {challenge.unit || 'pts'}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: rpDelta > 0 ? '#52C41A' : rpDelta < 0 ? '#FF4D4F' : 'var(--tx3)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {rpDelta > 0 ? `+${rpDelta} RP` : rpDelta < 0 ? `${rpDelta} RP` : '0 RP'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--tx3)' }}>Projected Rank</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 2: Animated Live Trail */}
        {tab === 'trail' && (
          <div style={{ marginBottom: 16 }}>
            <Trail walkers={walkers} unit={challenge.unit || def.unit} target={challenge.target} />
          </div>
        )}

        {/* Tab 3: Activity & Rules */}
        {tab === 'activity' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            <div style={{ background: 'var(--card2)', padding: 14, borderRadius: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--tx)', marginBottom: 4 }}>
                Scoring Rule: {challenge.rule === 'first_to' ? 'First to Target' : challenge.rule === 'streak' ? 'Longest Unbroken Streak' : 'Most Total Points'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.5 }}>
                {def.hint}. Auto-synced from your local app tables.
              </div>
            </div>

            {challenge.metric === 'manual' && myMember && (
              <div style={{ background: 'var(--card2)', padding: 14, borderRadius: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--tx)', marginBottom: 6 }}>
                  Update Manual Progress
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="number"
                    value={bumpValue}
                    onChange={(e) => setBumpValue(Number(e.target.value) || 0)}
                    style={{
                      width: 100,
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: '1px solid var(--line2)',
                      background: 'var(--card)',
                      fontSize: 13,
                      fontWeight: 800,
                      color: 'var(--tx)',
                    }}
                  />
                  <button
                    onClick={handleBump}
                    className="acc k-squish"
                    style={{
                      padding: '8px 16px',
                      borderRadius: 10,
                      background: 'var(--acc)',
                      color: 'var(--ink)',
                      fontSize: 12,
                      fontWeight: 800,
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Save Progress
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons Footer */}
        <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 14, flexWrap: 'wrap' }}>
          <button
            onClick={onShareToFeed}
            className="acc k-squish"
            style={{
              padding: '9px 16px',
              borderRadius: 12,
              background: 'var(--acc)',
              color: 'var(--ink)',
              fontSize: 12.5,
              fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name="upload" size={14} color="var(--ink)" />
            Share to Feed
          </button>

          {isOwner && (
            <>
              <button
                onClick={() => {
                  onClose();
                  onEdit();
                }}
                className="hov k-squish"
                style={{
                  padding: '9px 14px',
                  borderRadius: 12,
                  border: '1px solid var(--line2)',
                  background: 'var(--card2)',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--tx)',
                  cursor: 'pointer',
                }}
              >
                Edit
              </button>
              <button
                onClick={() => {
                  onClose();
                  onSettle();
                }}
                className="hov k-squish"
                style={{
                  padding: '9px 14px',
                  borderRadius: 12,
                  border: '1px solid var(--line2)',
                  background: 'var(--card2)',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--pal-amber)',
                  cursor: 'pointer',
                }}
              >
                Settle Up
              </button>
              <button
                onClick={() => {
                  onClose();
                  onDelete();
                }}
                className="hov k-squish"
                style={{
                  padding: '9px 14px',
                  borderRadius: 12,
                  border: '1px solid var(--line2)',
                  background: 'var(--card2)',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#FF4D4F',
                  cursor: 'pointer',
                  marginLeft: 'auto',
                }}
              >
                Delete
              </button>
            </>
          )}

          {!isOwner && myMember && (
            <button
              onClick={() => {
                onClose();
                onLeave();
              }}
              className="hov k-squish"
              style={{
                padding: '9px 14px',
                borderRadius: 12,
                border: '1px solid var(--line2)',
                background: 'var(--card2)',
                fontSize: 12,
                fontWeight: 700,
                color: '#FF4D4F',
                cursor: 'pointer',
                marginLeft: 'auto',
              }}
            >
              Leave Challenge
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
