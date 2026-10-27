export const DESTINATIONS = [
  { id: 'home', name: 'Today', icon: 'home' },
  { id: 'notebooks', name: 'Notebooks', icon: 'book' },
  { id: 'tasks', name: 'Tasks', icon: 'task' },
  { id: 'calendar', name: 'Calendar', icon: 'cal' },
  { id: 'board', name: 'Board', icon: 'proj' },
  { id: 'focus', name: 'Focus', icon: 'focus' },
  { id: 'links', name: 'Links', icon: 'link' },
  { id: 'habits', name: 'Habits', icon: 'habit' },
  { id: 'fitness', name: 'Fitness', icon: 'gym' },
  { id: 'fuel', name: 'Fuel', icon: 'food' },
  { id: 'plates', name: 'Plate diary', icon: 'cup' },
  { id: 'money', name: 'Money', icon: 'money' },
  { id: 'memories', name: 'Memories', icon: 'photo' },
] as const;
/** Old routes that still load, only to send you to their new place. Projects moved into My Tasks. */
const MOVED = ['gym', 'body', 'projects'];
export const activePath = (path: string) => DESTINATIONS.some(d => path.split('/')[1] === d.id) || MOVED.includes(path.split('/')[1]);
/** A saved nav pick from before a tab was renamed. */
export const currentId = (id: string) => (id === 'gym' ? 'fitness' : id === 'projects' ? 'tasks' : id);
