/** Source marks stay legible on arbitrary event colors. */
export function CalendarSourceIcon({ source }: { source?: string | null }) {
  if (source !== 'gcal_ics' && source !== 'google' && source !== 'canvas_lms') return null;
  const canvas = source === 'canvas_lms';
  return <span className="cal-source-icon" role="img" aria-label={canvas ? 'Canvas' : 'Google Calendar'} title={canvas ? 'Canvas' : 'Google Calendar'}>
    {canvas ? <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" fill="#e13d3a"/>
      {Array.from({ length: 8 }, (_, i) => <g key={i} transform={`rotate(${i * 45} 12 12)`} fill="#e13d3a"><circle cx="12" cy="3" r="1.6"/><circle cx="12" cy="6.7" r="1.1"/></g>)}
    </svg> : <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285f4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36Z"/>
      <path fill="#34a853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.13H3.06v2.59A10 10 0 0 0 12 22Z"/>
      <path fill="#fbbc05" d="M6.4 13.91a6 6 0 0 1 0-3.82V7.5H3.06a10 10 0 0 0 0 9l3.34-2.59Z"/>
      <path fill="#ea4335" d="M12 5.96c1.47 0 2.79.51 3.82 1.51l2.86-2.86A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.5l3.34 2.59C7.19 7.72 9.4 5.96 12 5.96Z"/>
    </svg>}
  </span>;
}
