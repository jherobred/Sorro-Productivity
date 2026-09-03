'use client';

/**
 * 24×24 stroke paths rendered as a CSS mask on a <span>, so the icon inherits a
 * colour prop. Paths and technique are verbatim from Basedly.dc.html (ICONS +
 * icon()). README is explicit: do not swap in a different icon library — the
 * 2px round-cap weight is part of the look.
 */

export const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  cal: 'M3 5h18v16H3zM8 3v4M16 3v4M3 11h18',
  task: 'M3 3h18v18H3zm5 9 3 3 5-6',
  book: 'M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2zM8 3v18',
  proj: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 11v5M12 11v3M16 11v6',
  habit: 'M13 2 4 14h7l-1 8 9-12h-7z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  cup: 'M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 9h2a2 2 0 0 1 0 5h-2M4 21h13',
  walk: 'M13 4a1.6 1.6 0 1 0 0-.01M12 8l-2 5 3 2 1 6M10 13l-3 1M14 10l3 2',
  mind: 'M12 4a6 6 0 0 0-4 10.5V19h8v-4.5A6 6 0 0 0 12 4zM10 21h4',
  focus: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  star: 'M12 3l2.6 5.7 6.2.7-4.6 4.2 1.3 6.1L12 16.8 6.5 19.7l1.3-6.1L3.2 9.4l6.2-.7z',
  upload: 'M12 17V5M7 10l5-5 5 5M4 19h16',
  download: 'M12 5v12M7 12l5 5 5-5M4 19h16',
  folderPlus: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 12v5M9.5 14.5h5',
  dots: 'M6 12h.01M12 12h.01M18 12h.01',
  heart: 'M12 20s-7-4.5-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 15.5 12 20 12 20z',
  money: 'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 13h2',
  files: 'M8 3h6l4 4v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM14 3v4h4',
  people: 'M9 5a3.2 3.2 0 1 0 0 6.4A3.2 3.2 0 0 0 9 5zM3 20a6 6 0 0 1 12 0M17 11a3 3 0 1 0-1.5-5.6M21 20a5 5 0 0 0-3-4.6',
  more: 'M4 7h16M4 12h16M4 17h16',
  set: 'M12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4zM3 12h2M19 12h2M12 3v2M12 19v2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6',
  edit: 'M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12H9',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h5',
  sort: 'M7 4v16M7 4 4 7.5M7 4l3 3.5M17 20V4M17 20l-3-3.5M17 20l3-3.5',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  week: 'M3 5h18v16H3zM3 11h18M9 11v10M15 11v10',
  day: 'M3 5h18v16H3zM3 11h18M8 3v4M16 3v4',
  month: 'M3 5h18v16H3zM3 11h18M8 3v4M16 3v4M9 11v10M15 11v10M3 16h18',
  agenda: 'M4 6h16M4 12h16M4 18h16',
  photo: 'M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6M8 9.5a1 1 0 1 0 0-.01',
  text: 'M4 6h16M4 12h12M4 18h8',
  chev: 'm9 6 6 6-6 6',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  filter: 'M4 5h16l-6 7v6l-4 2v-8z',
  archive: 'M3 7h18v3H3zM5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9M9.5 14h5',
  bookPlus: 'M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM12 9v6M9 12h6',
  taskPlus: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8.5v7M8.5 12h7',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8',
  image: 'M3 5h18v14H3zM3 15l5-4 4 3 3-2 6 5',
  pen: 'M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17zM14.5 6.5l3 3',
  food: 'M6 3v6a2 2 0 0 0 4 0V3M8 11v10M16.5 3c-1.3 1.9-2 3.8-2 5.6 0 1.4.9 2.4 2 2.4s2-1 2-2.4c0-1.8-.7-3.7-2-5.6zM16.5 11v10',
  gym: 'M3 9v6M6 6.5v11M9.5 12h5M18 6.5v11M21 9v6',
  code: 'm8 8-5 4 5 4M16 8l5 4-5 4M13.5 4.5l-3 15',
  play: 'M7 4.5v15l13-7.5z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  chevron: 'm9 6 6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z',
  drop: 'M12 3c3.5 4.2 5.5 7 5.5 9.6A5.5 5.5 0 0 1 6.5 12.6C6.5 10 8.5 7.2 12 3z',
  steps: 'M7 4h3v7a3 3 0 0 1-3 3H6a2 2 0 0 1-2-2V9a5 5 0 0 1 3-5zM17 8h3v7a3 3 0 0 1-3 3h-1a2 2 0 0 1-2-2v-3a5 5 0 0 1 3-5zM6 17v3M17 21v-3',
  scale: 'M12 4v3M5 8h14l2 8a5 5 0 0 1-9.9 1H12M5 8l-2 8a5 5 0 0 0 9.9 1',
  chat: 'M21 12a8 8 0 0 1-8 8H4l2.2-3A8 8 0 1 1 21 12z',
  flame: 'M12 3c0 3-3 4-3 7a3 3 0 0 0 6 0c0-1-.4-1.8-1-2.6 2.6 1.2 4 3.3 4 5.6a6 6 0 1 1-12 0C6 8.5 9 6 12 3z',
  up: 'M12 20V5M6 11l6-6 6 6',
  bookmark: 'M6 3h12v18l-6-4.5L6 21z',
  share: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V3M8 7l4-4 4 4',
  trophy: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M9 20h6M12 14v6',
  bell: 'M18 16v-5a6 6 0 1 0-12 0v5l-2 3h16zM10 21a2 2 0 0 0 4 0',
  link: 'M10.5 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L12 6.3M13.5 10.5a4 4 0 0 0-5.7 0L5 13.3a4 4 0 0 0 5.7 5.7L12 17.7',
  heading: 'M5 5v14M13 5v14M5 12h8M17 7l2.5-1V19',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  quote: 'M9 7H5v6h4l-2 4M19 7h-4v6h4l-2 4',
  check: 'M4 12.5 9 18 20 6',
  minus: 'M5 12h14',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  refresh: 'M20.5 11a8.5 8.5 0 1 0-.9 4.6M20.5 5v6h-6',
  plug: 'M9 3v6M15 3v6M6 9h12v2.5a6 6 0 0 1-12 0zM12 17.5V21',
  zoomIn: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5M11 8.5v5M8.5 11h5',
  zoomOut: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5M8.5 11h5',
  layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5',
  pin: 'M12 21v-6.5M8 3h8l-1.2 6L18 12H6l3.2-3z',
  eye: 'M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  close: 'M6 6l12 12M18 6 6 18',
  send: 'M4.5 12 20 4.5 16.5 20l-5-5-3.5 4z',
  flag: 'M5 21V4h13l-2 4 2 4H5',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  palette: 'M12 3a9 9 0 0 0 0 18 2 2 0 0 0 2-2c0-1.4 1-2 2-2h1a4 4 0 0 0 4-4c0-5-4-10-9-10zM7.5 11h.01M10.5 7.5h.01M15 9h.01',
  hand: 'M9 11V5.5a1.5 1.5 0 0 1 3 0V11M12 11V4.5a1.5 1.5 0 0 1 3 0V11M15 11V6.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6v-3a1.5 1.5 0 0 1 3 0',
  // The toothed cog everyone recognises as settings. `set` is a thin asterisk
  // of spokes that reads as a sun or a sparkle at 16px, which is why it kept
  // being missed.
  cog: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-1.8-1L14.5 2.5h-4l-.8 2.6a7.6 7.6 0 0 0-1.8 1l-2.3-1-2 3.4L5.6 11a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 1.8 1l.8 2.6h4l.8-2.6a7.6 7.6 0 0 0 1.8-1l2.3 1 2-3.4z',
  collapse: 'M15 4v16M4 5h7M4 12h7M4 19h7M20 4v16',
  expand: 'M9 4v16M4 5h2M4 12h2M4 19h2M20 4v16M12 9l3 3-3 3',
  phone: 'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm6 17h.01',
  monitor: 'M3 4h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm5 16h8m-4-3v3',
  chevronDown: 'm6 9 6 6 6-6',
  chevronUp: 'm18 15-6-6-6 6',
  chevronLeft: 'm15 18-6-6 6-6',
  chevronRight: 'm9 6 6 6-6 6',
  tag: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01',
} as const;

export type IconName = keyof typeof ICONS;

function maskUrl(name: IconName): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' +
    ICONS[name] +
    '"/></svg>';
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

export function Icon({
  name,
  color = 'currentColor',
  size = 16,
  style,
}: {
  name: IconName;
  color?: string;
  size?: number;
  style?: React.CSSProperties;
}) {
  const mask = maskUrl(name);
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        flex: 'none',
        backgroundColor: color,
        WebkitMaskImage: mask,
        maskImage: mask,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        ...style,
      }}
    />
  );
}
