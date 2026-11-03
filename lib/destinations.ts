export const DESTINATIONS = [
  { id: 'home', name: 'Home', icon: 'home', part: 'H' },
  { id: 'notebooks', name: 'Notes', icon: 'book', part: 'N' },
  { id: 'calendar', name: 'Calendar', icon: 'cal', part: 'C' },
  { id: 'tasks', name: 'Tasks', icon: 'task', part: 'T' },
  { id: 'vault', name: 'Vault', icon: 'folder', part: 'V' },
] as const;
export const activePath = (path: string) => DESTINATIONS.some(d => path.split('/')[1] === d.id);
