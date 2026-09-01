'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { toast } from './toast';
import { settler } from './settle';

export type Txn = {
  id: string;
  account_id: string | null;
  name: string;
  amount_centavos: number;
  category: string;
  occurred_at: string;
  deleted_at: string | null;
  /** Where it happened, and who with. Both optional — see the Lazy path below. */
  place?: string | null;
  who?: string | null;
  /**
   * False for a row the Lazy button wrote: the amount and jar are right, the
   * rest was skipped. The feed marks these so they can be finished later rather
   * than passing as complete.
   */
  detailed?: boolean;
};

/**
 * What a new transaction needs. `occurred_at` and `deleted_at` are the
 * database's to set; the three optional fields are the log sheet's, and are all
 * absent when the Lazy button wrote the row.
 */
export type NewTxn = {
  id: string; name: string; amount_centavos: number; category: string;
  account_id: string | null;
  place?: string | null; who?: string | null; detailed?: boolean;
};

export type Account = { id: string; name: string; kind: string; color: string; opening_centavos: number };
export type Budget = {
  id: string; category: string; period: string; amount_centavos: number;
  /** Null falls back to a shipped photograph, then to a tinted initial. */
  photo_path?: string | null;
};
export type ToBuy = { id: string; name: string; amount_centavos: number; bought_at: string | null };

const TXN_KEY = ['transactions'] as const;
const ACC_KEY = ['accounts'] as const;
const BUD_KEY = ['budgets'] as const;
const BUY_KEY = ['to_buy'] as const;

/** Philippine peso, thousands-separated. Stored as integer centavos. */
export function peso(centavos: number): string {
  return '₱' + (centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * Quick-add sends a raw string; strip non-numerics and default to ₱75.
 * Validated here AND server-side by the amount_centavos <> 0 check constraint.
 */
export function parseAmount(raw: string): number {
  const n = parseFloat(raw.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return 7500;
  return Math.round(n * 100);
}

export function useTransactions() {
  return useQuery({
    queryKey: TXN_KEY,
    queryFn: async (): Promise<Txn[]> => {
      const { data, error } = await supabase
        .from('bd_transactions')
        .select('id,account_id,name,amount_centavos,category,occurred_at,deleted_at,place,who,detailed')
        .is('deleted_at', null)
        .order('occurred_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAccounts() {
  return useQuery({
    queryKey: ACC_KEY,
    queryFn: async (): Promise<Account[]> => {
      const { data, error } = await supabase.from('bd_accounts').select('id,name,kind,color,opening_centavos').order('position');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useBudgets() {
  return useQuery({
    queryKey: BUD_KEY,
    queryFn: async (): Promise<Budget[]> => {
      const { data, error } = await supabase.from('bd_budgets').select('id,category,period,amount_centavos,photo_path');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useToBuy() {
  return useQuery({
    queryKey: BUY_KEY,
    queryFn: async (): Promise<ToBuy[]> => {
      const { data, error } = await supabase
        .from('bd_to_buy')
        .select('id,name,amount_centavos,bought_at')
        .is('bought_at', null)
        .order('created_at')
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Money is PIN-gated server-side; never gate on client state alone. */
export async function verifyPin(pin: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('bd_verify_pin', { p_pin: pin });
  if (error) return false;
  return data === true;
}

export async function lockedSections(): Promise<string[]> {
  const { data, error } = await supabase.rpc('bd_locked_sections');
  if (error) return [];
  return (data as string[]) ?? [];
}

/* ---- Mutations ---------------------------------------------------------- */

const ADD_TXN = defineMutation(
  'money.addTxn',
  async (v: NewTxn) => {
    const user_id = await currentUserId();
    const { error } = await supabase.from('bd_transactions').insert({ ...v, user_id });
    if (error) throw error;
  }
);

const DEL_TXN = defineMutation('money.delTxn', async (v: { id: string }) => {
  const { error } = await supabase
    .from('bd_transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', v.id);
  if (error) throw error;
});

const EDIT_TXN = defineMutation('money.editTxn', async (v: { id: string; patch: Partial<Txn> }) => {
  const { error } = await supabase.from('bd_transactions').update(v.patch as never).eq('id', v.id);
  if (error) throw error;
});

const RESTORE_TXN = defineMutation('money.restoreTxn', async (v: { id: string }) => {
  const { error } = await supabase.rpc('bd_restore', { p_table: 'bd_transactions', p_id: v.id });
  if (error) throw error;
});

const ADD_BUY = defineMutation('money.addBuy', async (v: { id: string; name: string; amount_centavos: number }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_to_buy').insert({ ...v, user_id });
  if (error) throw error;
});

// logBuy converts a to-buy item into a real transaction and marks it bought.
const LOG_BUY = defineMutation('money.logBuy', async (v: { item: ToBuy; account_id: string | null }) => {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from('bd_transactions')
    .insert({
      user_id,
      name: v.item.name,
      amount_centavos: v.item.amount_centavos || 7500,
      category: 'To buy',
      account_id: v.account_id,
    })
    .select('id')
    .single();
  if (error) throw error;
  const { error: e2 } = await supabase
    .from('bd_to_buy')
    .update({ bought_at: new Date().toISOString(), transaction_id: data.id })
    .eq('id', v.item.id);
  if (e2) {
    await supabase.from('bd_transactions').delete().eq('id', data.id);
    throw e2;
  }
});

export function useMoneyActions() {
  const qc = useQueryClient();
  const settle = settler(qc, TXN_KEY, BUY_KEY);

  const addTxn = useMutation({
    mutationKey: ADD_TXN,
    onMutate: (v: NewTxn) => {
      const prev = queryClient.getQueryData<Txn[]>(TXN_KEY) ?? [];
      queryClient.setQueryData<Txn[]>(TXN_KEY, [
        { ...v, occurred_at: new Date().toISOString(), deleted_at: null },
        ...prev,
      ]);
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(TXN_KEY, ctx); },
    onSettled: settle,
  });

  const delTxn = useMutation({
    mutationKey: DEL_TXN,
    onMutate: (v: { id: string }) => {
      const prev = queryClient.getQueryData<Txn[]>(TXN_KEY) ?? [];
      queryClient.setQueryData<Txn[]>(TXN_KEY, prev.filter((t) => t.id !== v.id));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(TXN_KEY, ctx); },
    onSettled: settle,
  });

  const editTxn = useMutation({
    mutationKey: EDIT_TXN,
    onMutate: (v: { id: string; patch: Partial<Txn> }) => {
      const prev = queryClient.getQueryData<Txn[]>(TXN_KEY) ?? [];
      queryClient.setQueryData<Txn[]>(TXN_KEY, prev.map((t) => (t.id === v.id ? { ...t, ...v.patch } : t)));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(TXN_KEY, ctx); },
    onSettled: settle,
  });

  // Undo puts the row back on screen straight away; the RPC clears deleted_at
  // server-side. Without the optimistic half, Undo looks like it did nothing
  // until the refetch lands.
  const restoreTxn = useMutation<unknown, Error, { id: string; row?: Txn }>({
    mutationKey: RESTORE_TXN,
    onMutate: (v) => {
      if (!v.row) return;
      const prev = queryClient.getQueryData<Txn[]>(TXN_KEY) ?? [];
      if (prev.some((t) => t.id === v.id)) return;
      queryClient.setQueryData<Txn[]>(TXN_KEY, [v.row, ...prev]
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)));
    },
    onSettled: settle,
  });
  const addBuy = useMutation<unknown, Error, { id: string; name: string; amount_centavos: number }>({ mutationKey: ADD_BUY, onSettled: settle });
  const logBuy = useMutation<unknown, Error, { item: ToBuy; account_id: string | null }>({ mutationKey: LOG_BUY, onSettled: settle });

  const removeWithUndo = (t: Txn) => {
    delTxn.mutate({ id: t.id });
    toast(`Deleted “${t.name}”`, () => restoreTxn.mutate({ id: t.id, row: t }));
  };

  return { addTxn, editTxn, delTxn, restoreTxn, addBuy, logBuy, removeWithUndo };
}

/* ==========================================================================
   Full CRUD for the rest of Money.
   
   Transactions had create and delete; budgets, goals, subscriptions and the
   to-buy list could only be read. Everything on the six tabs can now be
   created, edited and removed, and every delete is undoable through the toast.
   ========================================================================== */

export type Goal = { id: string; name: string; target_centavos: number; saved_centavos: number; due_on: string | null };
export type Sub = { id: string; name: string; amount_centavos: number; next_charge: string | null; period: string };

export const GOALS_KEY = ['goals'] as const;
export const SUBS_KEY = ['subscriptions'] as const;

export function useGoals() {
  return useQuery({
    queryKey: GOALS_KEY,
    queryFn: async (): Promise<Goal[]> => {
      const { data, error } = await supabase.from('bd_goals')
        .select('id,name,target_centavos,saved_centavos,due_on').order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSubs() {
  return useQuery({
    queryKey: SUBS_KEY,
    queryFn: async (): Promise<Sub[]> => {
      const { data, error } = await supabase.from('bd_subscriptions')
        .select('id,name,amount_centavos,next_charge,period').order('next_charge');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** One generic row writer — every Money table has the same shape of edit. */
function crud<T extends { id: string }>(name: string, table: string, key: readonly unknown[]) {
  const add = defineMutation(`money.add${name}`, async (v: Partial<T> & { id: string }) => {
    const user_id = await currentUserId();
    const { error } = await supabase.from(table).insert({ ...v, user_id } as never);
    if (error) throw error;
  });
  const edit = defineMutation(`money.edit${name}`, async (v: { id: string; patch: Partial<T> }) => {
    // The generic patch is opaque to the generated table types, so it is cast
    // once here rather than at every call site.
    const { error } = await supabase.from(table).update(v.patch as never).eq('id', v.id);
    if (error) throw error;
  });
  const del = defineMutation(`money.del${name}`, async (v: { id: string }) => {
    const { error } = await supabase.from(table).delete().eq('id', v.id);
    if (error) throw error;
  });
  return { add, edit, del, key };
}

const BUDGET = crud<Budget>('Budget', 'bd_budgets', BUD_KEY);
const GOAL = crud<Goal>('Goal', 'bd_goals', GOALS_KEY);
const SUB = crud<Sub>('Sub', 'bd_subscriptions', SUBS_KEY);
const BUY = crud<ToBuy>('Buy', 'bd_to_buy', BUY_KEY);

/**
 * Optimistic list edits. Every one of these is a small local list, so patching
 * the cache and rolling back on failure is both simpler and faster than waiting
 * for a refetch — a budget slider that lags a round trip feels broken.
 */
function useCrud<T extends { id: string }>(
  c: { add: readonly [string]; edit: readonly [string]; del: readonly [string]; key: readonly unknown[] },
  label: string,
) {
  const qc = useQueryClient();
  const settle = settler(qc, c.key);
  const patch = (fn: (p: T[]) => T[]) => {
    const prev = queryClient.getQueryData<T[]>(c.key) ?? [];
    queryClient.setQueryData<T[]>(c.key, fn(prev));
    return prev;
  };
  const rollback = (_e: unknown, _v: unknown, ctx: T[] | undefined) => {
    if (ctx) queryClient.setQueryData(c.key, ctx);
  };

  const add = useMutation<unknown, Error, Partial<T> & { id: string }, T[]>({
    mutationKey: c.add,
    onMutate: (v) => patch((p) => [...p, v as T]),
    onError: rollback,
    onSettled: settle,
  });
  const edit = useMutation<unknown, Error, { id: string; patch: Partial<T> }, T[]>({
    mutationKey: c.edit,
    onMutate: (v) => patch((p) => p.map((r) => (r.id === v.id ? { ...r, ...v.patch } : r))),
    onError: rollback,
    onSettled: settle,
  });
  const del = useMutation<unknown, Error, { id: string }, T[]>({
    mutationKey: c.del,
    onMutate: (v) => patch((p) => p.filter((r) => r.id !== v.id)),
    onError: rollback,
    onSettled: settle,
  });

  return {
    add, edit, del,
    /** Delete with the row kept in hand, so Undo can put it straight back. */
    removeWithUndo(row: T, name: string) {
      del.mutate({ id: row.id });
      toast(`Deleted “${name}”`, () => add.mutate(row as Partial<T> & { id: string }));
    },
    label,
  };
}

export const useBudgetActions = () => useCrud<Budget>(BUDGET, 'budget');
export const useGoalActions = () => useCrud<Goal>(GOAL, 'goal');
export const useSubActions = () => useCrud<Sub>(SUB, 'subscription');
export const useBuyActions = () => useCrud<ToBuy>(BUY, 'item');
