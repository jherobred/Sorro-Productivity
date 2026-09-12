/** The word processor's fixed choices: colours, fonts, sizes, zoom steps and inserts. */

/** Ten columns: greys, then brights, then three lighter and three darker rows of each bright. */
export const TEXT_PALETTE: string[][] = [
  ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'],
  ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'],
  ['#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'],
  ['#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'],
  ['#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0'],
  ['#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'],
  ['#85200c', '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#0b5394', '#351c75', '#741b47'],
  ['#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763', '#20124d', '#4c1130'],
];

export const COLOR_NAMES: Record<string, string> = {
  '#000000': 'black', '#434343': 'dark grey 4', '#666666': 'dark grey 3', '#999999': 'dark grey 2', '#b7b7b7': 'dark grey 1',
  '#cccccc': 'grey', '#d9d9d9': 'light grey 1', '#efefef': 'light grey 2', '#f3f3f3': 'light grey 3', '#ffffff': 'white',
  '#980000': 'red berry', '#ff0000': 'red', '#ff9900': 'orange', '#ffff00': 'yellow', '#00ff00': 'green', '#00ffff': 'cyan',
  '#4a86e8': 'cornflower blue', '#0000ff': 'blue', '#9900ff': 'purple', '#ff00ff': 'magenta',
};

const TINTS = ['light 3', 'light 2', 'light 1', 'dark 1', 'dark 2', 'dark 3'];
const HUES = ['red berry', 'red', 'orange', 'yellow', 'green', 'cyan', 'cornflower blue', 'blue', 'purple', 'magenta'];
export function colorName(hex: string): string {
  const known = COLOR_NAMES[hex.toLowerCase()];
  if (known) return known;
  for (let row = 2; row < TEXT_PALETTE.length; row++) {
    const col = TEXT_PALETTE[row].indexOf(hex.toLowerCase());
    if (col >= 0) return `${TINTS[row - 2]} ${HUES[col]}`;
  }
  return hex;
}

/** Fonts that come with the operating system, and fonts loaded from Google Fonts when used. */
export type DocFont = { name: string; stack: string; web?: string };
export const FONTS: DocFont[] = [
  { name: 'Amatic SC', stack: '"Amatic SC", cursive', web: 'Amatic+SC:wght@400;700' },
  { name: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { name: 'Caveat', stack: 'Caveat, cursive', web: 'Caveat:wght@400;700' },
  { name: 'Comfortaa', stack: 'Comfortaa, sans-serif', web: 'Comfortaa:wght@400;700' },
  { name: 'Comic Sans MS', stack: '"Comic Sans MS", "Comic Sans", cursive' },
  { name: 'Courier New', stack: '"Courier New", Courier, monospace' },
  { name: 'EB Garamond', stack: '"EB Garamond", Garamond, serif', web: 'EB+Garamond:ital,wght@0,400;0,700;1,400;1,700' },
  { name: 'Georgia', stack: 'Georgia, serif' },
  { name: 'Impact', stack: 'Impact, Haettenschweiler, sans-serif' },
  { name: 'Lexend', stack: 'Lexend, sans-serif', web: 'Lexend:wght@400;700' },
  { name: 'Lobster', stack: 'Lobster, cursive', web: 'Lobster' },
  { name: 'Lora', stack: 'Lora, serif', web: 'Lora:ital,wght@0,400;0,700;1,400;1,700' },
  { name: 'Merriweather', stack: 'Merriweather, serif', web: 'Merriweather:ital,wght@0,400;0,700;1,400;1,700' },
  { name: 'Montserrat', stack: 'Montserrat, sans-serif', web: 'Montserrat:ital,wght@0,400;0,700;1,400;1,700' },
  { name: 'Nunito', stack: 'Nunito, sans-serif', web: 'Nunito:ital,wght@0,400;0,700;1,400;1,700' },
  { name: 'Oswald', stack: 'Oswald, sans-serif', web: 'Oswald:wght@400;700' },
  { name: 'Pacifico', stack: 'Pacifico, cursive', web: 'Pacifico' },
  { name: 'Playfair Display', stack: '"Playfair Display", serif', web: 'Playfair+Display:ital,wght@0,400;0,700;1,400;1,700' },
  { name: 'Roboto', stack: 'Roboto, Arial, sans-serif', web: 'Roboto:ital,wght@0,400;0,700;1,400;1,700' },
  { name: 'Roboto Mono', stack: '"Roboto Mono", monospace', web: 'Roboto+Mono:ital,wght@0,400;0,700;1,400;1,700' },
  { name: 'Spectral', stack: 'Spectral, serif', web: 'Spectral:ital,wght@0,400;0,700;1,400;1,700' },
  { name: 'Times New Roman', stack: '"Times New Roman", Times, serif' },
  { name: 'Trebuchet MS', stack: '"Trebuchet MS", sans-serif' },
  { name: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
];
export const DEFAULT_FONT = 'Arial';

const loaded = new Set<string>();
/**
 * Web fonts are fetched only when a document uses one or the font menu is
 * open. The Content Security Policy already allows fonts.googleapis.com for
 * styles and fonts.gstatic.com for the files. Offline, the stack's fallback shows.
 */
export function loadFonts(names: string[]) {
  if (typeof document === 'undefined') return;
  const wanted = FONTS.filter((font) => font.web && names.includes(font.name) && !loaded.has(font.name));
  if (!wanted.length) return;
  wanted.forEach((font) => loaded.add(font.name));
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?' + wanted.map((font) => 'family=' + font.web).join('&') + '&display=swap';
  document.head.append(link);
}

/** A font-family value as stored on text, back to the name it was chosen by. */
export function fontNameOf(family: string | null | undefined): string | null {
  if (!family) return null;
  const first = family.split(',')[0].trim().replace(/^["']|["']$/g, '');
  return FONTS.find((font) => font.name.toLowerCase() === first.toLowerCase())?.name ?? first;
}

export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 18, 24, 30, 36, 48, 60, 72, 96];

export const ZOOMS = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2];

export type ParagraphStyle = 'normal' | 'title' | 'subtitle' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
export const PARAGRAPH_STYLES: { id: ParagraphStyle; name: string; size: number; shortcut: string }[] = [
  { id: 'normal', name: 'Normal text', size: 11, shortcut: 'Ctrl+Alt+0' },
  { id: 'title', name: 'Title', size: 26, shortcut: '' },
  { id: 'subtitle', name: 'Subtitle', size: 15, shortcut: '' },
  { id: 'h1', name: 'Heading 1', size: 20, shortcut: 'Ctrl+Alt+1' },
  { id: 'h2', name: 'Heading 2', size: 16, shortcut: 'Ctrl+Alt+2' },
  { id: 'h3', name: 'Heading 3', size: 14, shortcut: 'Ctrl+Alt+3' },
  { id: 'h4', name: 'Heading 4', size: 12, shortcut: 'Ctrl+Alt+4' },
  { id: 'h5', name: 'Heading 5', size: 11, shortcut: 'Ctrl+Alt+5' },
  { id: 'h6', name: 'Heading 6', size: 11, shortcut: 'Ctrl+Alt+6' },
];

export const LINE_SPACINGS = [
  { value: '1', name: 'Single' },
  { value: '1.15', name: '1.15' },
  { value: '1.5', name: '1.5' },
  { value: '2', name: 'Double' },
];

export const BULLET_STYLES = [
  { value: 'disc', name: 'Filled circle' },
  { value: 'circle', name: 'Hollow circle' },
  { value: 'square', name: 'Square' },
];
export const NUMBER_STYLES = [
  { value: 'decimal', name: '1. 2. 3.' },
  { value: 'upper-alpha', name: 'A. B. C.' },
  { value: 'lower-alpha', name: 'a. b. c.' },
  { value: 'upper-roman', name: 'I. II. III.' },
  { value: 'lower-roman', name: 'i. ii. iii.' },
];

export const SPECIAL_CHARACTERS: { name: string; chars: string }[] = [
  { name: 'Arrows', chars: '←↑→↓↔↕⇐⇑⇒⇓⇔↩↪⟵⟶⤴⤵➔➜' },
  { name: 'Math', chars: '±×÷≠≈≤≥∞√∑∏∫∂∆∇∈∉∩∪⊂⊃∀∃¬∧∨°′″‰' },
  { name: 'Greek', chars: 'αβγδεζηθικλμνξοπρστυφχψωΓΔΘΛΞΠΣΦΨΩ' },
  { name: 'Currency', chars: '$€£¥₱₹₩₽¢₿' },
  { name: 'Punctuation', chars: '–—…•·§¶†‡©®™«»‹›“”‘’¿¡' },
  { name: 'Shapes', chars: '■□▲△▶▷●○◆◇★☆✓✔✗✘♠♣♥♦' },
];

export const EMOJI = '😀😃😄😁😆😅😂🙂😉😊😇🥰😍🤩😘😋😎🤓🧐🤔🤨😐😑😶🙄😏😴😌😛😜🤪😝🤗🤭🫡🤫😬😮😯😲😳🥺😢😭😤😠😡🤯😱😨😰😓🥳🥴😵🤒🤕👍👎👏🙌👀💪🙏✌️🤞👋💯🔥✨⭐🌟💡📌📎📚📖✏️📝✅❌⚠️❓❗💬🎯🏆🎉🎓📅⏰🧠💻📱☕🍀🌈☀️🌙❤️🧡💛💚💙💜🖤🤍';
