'use client';
/**
 * The split welcome: the fox and what Sorro is on one side, whatever the moment needs on the other.
 * Sign-in and the boot screen both use it, so opening the app never jumps between two layouts.
 */
import type { ReactNode } from 'react';
import { Fox } from './Fox';
import { Icon, type IconName } from './Icon';
import { Wordmark } from './Wordmark';
import pkg from '@/package.json';
import './welcome.css';

const FEATURES: { icon: IconName; text: string }[] = [
  { icon: 'book', text: 'Notes that hold every kind of page' },
  { icon: 'cal', text: 'A calendar you can just talk to' },
  { icon: 'task', text: 'Tasks with streaks and focus time' },
];

export function Welcome({ children, label }: { children: ReactNode; label: string }) {
  return <main className="wl" aria-label={label}>
    <section className="wl-brand" aria-label="Sorro">
      <div className="wl-brand-in">
        <span className="wl-fox"><Fox pose="sit" size={88} tone="accent" /></span>
        <Wordmark size="lg" word fox={false} />
        <p className="wl-tag">Your notes, calendar and tasks, with a fox who helps.</p>
        <ul className="wl-feats">{FEATURES.map(f => <li key={f.icon}><span className="wl-ico"><Icon name={f.icon} size={16} /></span><span>{f.text}</span></li>)}</ul>
      </div>
    </section>
    <section className="wl-side">
      <div className="wl-side-in">{children}</div>
      <p className="wl-ver">Sorro {pkg.version}</p>
    </section>
  </main>;
}
