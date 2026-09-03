export interface OnboardingStep {
  title: string;
  description: string;
  targetSelector?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  icon: string;
  color: string;
  badge?: string;
  actionPrompt?: string;
  actionLabel?: string;
}

export interface TabOnboardingConfig {
  tabId: string;
  tabTitle: string;
  characterName: string;
  animal:
    | 'fox'
    | 'cat'
    | 'bear'
    | 'owl'
    | 'frog'
    | 'panda'
    | 'rabbit'
    | 'wolf'
    | 'shiba'
    | 'capybara'
    | 'dragon'
    | 'raccoon'
    | 'penguin'
    | 'otter';
  accentColor: string;
  steps: OnboardingStep[];
}

export const TAB_ONBOARDINGS: Record<string, TabOnboardingConfig> = {
  home: {
    tabId: 'home',
    tabTitle: 'Home',
    characterName: 'Sparky the Fox',
    animal: 'fox',
    accentColor: '#F0894A',
    steps: [
      {
        title: 'Study Companion',
        description: 'Your mascot tracks your daily activity and boosts your focus.',
        targetSelector: '[data-tour="home-buddy"]',
        placement: 'bottom',
        icon: 'spark',
        color: '#F0894A',
        actionPrompt: 'Tap Focus to start a quick study sprint',
        actionLabel: 'Launch Focus',
      },
      {
        title: 'Study Companion & Mascot',
        description: 'Track study streaks, level up your pet, and launch focus sprints.',
        targetSelector: '[data-tour="home-quests"]',
        placement: 'bottom',
        icon: 'spark',
        color: '#FFC24B',
        actionPrompt: 'Check companion status and streaks',
        actionLabel: 'Explore Hub',
      },
      {
        title: 'Today Timeline',
        description: 'A single unified stream of all your events, deadlines, and overdue tasks.',
        targetSelector: '[data-tour="home-timeline"]',
        placement: 'top',
        icon: 'clock',
        color: '#7C6CFF',
        actionPrompt: 'Tap any event to view schedule details',
        actionLabel: 'Explore Schedule',
      },
    ],
  },

  calendar: {
    tabId: 'calendar',
    tabTitle: 'Calendar',
    characterName: 'Chronos the Owl',
    animal: 'owl',
    accentColor: '#8E7BC4',
    steps: [
      {
        title: 'Perspective Switcher',
        description: 'Switch between month, week, day, agenda, and countdown views instantly.',
        targetSelector: '[data-tour="calendar-view-toggle"]',
        placement: 'bottom',
        icon: 'week',
        color: '#8E7BC4',
        actionPrompt: 'Tap a view mode button to toggle perspective',
        actionLabel: 'Toggle View',
      },
      {
        title: 'Interactive Grid',
        description: 'Click any time slot to schedule an event or drag to resize duration.',
        targetSelector: '[data-tour="calendar-grid"]',
        placement: 'top',
        icon: 'calendar',
        color: '#4FD1C5',
        actionPrompt: 'Click any slot on the grid to create an event',
        actionLabel: 'Try Slot',
      },
    ],
  },

  tasks: {
    tabId: 'tasks',
    tabTitle: 'Tasks',
    characterName: 'Dash the Wolf',
    animal: 'wolf',
    accentColor: '#52B788',
    steps: [
      {
        title: 'Horizon Buckets',
        description: 'Tasks are automatically organized into Today, Tomorrow, and Upcoming.',
        targetSelector: '[data-tour="tasks-columns"]',
        placement: 'bottom',
        icon: 'task',
        color: '#52B788',
        actionPrompt: 'Click a circle to check off a task or drag to reorder',
        actionLabel: 'Check Task',
      },
      {
        title: 'Completed Shelf',
        description: 'Collapse your finished tasks or tap to restore and undo anytime.',
        targetSelector: '[data-tour="tasks-completed-shelf"]',
        placement: 'top',
        icon: 'check',
        color: '#FF6B6B',
        actionPrompt: 'Tap to expand or hide completed archive',
        actionLabel: 'Toggle Shelf',
      },
    ],
  },

  notebooks: {
    tabId: 'notebooks',
    tabTitle: 'Notebooks',
    characterName: 'Scribe the Otter',
    animal: 'otter',
    accentColor: '#82593E',
    steps: [
      {
        title: 'Knowledge Shelf',
        description: 'Organize notes by subjects, nested folders, tags, and infinite canvases.',
        targetSelector: '[data-tour="notebooks-sidebar"]',
        placement: 'right',
        icon: 'files',
        color: '#82593E',
        actionPrompt: 'Select a notebook or canvas from the shelf',
        actionLabel: 'Browse Notes',
      },
      {
        title: 'Bilingual Markdown Editor',
        description: 'Type rich markdown, paste images, format equations, or link notes with [[wiki]].',
        targetSelector: '[data-tour="notebooks-editor"]',
        placement: 'left',
        icon: 'pen',
        color: '#7C6CFF',
        actionPrompt: 'Type in the editor to write and auto-save',
        actionLabel: 'Start Writing',
      },
    ],
  },

  habits: {
    tabId: 'habits',
    tabTitle: 'Habits',
    characterName: 'Bamboo the Panda',
    animal: 'panda',
    accentColor: '#38D6F2',
    steps: [
      {
        title: 'Flexible Tracking Views',
        description: 'Switch between a week, a rolling 30 days, and the full-year heatmap.',
        targetSelector: '[data-tour="habits-view-modes"]',
        placement: 'bottom',
        icon: 'week',
        color: '#38D6F2',
        actionPrompt: 'Tap a view mode to switch layouts',
        actionLabel: 'Switch Layout',
      },
      {
        title: 'One-Tap Ticking',
        description: 'Tap any square in a habit’s row to tick that day, earn XP, and hold your multiplier.',
        targetSelector: '[data-tour="habits-grid-cells"]',
        placement: 'top',
        icon: 'flame',
        color: '#FFC24B',
        actionPrompt: 'Tap any habit cell to record your daily tick',
        actionLabel: 'Tick Habit',
      },
    ],
  },

  gym: {
    tabId: 'gym',
    tabTitle: 'Gym',
    characterName: 'Koa the Bear',
    animal: 'bear',
    accentColor: '#B07A55',
    steps: [
      {
        title: 'Your week',
        description: 'The split across seven days, with today lit. Tap a day to change what it trains.',
        targetSelector: '[data-tour="gym-week"]',
        placement: 'bottom',
        icon: 'cal',
        color: '#FF6FA8',
        actionPrompt: 'Tap a day to set its routine',
        actionLabel: 'Open the plan',
      },
      {
        title: 'One button starts it',
        description: 'Everything else on this screen is reference. Starting the routine fills in the lifts below.',
        targetSelector: '[data-tour="gym-start"]',
        placement: 'bottom',
        icon: 'play',
        color: '#FF6FA8',
        actionPrompt: 'Start today’s routine',
        actionLabel: 'Start',
      },
      {
        title: 'Tap a lift for the movement',
        description: 'Two photographs and the real form notes — the grip, the angle, the tempo. Tap, do not press.',
        targetSelector: '[data-tour="gym-lifts"]',
        placement: 'top',
        icon: 'flame',
        color: '#FF6B6B',
        actionPrompt: 'Tap any lift to see how it is done',
        actionLabel: 'Open a movement',
      },
    ],
  },

  fuel: {
    tabId: 'fuel',
    tabTitle: 'Fuel',
    characterName: 'Koa the Bear',
    animal: 'bear',
    accentColor: '#7A8F3C',
    steps: [
      {
        title: 'The water column',
        description: 'It knows whether you are behind, on pace, or drinking too fast — and says which, with the reason.',
        targetSelector: '[data-tour="fuel-water"]',
        placement: 'bottom',
        icon: 'drop',
        color: '#34D9A0',
        actionPrompt: 'Tap a cup to log 250 ml',
        actionLabel: 'Log a cup',
      },
      {
        title: 'Meals as photographs',
        description: 'Tap one to edit it, including where you ate. The last tile adds a new plate.',
        targetSelector: '[data-tour="fuel-meals"]',
        placement: 'top',
        icon: 'food',
        color: '#A3E635',
        actionPrompt: 'Tap a meal to edit it',
        actionLabel: 'Edit a meal',
      },
    ],
  },

  money: {
    tabId: 'money',
    tabTitle: 'Money',
    characterName: 'Barnaby the Capybara',
    animal: 'capybara',
    accentColor: '#9A7150',
    steps: [
      {
        title: 'Runway Meter',
        description: 'Live calculation of your financial runway based on your burn rate.',
        targetSelector: '[data-tour="money-budget-ring"]',
        placement: 'bottom',
        icon: 'spark',
        color: '#52B788',
        actionPrompt: 'Check your runway days and active spending jars',
        actionLabel: 'View Runway',
      },
    ],
  },

  community: {
    tabId: 'community',
    tabTitle: 'Community',
    characterName: 'Pixel the Cat',
    animal: 'cat',
    accentColor: '#9AA6C4',
    steps: [
      {
        title: 'Social Hub',
        description: 'Switch between the Campus Feed, Direct Messages, and Active Challenges.',
        targetSelector: '[data-tour="community-nav-tabs"]',
        placement: 'bottom',
        icon: 'chat',
        color: '#9AA6C4',
        actionPrompt: 'Tap a tab to switch between Feed, Messages, & Challenges',
        actionLabel: 'Explore Tabs',
      },
      {
        title: 'Post & Story Composer',
        description: 'Share wins, study photos, questions, and 24-hour highlights with your campus.',
        targetSelector: '[data-tour="community-composer"]',
        placement: 'left',
        icon: 'plus',
        color: '#FF758F',
        actionPrompt: 'Tap Post to share an update or study photo',
        actionLabel: 'Create Post',
      },
    ],
  },

  challenges: {
    tabId: 'challenges',
    tabTitle: 'Challenges',
    characterName: 'Ignis the Dragon',
    animal: 'dragon',
    accentColor: '#FF6B6B',
    steps: [
      {
        title: 'Ranked RP Ladder',
        description: 'Compete in seasonal ladders from Bronze to Grandmaster by hitting your daily goals.',
        targetSelector: '[data-tour="challenges-ladder"]',
        placement: 'bottom',
        icon: 'trophy',
        color: '#FFC24B',
        actionPrompt: 'View your seasonal RP, win rate, and promotion requirements',
        actionLabel: 'View Ladder',
      },
      {
        title: 'Visual Live Trail',
        description: 'Watch your mascot and competitors race along the live mountain trail in real time.',
        targetSelector: '[data-tour="challenges-trail"]',
        placement: 'top',
        icon: 'flame',
        color: '#FF6B6B',
        actionPrompt: 'See who is leading the pack today',
        actionLabel: 'Inspect Trail',
      },
    ],
  },

  files: {
    tabId: 'files',
    tabTitle: 'Drive',
    characterName: 'Bandit the Raccoon',
    animal: 'raccoon',
    accentColor: '#636E80',
    steps: [
      {
        title: 'Cloud Storage & Folders',
        description: 'Upload lecture slides, PDFs, notes, and photos with instant previews.',
        targetSelector: '[data-tour="files-grid"]',
        placement: 'top',
        icon: 'files',
        color: '#4FD1C5',
        actionPrompt: 'Click any file to preview or download',
        actionLabel: 'Open Files',
      },
    ],
  },

  people: {
    tabId: 'people',
    tabTitle: 'People',
    characterName: 'Pebble the Penguin',
    animal: 'penguin',
    accentColor: '#22283A',
    steps: [
      {
        title: 'Campus Directory',
        description: 'Search classmates, follow friends, send direct messages, and invite to study groups.',
        targetSelector: '[data-tour="people-roster"]',
        placement: 'bottom',
        icon: 'search',
        color: '#7C6CFF',
        actionPrompt: 'Search for classmates or tap to add a contact',
        actionLabel: 'Find Friends',
      },
    ],
  },

  profile: {
    tabId: 'profile',
    tabTitle: 'Profile',
    characterName: 'Hop the Rabbit',
    animal: 'rabbit',
    accentColor: '#F0C7D4',
    steps: [
      {
        title: 'Public Face & Avatar',
        description: 'Customize your avatar, bio, campus handle, and custom story highlights.',
        targetSelector: '[data-tour="profile-header"]',
        placement: 'bottom',
        icon: 'pen',
        color: '#F0C7D4',
        actionPrompt: 'Customize your handle or share your profile link',
        actionLabel: 'Edit Profile',
      },
    ],
  },
};
