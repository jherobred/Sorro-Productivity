'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { ymd } from './days';
import { defineMutation, queryClient } from './offline';
import { toast } from './toast';
import { rpFor, standings, type RuleId } from './rank';
import { settler } from './settle';
import { normaliseMetric, type MetricId } from './metrics';
import { mirrorHabit, retireMirror } from './habits';
import { diffSeries, totalOf, bestStreak, type Series } from './series';

export type Challenge = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  habit_label: string;
  metric: MetricId;
  rule: RuleId;
  target: number | null;
  unit: string;
  starts_on: string;
  ends_on: string;
  color: string;
  visibility: 'public' | 'invite';
  join_code: string | null;
  ranked: boolean;
  settled_at: string | null;
  winner_id: string | null;
  /** RP each competitor puts in. The winner takes the pot. 0 is a friendly. */
  stake_rp: number;
};

/** One person, one day, one number — what the sparkline and the arena read. */
export type Day = { challenge_id: string; user_id: string; on_date: string; value: number };

export type Member = {
  challenge_id: string;
  user_id: string;
  display_name: string | null;
  habit_id: string | null;
  progress: number;
  rp_delta: number;
  placed: number | null;
  joined_at: string;
};

/** Every column a Challenge has, so an optimistic insert is not half a row. */
const BLANK: Challenge = {
  id: '', owner_id: '', name: '', description: '', habit_label: '',
  metric: 'habit', rule: 'most', target: null, unit: 'times',
  starts_on: '', ends_on: '', color: '#7C6CFF', visibility: 'public',
  join_code: null, ranked: false, settled_at: null, winner_id: null, stake_rp: 0,
};

const CHALS = ['challenges'] as const;
const MEMBERS = ['challenge_members'] as const;
const DAYS = ['challenge_days'] as const;
export const RANKED = ['ranked'] as const;
const STARS = ['challenge_stars'] as const;
/** lib/habits.ts owns this key; challenge actions write rows under it. */
const HABITS = ['habits'] as const;

export function useChallenges() {
  return useQuery({
    queryKey: CHALS,
    queryFn: async (): Promise<Challenge[]> => {
      const { data, error } = await supabase.from('bd_challenges')
        .select('id,owner_id,name,description,habit_label,metric,rule,target,unit,starts_on,ends_on,color,visibility,join_code,ranked,settled_at,winner_id,stake_rp')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Challenge[];
    },
  });
}

export function useMembers() {
  return useQuery({
    queryKey: MEMBERS,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase.from('bd_challenge_members')
        .select('challenge_id,user_id,display_name,habit_id,progress,rp_delta,placed,joined_at');
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });
}

/**
 * Every competitor's day-by-day numbers, for every challenge on screen.
 *
 * Readable by everyone (0006_arena_body_money.sql) because a leaderboard
 * nobody can see is not a leaderboard — but each row is written only by the
 * person it belongs to, from their own private tables. The count travels; the
 * data does not.
 */
export function useChallengeDays() {
  return useQuery({
    queryKey: DAYS,
    queryFn: async (): Promise<Day[]> => {
      const { data, error } = await supabase.from('bd_challenge_days')
        .select('challenge_id,user_id,on_date,value');
      if (error) throw error;
      return (data ?? []) as Day[];
    },
  });
}

/**
 * Who has starred what. A star is a like — the same one row per person per
 * thing — drawn as a star because a challenge is something you back rather
 * than something you enjoy.
 */
export function useStars() {
  return useQuery({
    queryKey: STARS,
    queryFn: async (): Promise<{ challenge_id: string; user_id: string }[]> => {
      const { data, error } = await supabase.from('bd_challenge_stars').select('challenge_id,user_id');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Your ladder standing. One row per player; tier is derived from rp. */
export function useRanked() {
  return useQuery({
    queryKey: RANKED,
    queryFn: async (): Promise<{ rp: number; peak_rp: number; wins: number; losses: number; season: string }> => {
      const { data } = await supabase.from('bd_ranked').select('rp,peak_rp,wins,losses,season').maybeSingle();
      return data ?? { rp: 0, peak_rp: 0, wins: 0, losses: 0, season: 's1' };
    },
  });
}

const CREATE = defineMutation('chal.create', async (v: Partial<Challenge> & { id: string; name: string }) => {
  const owner_id = await currentUserId();
  const { error } = await supabase.from('bd_challenges').insert({ ...v, owner_id });
  if (error) throw error;
  // The owner is always a competitor - a challenge with nobody in it is a note.
  await supabase.from('bd_challenge_members').insert({ challenge_id: v.id, user_id: owner_id, progress: 0 });
  await enrol({ challenge_id: v.id, name: v.name, color: v.color ?? '#7C6CFF', metric: v.metric ?? 'manual' });
});

/**
 * Put the challenge on your Habits page, and wire the scoring where it counts.
 *
 * **Every** challenge gets a habit row, because the ask was that joining one
 * shows up where you actually look each morning rather than only on a
 * scoreboard in Community.
 *
 * **`bd_challenge_members.habit_id` is set only when a tick *is* the score.**
 * `bd_habit_tick` recomputes a member's progress as the number of ticks of
 * their linked habit inside the window - which is exactly right for `habit`
 * and `manual`, and would be a lie for `steps`, `task` or `body`, where the
 * number comes from a different table entirely. Linking those would overwrite a
 * real count with "how many times you tapped a square". So they get the row and
 * not the link, and lib/metrics.ts keeps owning their number.
 *
 * A failure here never fails the join. Being in the challenge is the thing the
 * person pressed the button for; the mirror is a convenience and it can be
 * made again next time the page loads.
 */
async function enrol(v: { challenge_id: string; name: string; color: string; metric: MetricId }) {
  try {
    const habit_id = await mirrorHabit({ challenge_id: v.challenge_id, name: v.name, color: v.color });
    if (habit_id && (v.metric === 'habit' || v.metric === 'manual')) {
      const user_id = await currentUserId();
      await supabase.from('bd_challenge_members').update({ habit_id })
        .eq('challenge_id', v.challenge_id).eq('user_id', user_id);
    }
  } catch { /* the challenge is joined; the habit can be mirrored again later */ }
}

const EDIT = defineMutation('chal.edit', async (v: { id: string; patch: Partial<Challenge> }) => {
  const { error } = await supabase.from('bd_challenges').update(v.patch as never).eq('id', v.id);
  if (error) throw error;
});

/**
 * Deleting takes the members with it — a challenge's standings mean nothing
 * without the challenge. Only the owner can, and RLS enforces that; the button
 * is hidden for everyone else so the refusal never has to happen.
 */
const DELETE = defineMutation('chal.delete', async (v: { id: string }) => {
  const { error: e1 } = await supabase.from('bd_challenge_members').delete().eq('challenge_id', v.id);
  if (e1) throw e1;
  const { error } = await supabase.from('bd_challenges').delete().eq('id', v.id);
  if (error) throw error;
});

const STAR = defineMutation('chal.star', async (v: { challenge_id: string; on: boolean }) => {
  const user_id = await currentUserId();
  const { error } = v.on
    ? await supabase.from('bd_challenge_stars').insert({ challenge_id: v.challenge_id, user_id })
    : await supabase.from('bd_challenge_stars').delete().eq('challenge_id', v.challenge_id).eq('user_id', user_id);
  if (error) throw error;
});

const JOIN = defineMutation('chal.join', async (v: {
  challenge_id: string; habit_id?: string | null;
  /** Carried so the mirrored habit can be named without a second read. */
  name?: string; color?: string; metric?: MetricId;
}) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_challenge_members')
    .insert({ challenge_id: v.challenge_id, user_id, habit_id: v.habit_id ?? null, progress: 0 });
  if (error) throw error;
  if (v.name) {
    await enrol({
      challenge_id: v.challenge_id, name: v.name,
      color: v.color ?? '#7C6CFF', metric: v.metric ?? 'manual',
    });
  }
});

const LEAVE = defineMutation('chal.leave', async (v: { challenge_id: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_challenge_members')
    .delete().eq('challenge_id', v.challenge_id).eq('user_id', user_id);
  if (error) throw error;
  // Archived, not deleted: the ticks are yours and a streak should not vanish
  // because you stepped out of somebody's five-day sprint.
  await retireMirror(v.challenge_id).catch(() => {});
});

/**
 * Publish my own day series for one challenge.
 *
 * Only the days that changed are written — a challenge whose numbers have not
 * moved costs nothing to open, and a fortnight's window does not rewrite
 * fourteen rows every time the tab is shown.
 */
const SYNC = defineMutation('chal.sync', async (v: { challenge_id: string; days: { on_date: string; value: number }[]; total: number }) => {
  const user_id = await currentUserId();
  if (v.days.length) {
    const { error } = await supabase.from('bd_challenge_days')
      .upsert(v.days.map((d) => ({ ...d, challenge_id: v.challenge_id, user_id })),
              { onConflict: 'challenge_id,user_id,on_date' });
    if (error) {
      for (const d of v.days) {
        await supabase.from('bd_challenge_days').upsert({
          challenge_id: v.challenge_id,
          user_id,
          on_date: d.on_date,
          value: d.value,
        });
      }
    }
  }
  const { error } = await supabase.from('bd_challenge_members')
    .update({ progress: v.total }).eq('challenge_id', v.challenge_id).eq('user_id', user_id);
  if (error) throw error;
});

const BUMP = defineMutation('chal.bump', async (v: { challenge_id: string; progress: number }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_challenge_members')
    .update({ progress: v.progress }).eq('challenge_id', v.challenge_id).eq('user_id', user_id);
  if (error) throw error;
});

const SETTLE = defineMutation('chal.settle', async (v: {
  challenge_id: string; winner_id: string | null; awards: { user_id: string; place: number; rp: number }[];
}) => {
  const me = await currentUserId();
  await supabase.from('bd_challenges')
    .update({ settled_at: new Date().toISOString(), winner_id: v.winner_id })
    .eq('id', v.challenge_id);

  await Promise.all(v.awards.map((a) =>
    supabase.from('bd_challenge_members')
      .update({ placed: a.place, rp_delta: a.rp })
      .eq('challenge_id', v.challenge_id).eq('user_id', a.user_id)));

  // Only the caller's own ladder row can be written — RLS sees to that, so
  // everyone banks their own result the first time they open the settled card.
  const mine = v.awards.find((a) => a.user_id === me);
  if (!mine) return;
  const { data: cur } = await supabase.from('bd_ranked').select('rp,peak_rp,wins,losses').maybeSingle();
  const rp = (cur?.rp ?? 0) + mine.rp;
  const { error } = await supabase.from('bd_ranked').upsert({
    user_id: me,
    rp,
    peak_rp: Math.max(cur?.peak_rp ?? 0, rp),
    wins: (cur?.wins ?? 0) + (mine.place === 1 ? 1 : 0),
    losses: (cur?.losses ?? 0) + (mine.place === 1 ? 0 : 1),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
});

/**
 * "Is this row me?" without an await. currentUserId() is async and the
 * optimistic patch has to run synchronously, so the row is matched on the id
 * Supabase gave us at sign-in — which the client caches — falling back to the
 * label the preview fixtures use.
 */
function isMine(m: Member): boolean {
  return m.user_id === cachedUserId() || m.display_name === 'You';
}

let uid: string | null = null;
function cachedUserId(): string | null {
  if (uid) return uid;
  void currentUserId().then((id) => { uid = id; }).catch(() => {});
  return uid;
}

export function useChallengeActions() {
  const qc = useQueryClient();
  // Habits is in this list because every action here can move a row on that
  // page: create and join write a mirror habit (`enrol`), leave archives it,
  // delete drops its challenge_id and hands it back as a personal habit.
  // It used to be invalidated in `join` alone, so a challenge you *made* wrote
  // its mirror to the database and then never appeared under "From challenges"
  // — the row existed, the cache did not know. Gemini's challenges showed up
  // only because you join those and create your own.
  const settle = settler(qc, CHALS, MEMBERS, RANKED, STARS, HABITS, DAYS, ['metric']);
  const patchMembers = (fn: (p: Member[]) => Member[]) => {
    const prev = queryClient.getQueryData<Member[]>(MEMBERS) ?? [];
    queryClient.setQueryData<Member[]>(MEMBERS, fn(prev));
    return prev;
  };
  const rollback = (_e: unknown, _v: unknown, ctx: Member[] | undefined) => {
    if (ctx) queryClient.setQueryData(MEMBERS, ctx);
  };

  const patchChals = (fn: (p: Challenge[]) => Challenge[]) => {
    const prev = queryClient.getQueryData<Challenge[]>(CHALS) ?? [];
    queryClient.setQueryData<Challenge[]>(CHALS, fn(prev));
    return prev;
  };

  const create = useMutation<unknown, Error, Partial<Challenge> & { id: string; name: string }>({
    mutationKey: CREATE,
    onMutate: (v) => {
      const me = cachedUserId() ?? 'me';
      patchChals((p) => [...p, { ...BLANK, ...v, owner_id: me } as Challenge]);
      patchMembers((p) => [...p, {
        challenge_id: v.id, user_id: me, display_name: 'You',
        habit_id: null, progress: 0, rp_delta: 0, placed: null, joined_at: new Date().toISOString(),
      }]);
    },
    onSettled: settle,
  });
  const edit = useMutation<unknown, Error, { id: string; patch: Partial<Challenge> }>({
    mutationKey: EDIT,
    onMutate: (v) => patchChals((p) => p.map((c) => (c.id === v.id ? { ...c, ...v.patch } : c))),
    onSettled: settle,
  });
  const remove = useMutation<unknown, Error, { id: string }, Challenge[]>({
    mutationKey: DELETE,
    onMutate: (v) => {
      patchMembers((p) => p.filter((m) => m.challenge_id !== v.id));
      return patchChals((p) => p.filter((c) => c.id !== v.id));
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(CHALS, ctx); },
    onSettled: settle,
  });
  const star = useMutation<unknown, Error, { challenge_id: string; on: boolean }, { challenge_id: string; user_id: string }[]>({
    mutationKey: STAR,
    onMutate: (v) => {
      const me = cachedUserId() ?? 'me';
      const prev = queryClient.getQueryData<{ challenge_id: string; user_id: string }[]>(STARS) ?? [];
      queryClient.setQueryData(STARS, v.on
        ? [...prev, { challenge_id: v.challenge_id, user_id: me }]
        : prev.filter((r) => !(r.challenge_id === v.challenge_id && r.user_id === me)));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(STARS, ctx); },
    onSettled: settle,
  });

  const sync = useMutation<unknown, Error, { challenge_id: string; days: { on_date: string; value: number }[]; total: number }>({
    mutationKey: SYNC,
    onMutate: (v) => {
      const me = cachedUserId() ?? 'me';
      const prev = queryClient.getQueryData<Day[]>(DAYS) ?? [];
      const touched = new Set(v.days.map((d) => `${v.challenge_id}|${d.on_date}`));
      queryClient.setQueryData<Day[]>(DAYS, [
        ...prev.filter((d) => !(d.user_id === me && touched.has(`${d.challenge_id}|${d.on_date}`))),
        ...v.days.map((d) => ({ ...d, challenge_id: v.challenge_id, user_id: me })),
      ]);
      patchMembers((p) => p.map((m) =>
        (m.challenge_id === v.challenge_id && isMine(m) ? { ...m, progress: v.total } : m)));
    },
    onSettled: settle,
  });

  const join = useMutation<unknown, Error, {
    challenge_id: string; habit_id?: string | null;
    name?: string; color?: string; metric?: MetricId;
  }>({
    mutationKey: JOIN,
    onSettled: settle,
  });
  const leave = useMutation<unknown, Error, { challenge_id: string }>({ mutationKey: LEAVE, onSettled: settle });
  const bump = useMutation<unknown, Error, { challenge_id: string; progress: number }, Member[]>({
    mutationKey: BUMP,
    // The bar has to move on the press, not on the round trip — a counter that
    // waits for the network reads as a broken button.
    onMutate: (v) => patchMembers((p) => p.map((m) =>
      m.challenge_id === v.challenge_id && isMine(m) ? { ...m, progress: v.progress } : m)),
    onError: rollback,
    onSettled: settle,
  });
  const settleUp = useMutation<unknown, Error, { challenge_id: string; winner_id: string | null; awards: { user_id: string; place: number; rp: number }[] }>({
    mutationKey: SETTLE, onSettled: settle,
  });

  return {
    create, edit, remove, join, leave, bump, settleUp, patchMembers, star, sync,
    /** The same challenge again, dates shifted to start today. */
    duplicate(c: Challenge) {
      const span = Math.max(1, Math.round(
        (new Date(c.ends_on).getTime() - new Date(c.starts_on).getTime()) / 86_400_000));
      const from = new Date();
      const to = new Date(from);
      to.setDate(to.getDate() + span);
      const copy = {
        ...c, id: crypto.randomUUID(), name: `${c.name} (copy)`,
        starts_on: ymd(from), ends_on: ymd(to),
        settled_at: null, winner_id: null,
      };
      create.mutate(copy);
      toast(`Copied \u201C${c.name}\u201D — it runs again from today`);
    },
    /** Delete, with the challenge and its members kept for Undo. */
    removeWithUndo(c: Challenge, mem: Member[]) {
      remove.mutate({ id: c.id });
      toast(`Deleted \u201C${c.name}\u201D`, () => {
        patchChals((p) => (p.some((x) => x.id === c.id) ? p : [...p, c]));
        patchMembers((p) => [...p.filter((m) => m.challenge_id !== c.id), ...mem]);
        create.mutate({ ...c });
      });
    },
    /** Work out places and RP, then bank them. */
    finish(c: Challenge, members: Member[]) {
      const { rows } = standings(members, c.rule, c.target);
      const awards = rows.map((r) => ({
        user_id: r.user_id, place: r.place, rp: payout(c, r.place, rows.length),
      }));
      settleUp.mutate({ challenge_id: c.id, winner_id: rows[0]?.user_id ?? null, awards });
      toast(`${c.name} settled — ${rows[0]?.display_name ?? 'nobody'} took it`);
    },
  };
}

/**
 * A challenge is live between its dates and unsettled. `first_to` also ends the
 * moment somebody reaches the target, which is the whole point of that rule.
 */
export function phaseOf(c: Challenge, members: Member[]): 'upcoming' | 'live' | 'over' {
  if (c.settled_at) return 'over';
  const today = ymd(new Date());
  if (c.starts_on > today) return 'upcoming';
  if (c.ends_on < today) return 'over';
  if (c.rule === 'first_to' && c.target != null && members.some((m) => m.progress >= c.target!)) return 'over';
  return 'live';
}

/**
 * What each place walks away with.
 *
 * With a stake, the challenge is its own economy: everyone puts in, the winner
 * takes the pot and the rest are out what they wagered — which is what makes
 * the last day matter. Without one it falls back to the ladder's own curve, so
 * a friendly challenge still counts for something.
 */
export function payout(c: Challenge, place: number, field: number): number {
  if (c.stake_rp > 0) {
    const pot = c.stake_rp * field;
    return place === 1 ? pot - c.stake_rp : -c.stake_rp;
  }
  return c.ranked ? rpFor(place, field) : 0;
}

/** The total a rule actually scores: a streak challenge counts its best run. */
export function scoreOf(rule: RuleId, series: Series): number {
  return rule === 'streak' ? bestStreak(series) : totalOf(series);
}

/** Only the days that moved, so a sync writes as little as it can. */
export { diffSeries, normaliseMetric };
export type { MetricId };

export function daysLeft(c: Challenge): number {
  const end = new Date(`${c.ends_on}T23:59:59`).getTime();
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}
