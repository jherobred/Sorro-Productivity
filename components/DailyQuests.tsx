'use client';

import { useState, useEffect } from 'react';
import { deriveDailyQuests, claimQuestReward, type Quest } from '@/lib/quests';
import { ymd, type Habit, type Tick } from '@/lib/habits';
import type { Task } from '@/lib/tasks';
import { Icon, type IconName } from './Icon';
import { playCelebration, playClick, playTick } from '@/lib/audio';
import { toast } from '@/lib/toast';
import { Mascot } from './challenges/Mascot';
import { currentUserId } from '@/lib/supabase';
import { hueOf } from '@/lib/people';
import { moodOf, type Mood, BUDDY_QUOTES } from '@/lib/mascot';
import { useShop } from '@/lib/shop';

export function DailyQuests({
  tasks = [],
  habits = [],
  ticks = [],
  notesCount = 0,
  eventsCount = 0,
  daysSinceDone = 0,
  streakDays = 1,
  xp = 120,
  onStartFocus,
  onRewardClaimed,
}: {
  tasks?: Task[];
  habits?: Habit[];
  ticks?: Tick[];
  notesCount?: number;
  eventsCount?: number;
  daysSinceDone?: number | null;
  streakDays?: number;
  xp?: number;
  onStartFocus?: () => void;
  onRewardClaimed?: (rp: number) => void;
}) {
  const todayStr = ymd(new Date());
  const [claimState, setClaimState] = useState<Record<string, boolean>>({});
  const { equipped } = useShop();

  const [me, setMe] = useState('');
  const [quoteIdx, setQuoteIdx] = useState(0);
  const [bouncing, setBouncing] = useState(false);
  const [currentMood, setCurrentMood] = useState<Mood>('keen');
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);

  useEffect(() => {
    void currentUserId().then((id) => {
      setMe(id || 'me');
      setCurrentMood(moodOf({ daysSince: daysSinceDone, leading: streakDays > 3 }));
    }).catch(() => {
      setMe('me');
      setCurrentMood(moodOf({ daysSince: daysSinceDone, leading: streakDays > 3 }));
    });
  }, [daysSinceDone, streakDays]);

  const hue = hueOf(me || 'me');
  const petLevel = Math.max(1, Math.floor(xp / 100) + 1);

  const handlePet = (e: React.MouseEvent) => {
    e.stopPropagation();
    setBouncing(true);
    playClick();
    setQuoteIdx((prev) => (prev + 1) % BUDDY_QUOTES.length);

    const newHeart = { id: Date.now(), x: Math.random() * 30 - 15, y: -10 };
    setHearts((h) => [...h.slice(-4), newHeart]);
    setTimeout(() => {
      setHearts((h) => h.filter((item) => item.id !== newHeart.id));
    }, 1000);

    setTimeout(() => setBouncing(false), 400);
  };

  const handleGiveCoffee = (e: React.MouseEvent) => {
    e.stopPropagation();
    playTick();
    setCurrentMood('coffee');
    setTimeout(() => {
      setCurrentMood(moodOf({ daysSince: daysSinceDone, leading: streakDays > 3 }));
    }, 5000);
  };

  const handleCelebrate = (e: React.MouseEvent) => {
    e.stopPropagation();
    playCelebration();
    setCurrentMood('celebrating');
    setTimeout(() => {
      setCurrentMood(moodOf({ daysSince: daysSinceDone, leading: streakDays > 3 }));
    }, 5000);
  };

  const quests = deriveDailyQuests({
    tasks,
    habits,
    ticks,
    notesUpdatedToday: notesCount,
    eventsCountToday: eventsCount,
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
      {/* Background ambient subtle glow on left */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: -20,
          top: -20,
          width: 180,
          height: 180,
          borderRadius: '50%',
          pointerEvents: 'none',
          background: `radial-gradient(circle, color-mix(in srgb, ${hue} 12%, transparent) 0%, transparent 70%)`,
        }}
      />

      {/* Main Grid: Left Buddy, Right Quests */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        {/* Left Side: Study Buddy Companion (Level above buddy, buddy itself, micro buttons) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            borderRight: '1px solid var(--line2)',
            paddingRight: 16,
            minWidth: 100,
            flex: 'none',
          }}
        >
          {/* Level above buddy */}
          <div style={{ marginBottom: 6 }}>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                color: hue,
                textTransform: 'uppercase',
                letterSpacing: '.06em',
                padding: '2px 7px',
                borderRadius: 6,
                background: `color-mix(in srgb, ${hue} 15%, transparent)`,
              }}
            >
              Lvl {petLevel}
            </span>
          </div>

          {/* Buddy Mascot */}
          <div
            onClick={handlePet}
            role="button"
            tabIndex={0}
            aria-label="Pet study buddy"
            className="k-squish"
            style={{
              position: 'relative',
              cursor: 'pointer',
              transform: bouncing ? 'scale(1.15) translateY(-3px)' : 'scale(1)',
              transition: 'transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            <Mascot
              id={me || 'me'}
              mood={currentMood}
              hue={hue}
              size={54}
              variant="full"
              accessory={equipped.mascotAccessory}
              crown={equipped.mascotAccessory === 'crown'}
            />
            {hearts.map((h) => (
              <span
                key={h.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: '50%',
                  transform: `translate(${h.x}px, ${h.y}px)`,
                  fontSize: 13,
                  animation: 'pop 0.8s ease-out forwards',
                  pointerEvents: 'none',
                }}
              >
                💖
              </span>
            ))}
          </div>

          {/* Micro Interaction Actions (Coffee / Cheer) */}
          <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
            <button
              onClick={handleGiveCoffee}
              title="Give Coffee"
              className="hov k-squish"
              style={{
                padding: '2px 5px',
                borderRadius: 5,
                background: 'var(--card2)',
                border: '1px solid var(--line)',
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              ☕
            </button>
            <button
              onClick={handleCelebrate}
              title="Cheer"
              className="hov k-squish"
              style={{
                padding: '2px 5px',
                borderRadius: 5,
                background: 'var(--card2)',
                border: '1px solid var(--line)',
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              🎉
            </button>
          </div>
        </div>

        {/* Right Side: Daily RPG Quests */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 220 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: 'color-mix(in srgb, var(--pal-amber) 20%, transparent)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Icon name="trophy" size={13} color="var(--pal-amber)" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '-.01em' }}>Daily Objectives</div>
                <div style={{ fontSize: 9.5, color: 'var(--tx3)' }}>Real daily tasks to boost RP & rank</div>
              </div>
            </div>

            <div
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                color: 'var(--pal-amber)',
                background: 'color-mix(in srgb, var(--pal-amber) 12%, transparent)',
                padding: '2px 8px',
                borderRadius: 7,
              }}
            >
              +{totalRewards} RP Earned
            </div>
          </div>

          {/* Quest items list */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, flex: 1 }}>
            {quests.map((q) => {
              const isClaimed = q.claimed || claimState[q.id];
              const pct = Math.min(100, Math.round((q.current / q.target) * 100));

              return (
                <div
                  key={q.id}
                  style={{
                    background: 'var(--card2)',
                    borderRadius: 10,
                    padding: '8px 10px',
                    border: '1px solid var(--line)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 7,
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
                        size={12}
                        color={isClaimed ? 'var(--pal-mint)' : 'var(--tx2)'}
                      />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span
                          style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            color: isClaimed ? 'var(--tx3)' : 'var(--tx)',
                            textDecoration: isClaimed ? 'line-through' : 'none',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {q.title}
                        </span>
                        <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--pal-amber)' }}>
                          +{q.reward} RP
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: 'var(--tx3)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          marginTop: 1,
                        }}
                      >
                        {q.desc}
                      </div>
                    </div>
                  </div>

                  {/* Progress bar + Action Button */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <div
                      style={{
                        flex: 1,
                        height: 4,
                        borderRadius: 2,
                        background: 'var(--line2)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${pct}%`,
                          borderRadius: 2,
                          background: q.completed ? 'var(--pal-mint)' : 'var(--acc)',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>

                    <span style={{ fontSize: 9.5, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
                      {q.current}/{q.target}
                    </span>

                    {q.completed && !isClaimed ? (
                      <button
                        onClick={() => handleClaim(q)}
                        className="k-squish"
                        style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: 'var(--pal-amber)',
                          color: '#0A0912',
                          fontSize: 10,
                          fontWeight: 800,
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        Claim
                      </button>
                    ) : isClaimed ? (
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--pal-mint)' }}>
                        ✓
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
