'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { toast } from './toast';

export type Txn = {
  id: string;
  account_id: string | null;
  name: string;
  amount_centavos: number;
  category: string;
  occurred_at: string;
  deleted_at: string | null;
};

export type Account = { id: string; name: string; kind: string; color: string };
export type Budget = { id: string; category: string; period: string; amount_centavos: number };
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
        .select('id,account_id,name,amount_centavos,category,occurred_at,deleted_at')
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
      const { data, error } = await supabase.from('bd_accounts').select('id,name,kind,color').order('position');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useBudgets() {
  return useQuery({
    queryKey: BUD_KEY,
    queryFn: async (): Promise<Budget[]> => {
      const { data, error } = await supabase.from('bd_budgets').select('id,category,period,amount_centavos');
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
        .order('created_at');
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
  async (v: { id: string; name: string; amount_centavos: number; category: string; account_id: string | null }) => {
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
  if (e2) throw e2;
});

export function useMoneyActions() {
  const qc = useQueryClient();
  const settle = () => {
    void qc.invalidateQueries({ queryKey: TXN_KEY });
    void qc.invalidateQueries({ queryKey: BUY_KEY });
  };

  const addTxn = useMutation({
    mutationKey: ADD_TXN,
    onMutate: (v: { id: string; name: string; amount_centavos: number; category: string; account_id: string | null }) => {
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

  const restoreTxn = useMutation<unknown, Error, { id: string }>({ mutationKey: RESTORE_TXN, onSettled: settle });
  const addBuy = useMutation<unknown, Error, { id: string; name: string; amount_centavos: number }>({ mutationKey: ADD_BUY, onSettled: settle });
  const logBuy = useMutation<unknown, Error, { item: ToBuy; account_id: string | null }>({ mutationKey: LOG_BUY, onSettled: settle });

  const removeWithUndo = (t: Txn) => {
    delTxn.mutate({ id: t.id });
    toast(`Deleted “${t.name}”`, () => restoreTxn.mutate({ id: t.id }));
  };

  return { addTxn, delTxn, restoreTxn, addBuy, logBuy, removeWithUndo };
}
