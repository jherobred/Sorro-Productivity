export const DESTINATIONS = [
  { id: 'home', name: 'Home', icon: 'home', part: 'H', phoneBar: true },
  { id: 'notebooks', name: 'Notes', icon: 'book', part: 'N', phoneBar: true },
  { id: 'calendar', name: 'Calendar', icon: 'cal', part: 'C', phoneBar: true },
  { id: 'tasks', name: 'Tasks', icon: 'task', part: 'T', phoneBar: true },
  { id: 'vault', name: 'Vault', icon: 'folder', part: 'V', phoneBar: false },
] as const;
export const activePath = (path: string) => DESTINATIONS.some(d => path.split('/')[1] === d.id);
