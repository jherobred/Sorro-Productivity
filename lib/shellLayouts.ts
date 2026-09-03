/**
 * The five shells, and the grouping the sidebar sorts twelve sections into.
 *
 * Shell.tsx and SettingsModal both read this, so the names on the settings
 * screen and the chrome they switch on can never drift apart.
 */

export type ShellLayout = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

export const SHELL_LAYOUTS: { id: ShellLayout; name: string; blurb: string }[] = [
  { id: 'L3', name: 'Grouped & Today', blurb: 'Twelve sections in four groups, and today follows you everywhere.' },
];

export const DEFAULT_SHELL: ShellLayout = 'L3';

export function isShellLayout(v: unknown): v is ShellLayout {
  return v === 'L3' || (typeof v === 'string' && SHELL_LAYOUTS.some((l) => l.id === v));
}

/** Which group each section sits in, and the order the groups are drawn. */
export type GroupName = 'Plan' | 'Think' | 'Self' | 'Social';

export const GROUP_ORDER: GroupName[] = ['Plan', 'Think', 'Self', 'Social'];

/** Each group takes the hue of the section that leads it. */
export const GROUP_HUE: Record<GroupName, string> = {
  Plan: '#8B7CFF',
  Think: '#B07CFF',
  Self: '#FF6FA8',
  Social: '#38BDF8',
};

export const SECTION_GROUP: Record<string, GroupName> = {
  home: 'Plan',
  calendar: 'Plan',
  tasks: 'Plan',
  projects: 'Plan',
  notebooks: 'Think',
  files: 'Think',
  habits: 'Self',
  gym: 'Self',
  fuel: 'Self',
  money: 'Self',
  community: 'Social',
  people: 'Social',
  profile: 'Social',
};

/**
 * Two of the five drop the sidebar entirely, so the three-state sidebar control
 * has nothing to act on and Shell must not draw it.
 */
export const HAS_SIDEBAR: Record<ShellLayout, boolean> = {
  L1: true, L2: false, L3: true, L4: false, L5: false,
};
