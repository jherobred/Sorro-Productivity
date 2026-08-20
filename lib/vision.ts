'use client';

import { supabase } from './supabase';
import { ymd } from './series';

/**
 * Photographs, read.
 *
 * One client-side door onto the `photo-read` edge function, which is the same
 * shape as the schedule scanner: the key stays on the server, the model answers
 * in a fixed schema at temperature 0, and **nothing is written until a person
 * has looked at what came back**. Every caller here shows a review sheet.
 *
 * The downscale matters more than it looks. Small print — a receipt total, the
 * label on a tub — is the first thing to go, so the long edge only comes down
 * to 2000px and the JPEG is barely compressed. An image already smaller than
 * that is sent as it is.
 */

export type MealRead = {
  ok: true; mode: 'meal'; model: string;
  name: string; kcal: number; protein: number; carbs: number; fat: number;
  items?: { name: string; portion?: string; kcal: number; protein: number; carbs: number; fat: number }[];
  confidence: number; notes: string;
};

export type ReceiptRead = {
  ok: true; mode: 'receipt'; model: string;
  merchant: string; total: number; currency?: string; date?: string; category: string;
  items?: { name: string; amount: number }[];
  confidence: number; notes: string;
};

export async function downscale(file: File): Promise<{ dataUrl: string; base64: string; mime: string }> {
  const bitmap = await createImageBitmap(file);
  const max = Math.max(bitmap.width, bitmap.height);
  const scale = max > 2000 ? 2000 / max : 1;

  const cv = document.createElement('canvas');
  cv.width = Math.round(bitmap.width * scale);
  cv.height = Math.round(bitmap.height * scale);
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('Could not read that image');
  ctx.drawImage(bitmap, 0, 0, cv.width, cv.height);
  bitmap.close();

  const dataUrl = cv.toDataURL('image/jpeg', 0.94);
  return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mime: 'image/jpeg' };
}

async function read<T>(file: File, mode: 'meal' | 'receipt'): Promise<{ preview: string; result: T }> {
  const { dataUrl, base64, mime } = await downscale(file);
  const { data, error } = await supabase.functions.invoke('photo-read', {
    body: { image: base64, mime, mode, today: ymd(new Date()) },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.message ?? 'Could not read that');
  return { preview: dataUrl, result: data as T };
}

export const readMeal = (file: File) => read<MealRead>(file, 'meal');
export const readReceipt = (file: File) => read<ReceiptRead>(file, 'receipt');
