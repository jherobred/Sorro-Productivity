'use client';

export function SelfViews({ detailed, onChange, daily = 'Today', details = 'History & insights' }: {
  detailed: boolean; onChange: (value: boolean) => void; daily?: string; details?: string;
}) {
  return <div className="self-views" role="group" aria-label="Workspace view">
    <button type="button" aria-pressed={!detailed} onClick={()=>onChange(false)}>{daily}</button>
    <button type="button" aria-pressed={detailed} onClick={()=>onChange(true)}>{details}</button>
  </div>;
}
