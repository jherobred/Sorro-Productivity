'use client';

/**
 * 24×24 stroke paths rendered as a CSS mask on a <span>, so the icon inherits a
 * colour prop. Paths and technique are verbatim from Basedly.dc.html (ICONS +
 * icon()). README is explicit: do not swap in a different icon library — the
 * 2px round-cap weight is part of the look.
 */

export const ICONS = {
  cursor: 'M4 3 20 13l-7 1-4 7z',
  camera: 'M4 6h4l1.5-3h5L16 6h4v14H4zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  arrowRight: 'M4 12h16M13 5l7 7-7 7',
  arrowR: 'M4 12h16M13 5l7 7-7 7',
  panelLeft: 'M3 4h18v16H3zM9 4v16M6 9v6',
  chevR: 'm9 5 7 7-7 7',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19',
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
  pause: 'M8 5v14M16 5v14',
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
  // Document editor. Same 2px round stroke as everything above.
  bold: 'M7 5h5.5a3.5 3.5 0 0 1 0 7H7zM7 12h6.5a3.5 3.5 0 0 1 0 7H7z',
  italic: 'M11 5h7M6 19h7M14.5 5l-5 14',
  underline: 'M7 4v7a5 5 0 0 0 10 0V4M5 20h14',
  strike: 'M4 12h16M16.5 7.4A4.5 3.4 0 0 0 12 5c-2.6 0-4.5 1.4-4.5 3.3 0 1.2.8 2.2 2.3 2.7M7.5 16.6A4.5 3.4 0 0 0 12 19c2.6 0 4.5-1.4 4.5-3.3 0-.6-.2-1.2-.6-1.7',
  textColor: 'M6.5 16 12 4l5.5 12M8.6 11.5h6.8',
  highlighter: 'M14.5 4.5l5 5L12 17H7v-5zM4 20.5h16',
  alignLeft: 'M4 6h16M4 10h10M4 14h16M4 18h10',
  alignCenter: 'M4 6h16M7 10h10M4 14h16M7 18h10',
  alignRight: 'M4 6h16M10 10h10M4 14h16M10 18h10',
  alignJustify: 'M4 6h16M4 10h16M4 14h16M4 18h16',
  lineSpacing: 'M11 6h9M11 12h9M11 18h9M5.5 4v16M3.5 6.5l2-2.5 2 2.5M3.5 17.5l2 2.5 2-2.5',
  listBullet: 'M9.5 6H20M9.5 12H20M9.5 18H20M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  listNumber: 'M10 6h10M10 12h10M10 18h10M4 4.5h1.5V9M4 9h3M4 14.2a1.5 1.5 0 0 1 3 .3c0 1.2-3 2.2-3 3.5h3',
  listCheck: 'M11 6h9M11 12h9M11 18h9M3.5 6l1.6 1.6L8 4.6M3.5 12l1.6 1.6L8 10.6M4 16.5h3v3H4z',
  indentMore: 'M4 5h16M11 10h9M11 14h9M4 19h16M4 9l3.5 3L4 15',
  indentLess: 'M4 5h16M11 10h9M11 14h9M4 19h16M7.5 9 4 12l3.5 3',
  clearFormat: 'M5 5h12M11 5 8.5 19M14 14l5 5M19 14l-5 5',
  print: 'M7 9V4h10v5M6.5 17H4.5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z',
  paintFormat: 'M5 4h11v5H5zM16 6.5h3v5h-8v3M10 14.5h2V21h-2z',
  comment: 'M4 5h16v11H9.5L5 20v-4H4zM12 8v5M9.5 10.5h5',
  table: 'M3.5 5h17v14h-17zM3.5 10h17M3.5 14.5h17M9 5v14M14.5 5v14',
  pageBreak: 'M6 3v5h12V3M6 21v-5h12v5M3 12h2M8 12h2M14 12h2M19 12h2',
  sigma: 'M17.5 5h-11l6 7-6 7h11',
  superscript: 'M3.5 8.5 11 18M11 8.5 3.5 18M15.5 9a2 2 0 1 1 3.4 1.4L15.5 14h4',
  subscript: 'M3.5 6 11 15.5M11 6l-7.5 9.5M15.5 16a2 2 0 1 1 3.4 1.4L15.5 21h4',
  emoji: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01',
  omega: 'M4.5 19H9v-2.3a6.5 6.5 0 1 1 6 0V19h4.5',
  spellcheck: 'M3.5 16 7.5 5l4 11M5 12h5M13 15.5l3 3 5.5-6.5',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  scissors: 'M6 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM6 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM20 5 8.1 15.9M14.5 13.5 20 19M8.1 8.1 11.5 11',
  clipboard: 'M9 3.5h6v3H9zM8 5H5.5v15.5h13V5H16',
  suggest: 'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17zM13.5 20H20',
  ruler: 'M3 8h18v8H3zM7 8v3M11 8v4.5M15 8v3M19 8v4.5',
  docPage: 'M7 3h7l5 5v13H7zM14 3v5h5M10 12h6M10 15h6M10 18h4',
  outline: 'M4 6h16M8 11h12M8 16h12M4 11h.01M4 16h.01',
  caseText: 'M3 18 7 6l4 12M4.4 14h5.2M14 12a3 3 0 0 1 6 0v6M14 15.5c0-1.4 1.3-2.5 3-2.5h3',
  menuSearch: 'M4 6h9M4 12h6M4 18h9M16.5 9a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM21 20l-2-2',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  download2: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14',
  reply: 'M10 7 5 12l5 5M5 12h9a5 5 0 0 1 5 5v1',
  moreVert: 'M12 6h.01M12 12h.01M12 18h.01',
  horizontalLine: 'M4 12h16',
  minimize: 'M9 4v5H4M15 4v5h5M4 15h5v5M20 15h-5v5',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  mapPin: 'M12 21s-6.5-5.4-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.6-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  hourglass: 'M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9',
  crop: 'M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14',
  rotate: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
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
