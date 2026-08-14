'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useTasks } from '@/lib/tasks';
import { Icon } from '@/components/Icon';
import { SECHUE } from '@/lib/pal';

export default function HomePage() {
  const [name, setName] = useState('');
  const { data: tasks = [] } = useTasks();

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase
        .from('bd_profiles')
        .select('name')
        .eq('user_id', data.user.id)
        .maybeSingle();
      setName(p?.name ?? data.user.email?.split('@')[0] ?? '');
    });
  }, []);

  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const greeting = name ? `${part}, ${name}.` : `${part}.`;
  const open = tasks.filter((t) => !t.done).length;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Per-character fade-in, staggered ~0.02–0.05s per char. */}
      <h1
        style={{
          fontSize: 32,
          fontWeight: 800,
          letterSpacing: '-.03em',
          textWrap: 'pretty',
          marginBottom: 24,
        }}
      >
        {greeting.split('').map((ch, i) => (
          <span
            key={i}
            className="fade"
            style={{ animationDelay: `${i * 0.025}s`, whiteSpace: 'pre' }}
          >
            {ch}
          </span>
        ))}
      </h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'var(--cols)',
          gap: 14,
        }}
      >
        <Tile title="Tasks" icon="task" hue={SECHUE.tasks} value={String(open)} label="open" />
      </div>

      <p style={{ marginTop: 26, fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.6 }}>
        Home tiles land next — up-next countdown, today’s schedule, habit rings, money ring,
        project board and quick capture.
      </p>
    </div>
  );
}

function Tile({
  title,
  icon,
  hue,
  value,
  label,
}: {
  title: string;
  icon: 'task';
  hue: string;
  value: string;
  label: string;
}) {
  return (
    <div
      className="rise"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: 14,
        boxShadow: 'var(--sh)',
        padding: 18,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Icon name={icon} size={14} color={hue} />
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '.11em',
            textTransform: 'uppercase',
            color: 'var(--tx3)',
          }}
        >
          {title}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
        <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.03em' }}>{value}</span>
        <span style={{ fontSize: 11.5, color: 'var(--tx2)', fontWeight: 600 }}>{label}</span>
      </div>
    </div>
  );
}
