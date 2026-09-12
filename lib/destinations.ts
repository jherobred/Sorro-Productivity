export const DESTINATIONS = [
  { id: 'home', name: 'Today', icon: 'home' },
  { id: 'notebooks', name: 'Notebooks', icon: 'book' },
  { id: 'tasks', name: 'Tasks', icon: 'task' },
  { id: 'calendar', name: 'Calendar', icon: 'cal' },
  { id: 'focus', name: 'Focus', icon: 'focus' },
  { id: 'habits', name: 'Habits', icon: 'habit' },
  { id: 'gym', name: 'Gym', icon: 'heart' },
  { id: 'fuel', name: 'Fuel', icon: 'food' },
  { id: 'money', name: 'Money', icon: 'money' },
] as const;
export const activePath = (path: string) => DESTINATIONS.some(d => path.split('/')[1] === d.id);
