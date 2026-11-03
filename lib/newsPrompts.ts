/**
 * The task text Jhems pastes into a Grok scheduled task, one per news kind.
 * Grok has no Sorro login: it visits the drop URL with the digest in the query
 * string (supabase/functions/news-drop), split into parts so no URL gets too long.
 */

const DROP = 'https://jdkbnsjczanvmmpsovhm.supabase.co/functions/v1/news-drop';

export const PROMPT_KINDS = ['ai-digest', 'dev-stack', 'trending', 'hackathons', 'jobs', 'research', 'gaming', 'ph-brief', 'weekly'] as const;
export type PromptKind = typeof PROMPT_KINDS[number];

export const dropUrl = (key: string, kind: PromptKind) => `${DROP}?k=${encodeURIComponent(key)}&kind=${kind}`;

const BRIEF: Record<PromptKind, { what: string; when: string }> = {
  'ai-digest': { what: 'the most important AI news from the last 24 hours: model and product releases, research results, open-source tools, and policy. 6 to 10 items, newest first.', when: 'Every day at 7:00 AM Asia/Manila' },
  'dev-stack': { what: 'new releases and security advisories from the last 24 hours for Next.js, React, Supabase, Tauri, Capacitor, Kotlin and Jetpack Compose, Flutter, Rust and Unreal Engine. Say if an advisory needs action. Up to 10 items.', when: 'Every day at 7:30 AM Asia/Manila' },
  trending: { what: 'GitHub trending repositories today in TypeScript, Rust, Kotlin, Dart and Python. 6 to 8 repos, each with one line on why it matters to an app developer.', when: 'Every day at 8:00 AM Asia/Manila' },
  hackathons: { what: 'hackathons, competitions and scholarships open to Filipino college IT students, online or in Metro Manila, with their deadline in the summary. Only ones still open. Up to 10.', when: 'Mondays and Thursdays at 8:00 AM Asia/Manila' },
  jobs: { what: 'internships and entry-level roles for IT students in Metro Manila or remote from the Philippines, posted in the last 3 days. Company and role in the headline. Up to 10.', when: 'Every weekday at 9:00 AM Asia/Manila' },
  research: { what: 'new arXiv papers from the last 2 days on small on-device language models, speech and audio, and human-computer interaction. Summary in plain words, at most 3 lines each. Up to 8.', when: 'Tuesdays and Fridays at 8:00 AM Asia/Manila' },
  gaming: { what: 'Unreal Engine updates, free or discounted assets on Fab, and major game development news from the last 2 days. Up to 8.', when: 'Every day at 6:00 PM Asia/Manila' },
  'ph-brief': { what: 'a Metro Manila morning brief: class suspensions, PAGASA weather and typhoon updates, MRT and LRT disruptions, and the 3 biggest national stories. Up to 8 items.', when: 'Every day at 6:00 AM Asia/Manila' },
  weekly: { what: 'a recap of public activity on github.com/jherobred this past week: repositories pushed, releases, open issues. One item per repository.', when: 'Sundays at 8:00 PM Asia/Manila' },
};

export const scheduleHint = (kind: PromptKind) => BRIEF[kind].when;

export function grokPrompt(kind: PromptKind, url: string): string {
  return [
    `Find ${BRIEF[kind].what}`,
    '',
    'Write the result as plain text, no markdown:',
    'Line 1: a short title for today\'s edition.',
    'Then one line per item, exactly: headline | summary | link',
    '',
    'Deliver it to Sorro by visiting a web page:',
    `1. Split the text into parts of at most 1500 characters, breaking only between lines. Count the parts: that is M.`,
    `2. For each part N, open this address, with the part URL-encoded after d=:`,
    `${url}&part=N&of=M&d=PART_TEXT`,
    '3. Each visit answers "Saved part N of M"; the last one answers "Saved: <title>". If a visit fails, retry it once.',
    'Do not include anything else in the parts.',
  ].join('\n');
}
