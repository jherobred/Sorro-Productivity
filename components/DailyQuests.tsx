'use client';

import { useState } from 'react';
import { deriveDailyQuests, claimQuestReward, type Quest } from '@/lib/quests';
import { ymd, type Habit, type Tick } from '@/lib/habits';
import type { Task } from '@/lib/tasks';
import { Icon, type IconName } from './Icon';
import { playCelebration, playTick } from '@/lib/audio';
import { toast } from '@/lib/toast';

export function DailyQuests({
  tasks = [],
  habits = [],
  ticks = [],
  notesCount = 0,
  onRewardClaimed,
}: {
  tasks?: Task[];
  habits?: Habit[];
  ticks?: Tick[];
  notesCount?: number;
  onRewardClaimed?: (rp: number) => void;
}) {
  const todayStr = ymd(new Date());
  const [claimState, setClaimState] = useState<Record<string, boolean>>({});

  const quests = deriveDailyQuests({
    tasks,
    habits,
    ticks,
    notesUpdatedToday: notesCount,
  });

  const handleClaim = (q: Quest) => {
    claimQuestReward(todayStr, q.id, q.reward);
    setClaimState((prev) => ({ ...prev, [q.id]: true }));
    playCelebration();
    toast(`+${q.reward} RP claimed! Quest completed 🎉`);
    if (onRewardClaimed) onRewardClaimed(q.reward);
  };

  const totalRewards = quests.reduce((acc, q) => acc + (q.claimed || claimState[q.id] ? q.reward : 0), 0);

  return (
    <div
      style={{
        background: 'var(--card)',
        borderRadius: 16,
        padding: '16px 18px',
        boxShadow: 'var(--sh)',
        border: '1px solid var(--line)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: 'color-mix(in srgb, var(--pal-amber) 20%, transparent)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Icon name="trophy" size={14} color="var(--pal-amber)" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '-.01em' }}>Daily Quests</div>
            <div style={{ fontSize: 10, color: 'var(--tx3)' }}>Complete daily objectives for RP</div>
          </div>
        </div>

        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: 'var(--pal-amber)',
            background: 'color-mix(in srgb, var(--pal-amber) 12%, transparent)',
            padding: '3px 8px',
            borderRadius: 8,
          }}
        >
          +{totalRewards} RP Earned
        </div>
      </div>

      {/* Quest items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {quests.map((q) => {
          const isClaimed = q.claimed || claimState[q.id];
          const pct = Math.min(100, Math.round((q.current / q.target) * 100));

          return (
            <div
              key={q.id}
              style={{
                background: 'var(--card2)',
                borderRadius: 12,
                padding: '10px 12px',
                border: '1px solid var(--line)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  background: isClaimed
                    ? 'color-mix(in srgb, var(--pal-mint) 18%, var(--card))'
                    : 'var(--card)',
                  border: '1px solid var(--line)',
                  display: 'grid',
                  placeItems: 'center',
                  flex: 'none',
                }}
              >
                <Icon
                  name={isClaimed ? 'check' : (q.icon as IconName)}
                  size={15}
                  color={isClaimed ? 'var(--pal-mint)' : 'var(--tx2)'}
                />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: isClaimed ? 'var(--tx3)' : 'var(--tx)',
                      textDecoration: isClaimed ? 'line-through' : 'none',
                    }}
                  >
                    {q.title}
                  </span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--pal-amber)' }}>
                    +{q.reward} RP
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Progress bar */}
                  <div
                    style={{
                      flex: 1,
                      height: 5,
                      borderRadius: 3,
                      background: 'var(--line2)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        borderRadius: 3,
                        background: q.completed ? 'var(--pal-mint)' : 'var(--acc)',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
                    {q.current}/{q.target}
                  </span>
                </div>
              </div>

              {/* Action Button */}
              {q.completed && !isClaimed ? (
                <button
                  onClick={() => handleClaim(q)}
                  className="k-squish"
                  style={{
                    padding: '5px 10px',
                    borderRadius: 8,
                    background: 'var(--pal-amber)',
                    color: '#0A0912',
                    fontSize: 11,
                    fontWeight: 800,
                    flex: 'none',
                    boxShadow: '0 4px 12px -4px var(--pal-amber)',
                  }}
                >
                  Claim
                </button>
              ) : isClaimed ? (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--pal-mint)',
                    flex: 'none',
                    padding: '3px 6px',
                  }}
                >
                  Done ✓
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
