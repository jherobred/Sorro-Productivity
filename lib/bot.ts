/**
 * Sorro's resident bot, from the client's side.
 *
 * Its id is fixed rather than looked up, so recognising a bot post costs no
 * query — it must match BOT_ID in supabase/migrations/0001_gemini_bot.sql and
 * supabase/functions/gemini-bot/index.ts.
 *
 * Labelling matters more than it looks: a machine-written post that reads as a
 * person's is a small deception, and one that repeats every two hours stops
 * being small. Anything it writes says so on its face.
 */

export const BOT_ID = '00000000-0000-4000-8000-00000000b07d';
export const BOT_NAME = 'Gemini';

export const isBot = (id: string | null | undefined) => id === BOT_ID;
