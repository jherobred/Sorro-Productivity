// Prints your Basedly user id (for BOT_API_USER_ID) and, with --password,
// adds an email/password login to the same account so a bot can sign in
// without Google. Run it yourself; the password never leaves this terminal.
//
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/bot-access.mjs you@ust.edu.ph [--password]
import { createInterface } from 'node:readline/promises';

const url = 'https://jdkbnsjczanvmmpsovhm.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];
if (!key || !email) throw new Error('Need SUPABASE_SERVICE_ROLE_KEY and an email argument');

const api = (path, init = {}) =>
  fetch(`${url}/auth/v1/admin/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  }).then(async r => { const b = await r.json(); if (!r.ok) throw new Error(b.msg ?? JSON.stringify(b)); return b; });

const { users } = await api('users?per_page=1000');
const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
if (!user) throw new Error(`No user with email ${email}`);
console.log('user id:', user.id);

if (process.argv.includes('--password')) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const password = await rl.question('New password for bot sign-in (12+ chars): ');
  rl.close();
  if (password.length < 12) throw new Error('Too short');
  await api(`users/${user.id}`, { method: 'PUT', body: JSON.stringify({ password }) });
  console.log('Password set. Bots sign in with supabase.auth.signInWithPassword({ email, password }).');
}
