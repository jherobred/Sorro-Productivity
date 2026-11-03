export type ThemePref = 'light' | 'dark' | 'system';

export function resolveTheme(pref: ThemePref, systemDark: boolean): 'light' | 'dark' {
  if (pref === 'light' || pref === 'dark') return pref;
  return systemDark ? 'dark' : 'light';
}

/** The theme on screen right now. Reads the OS, so call it while rendering, not at module load. */
export function themeIsDark(pref: ThemePref): boolean {
  return resolveTheme(pref, typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) === 'dark';
}
