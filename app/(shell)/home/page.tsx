'use client';
/**
 * T1 Home: the assistant. Widgets across the top (H.widgets), then the fox's
 * chat (components/FoxChat.tsx) with the room to itself. No side panel here.
 */
import { useEffect, useState } from 'react';
import { WIDGETS, useWidgetOrder } from '@/components/widgets/Widgets';
import { FoxChat } from '@/components/FoxChat';
import './home.css';

const CONTEXT: Record<string, string> = { tasks: 'the user was looking at Tasks', calendar: 'the user was looking at the Calendar', notebooks: 'the user was looking at Notes', vault: 'the user was looking at Vault', news: 'the user was looking at News' };

/** Ask Sorro from the side panel lands here with the question and where it came from. */
function takeAsk(): { text: string; context?: string } | undefined {
  if (typeof location === 'undefined') return undefined;
  const p = new URLSearchParams(location.search);
  const q = p.get('ask');
  if (!q) return undefined;
  return { text: q, context: CONTEXT[p.get('ctx') ?? ''] };
}

export default function HomePage() {
  const widgets = useWidgetOrder();
  const [initial] = useState(takeAsk);
  useEffect(() => { if (initial) history.replaceState(null, '', '/home/'); }, [initial]);

  return <div className="hm" data-part="H">
    <h1 className="sr-only">Home</h1>
    {widgets.length > 0 && <div className="hm-widgets" data-part="H.widgets">{widgets.map(id => { const W = WIDGETS[id].Component; return <W key={id} />; })}</div>}
    <FoxChat variant="page" initial={initial} />
  </div>;
}
