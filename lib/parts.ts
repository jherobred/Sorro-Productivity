/** Every region's short code. Shown on screen by Settings → Show part names, so a region can be named in conversation. */
export const PARTS = {
  'S.side': 'Sidebar',
  'S.top': 'Top strip',
  'S.bar': 'Bottom bar',
  H: 'Home',
  N: 'Notes',
  C: 'Calendar',
  T: 'Tasks',
  V: 'Vault',
} as const;
export type Part = keyof typeof PARTS;
