// Writes the assistant's tool schemas and voice as JSON for the Python generator, so they are never re-typed.
// Run: node training/export.mjs
import { writeFileSync } from 'node:fs';
import { TOOLS } from '../supabase/functions/assistant/tools.ts';
import { FOX_VOICE } from '../supabase/functions/assistant/voice.ts';

const here = new URL('.', import.meta.url);
writeFileSync(new URL('tools.json', here), JSON.stringify(TOOLS, null, 2));
writeFileSync(new URL('voice.json', here), JSON.stringify({ FOX_VOICE }, null, 2));
console.log(`tools.json: ${TOOLS.length} tools`);
