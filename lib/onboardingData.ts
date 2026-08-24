import { Animal } from './mascot';
import { IconName } from '@/components/Icon';
import { PAL } from './pal';

export type OnboardingStep = {
  title: string;
  subtitle: string;
  badge?: string;
  icon: IconName;
  color: string;
  description: string;
  bulletPoints: string[];
  proTip?: string;
  shortcut?: string;
  targetSelector?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
};

export type TabOnboardingConfig = {
  tabId: string;
  tabTitle: string;
  characterName: string;
  animal: Animal;
  greeting: string;
  accentColor: string;
  steps: OnboardingStep[];
  actionLabel?: string;
  actionRoute?: string;
};

export const TAB_ONBOARDINGS: Record<string, TabOnboardingConfig> = {
  home: {
    tabId: 'home',
    tabTitle: 'Mission Control',
    characterName: 'Buddy the Raccoon',
    animal: 'raccoon',
    greeting: 'Welcome to your daily mission control deck!',
    accentColor: PAL.indigo,
    steps: [
      {
        title: 'Study Buddy Companion',
        subtitle: 'Your personal momentum co-pilot',
        badge: 'Companion',
        icon: 'spark',
        color: PAL.indigo,
        description: 'Your companion levels up as you complete tasks and habits throughout the day. Pet or check in on your buddy anytime!',
        bulletPoints: [
          'Earn XP by completing daily objectives and maintaining streaks',
          'Companion mood and animations react to your activity level',
          'Quick actions to start a focus timer or log reflections',
        ],
        targetSelector: '[data-tour="home-buddy"]',
        placement: 'bottom',
        proTip: 'A bright, happy companion means you are on a winning streak!',
      },
      {
        title: 'Daily RPG Quests',
        subtitle: 'Complete daily objectives for Ladder RP',
        badge: 'Level Up',
        icon: 'trophy',
        color: PAL.amber,
        description: 'Claim daily quest rewards to boost your season RP and climb the community ranks.',
        bulletPoints: [
          'Habit Warrior: Tick at least 2 habits today',
          'Task Slayer: Complete 2 to-dos today',
          'Brain Power: Capture a quick study thought or note',
        ],
        targetSelector: '[data-tour="home-quests"]',
        placement: 'top',
        proTip: 'Claiming quests gives instant bonus XP to your companion.',
      },
      {
        title: 'Timeline & Today’s Schedule',
        subtitle: 'Stay on top of lectures and deadlines',
        badge: 'Schedule',
        icon: 'cal',
        color: PAL.mint,
        description: 'See everything scheduled for today with countdowns and active class status indicators.',
        bulletPoints: [
          'Live timeline showing active and upcoming events',
          '1-tap to jump directly into calendar time slots',
          'Exam and assignment badges highlighting urgent deadlines',
        ],
        targetSelector: '[data-tour="home-timeline"]',
        placement: 'bottom',
        shortcut: 'G then H to return Home anytime',
      },
    ],
    actionLabel: 'Explore Dashboard',
    actionRoute: '/home/',
  },

  calendar: {
    tabId: 'calendar',
    tabTitle: 'Time Architecture',
    characterName: 'Athena the Owl',
    animal: 'owl',
    greeting: 'Let’s orchestrate your classes, exams, and deep work blocks!',
    accentColor: PAL.mint,
    steps: [
      {
        title: 'Day, Week & Month Views',
        subtitle: 'Switch your time perspective instantly',
        badge: 'Views',
        icon: 'cal',
        color: PAL.mint,
        description: 'Toggle effortlessly between high-level monthly overviews and granular weekly hour grids.',
        bulletPoints: [
          'Month view for deadlines and exam dates',
          'Week view for lecture blocks and recurring classes',
          'Day focus for deep-work Pomodoro blocks',
        ],
        targetSelector: '[data-tour="calendar-view-toggle"]',
        placement: 'bottom',
      },
      {
        title: 'Interactive Time Slots',
        subtitle: 'Click and drag to schedule events',
        badge: 'Time Blocks',
        icon: 'clock',
        color: PAL.sky,
        description: 'Click any open hour slot to drop a class block or study session. Drag to adjust duration.',
        bulletPoints: [
          'Color-code events by category (Classes, Personal, Org)',
          'All-day tray for exams and full-day milestones',
          'Select any event and press Backspace to quickly delete with undo',
        ],
        targetSelector: '[data-tour="calendar-grid"]',
        placement: 'top',
        shortcut: 'Backspace / Delete on selected event to delete',
      },
    ],
    actionLabel: 'Plan My Week',
    actionRoute: '/calendar/',
  },

  tasks: {
    tabId: 'tasks',
    tabTitle: 'Momentum Engine',
    characterName: 'Rusty the Fox',
    animal: 'fox',
    greeting: 'Turn overwhelming to-dos into achievable daily wins!',
    accentColor: PAL.coral,
    steps: [
      {
        title: '3-Column Time Horizons',
        subtitle: 'Due Today, Tomorrow, and Later',
        badge: 'Kanban Flow',
        icon: 'task',
        color: PAL.coral,
        description: 'Stay ahead of deadlines by categorizing to-dos into natural time horizons with priority rings.',
        bulletPoints: [
          'Priority rings (High coral, Medium amber, Low neutral)',
          'Star critical assignments to pin them to the top',
          'Drag and drop tasks between horizon columns',
        ],
        targetSelector: '[data-tour="tasks-columns"]',
        placement: 'bottom',
        shortcut: 'Press T anywhere to create a task',
      },
      {
        title: 'Completed Shelf & Undo',
        subtitle: 'Zero clutter with 1-tap restore',
        badge: 'Zero Clutter',
        icon: 'check',
        color: PAL.mint,
        description: 'Completed tasks tuck neatly into an expandable shelf so your active board remains crisp.',
        bulletPoints: [
          'Collapsible shelf keeping finished items out of view',
          '1-tap checkbox to restore completed items back to active',
          'Keeps historic record of your finished achievements',
        ],
        targetSelector: '[data-tour="tasks-completed-shelf"]',
        placement: 'top',
        proTip: 'Collapse the completed shelf when you want full focus on remaining tasks.',
      },
    ],
    actionLabel: 'View To-Dos',
    actionRoute: '/tasks/',
  },

  notebooks: {
    tabId: 'notebooks',
    tabTitle: 'Knowledge Vault',
    characterName: 'Bao the Panda',
    animal: 'panda',
    greeting: 'Welcome to your second brain for lectures, research, and flashcards!',
    accentColor: PAL.violet,
    steps: [
      {
        title: 'Subject Tree & Notebooks',
        subtitle: 'Organize by Term and Subject',
        badge: 'Vault',
        icon: 'book',
        color: PAL.violet,
        description: 'Structure your notes by academic term, course codes, and lecture chapters with custom colors.',
        bulletPoints: [
          'Group notes by course subjects and syllabus modules',
          'Instant full-text search across all notes and pages',
          'Offline resilience with auto-sync to cloud',
        ],
        targetSelector: '[data-tour="notebooks-sidebar"]',
        placement: 'right',
      },
      {
        title: 'Rich Editor & Slash Commands',
        subtitle: 'Block-based editing with media & math',
        badge: 'Editor',
        icon: 'spark',
        color: PAL.amber,
        description: 'Type “/” anywhere to insert headings, checklists, code blocks, tables, callouts, and math formulas.',
        bulletPoints: [
          'Notion-style block manipulation and formatting',
          'Paste images, lecture slides, and diagram attachments',
          'Generate active-recall flashcard decks from your notes',
        ],
        targetSelector: '[data-tour="notebooks-editor"]',
        placement: 'top',
        shortcut: 'Type “/” to open the block command menu',
      },
    ],
    actionLabel: 'Open Notebooks',
    actionRoute: '/notebooks/',
  },

  projects: {
    tabId: 'projects',
    tabTitle: 'Project Velocity',
    characterName: 'Ghost the Wolf',
    animal: 'wolf',
    greeting: 'Coordinate group assignments, capstones, and personal projects!',
    accentColor: PAL.indigo,
    steps: [
      {
        title: 'Visual Kanban Boards',
        subtitle: 'Track milestones from ideation to delivery',
        badge: 'Kanban',
        icon: 'proj',
        color: PAL.indigo,
        description: 'Manage complex multi-person projects with milestone checklists, progress bars, and status columns.',
        bulletPoints: [
          'Card checklists that automatically drive the completion percentage',
          'Color-coded project themes and category tags',
          'Attach assets, documents, and references directly to cards',
        ],
        targetSelector: '[data-tour="projects-board"]',
        placement: 'bottom',
      },
    ],
    actionLabel: 'Launch Projects',
    actionRoute: '/projects/',
  },

  habits: {
    tabId: 'habits',
    tabTitle: 'Atomic Discipline',
    characterName: 'Mochi the Cat',
    animal: 'cat',
    greeting: 'Stack daily micro-habits and build legendary momentum!',
    accentColor: PAL.pink,
    steps: [
      {
        title: 'Grid View Switcher',
        subtitle: 'Week, Day, Year, and Analytics perspectives',
        badge: 'Views',
        icon: 'grid',
        color: PAL.pink,
        description: 'Switch between week tick cells, single-day focus cards, whole-year heatmaps, and consistency charts.',
        bulletPoints: [
          'Week grid for quick daily ticking across all habits',
          'Day focus mode for timers and detail logging',
          'Year heatmap celebrating your 365-day consistency',
        ],
        targetSelector: '[data-tour="habits-view-modes"]',
        placement: 'bottom',
      },
      {
        title: 'Daily Streak Cells',
        subtitle: '1-click ticking with streak multiplier bonuses',
        badge: 'Discipline',
        icon: 'habit',
        color: PAL.amber,
        description: 'Click any day circle to tick the habit. Building streaks unlocks level XP multipliers and protects your progress.',
        bulletPoints: [
          'Support for Binary (✓), Timed (mins), and Numeric count habits',
          'Equip Streak Freezes to protect streaks on busy days',
          'Auto-syncs directly to joined community challenges',
        ],
        targetSelector: '[data-tour="habits-grid-cells"]',
        placement: 'top',
        proTip: 'Tap any habit card to open its detail notes, logs, and milestone badges.',
      },
    ],
    actionLabel: 'Build Habits',
    actionRoute: '/habits/',
  },

  body: {
    tabId: 'body',
    tabTitle: 'Peak Performance',
    characterName: 'Koda the Bear',
    animal: 'bear',
    greeting: 'Fuel your physical body, optimize sleep, and track workouts!',
    accentColor: PAL.coral,
    steps: [
      {
        title: 'Workout Muscle Heatmap',
        subtitle: 'Visual anatomical training map',
        badge: 'Fitness',
        icon: 'gym',
        color: PAL.coral,
        description: 'Log workouts to light up trained muscle groups (Chest, Back, Arms, Core, Legs) and balance your physique.',
        bulletPoints: [
          'Visual heatmap showing muscle training recency',
          '1-tap workout logging with duration and exercise splits',
          'Weekly workout consistency scoring',
        ],
        targetSelector: '[data-tour="body-muscle-map"]',
        placement: 'bottom',
      },
      {
        title: 'Sleep Arc & Hydration',
        subtitle: 'Rotary sleep dial and water glasses',
        badge: 'Recovery',
        icon: 'heart',
        color: PAL.sky,
        description: 'Log sleep bedtime and wake times with intuitive dual-handle rotary dials. Count water glasses with 1 tap.',
        bulletPoints: [
          'Rotary dials making sleep logging tactile and swift',
          '8-glass hydration target with instant check off',
          'Daily step counter synced with fitness challenges',
        ],
        targetSelector: '[data-tour="body-sleep-arc"]',
        placement: 'top',
      },
    ],
    actionLabel: 'Track Body & Health',
    actionRoute: '/body/',
  },

  money: {
    tabId: 'money',
    tabTitle: 'Financial Freedom',
    characterName: 'Draco the Dragon',
    animal: 'dragon',
    greeting: 'Master your personal finances, allowances, and savings goals!',
    accentColor: PAL.amber,
    steps: [
      {
        title: 'Budget Consumption Ring',
        subtitle: 'Visual pace meter for your monthly allowance',
        badge: 'Budget',
        icon: 'money',
        color: PAL.amber,
        description: 'See remaining balance vs days left in the month so you never run out of allowance before month-end.',
        bulletPoints: [
          'Color-coded spending velocity meter',
          'Accounts ledger (Cash, GCash, Bank, Savings)',
          'Privacy mode button to hide balances in public',
        ],
        targetSelector: '[data-tour="money-budget-ring"]',
        placement: 'bottom',
        shortcut: 'Press E anywhere to quick-log an expense',
      },
    ],
    actionLabel: 'Check Finances',
    actionRoute: '/money/',
  },

  community_feed: {
    tabId: 'community_feed',
    tabTitle: 'Campus Square',
    characterName: 'Kaia the Fox',
    animal: 'fox',
    greeting: 'Share updates, discover trending topics, and connect with peers!',
    accentColor: PAL.sky,
    steps: [
      {
        title: 'Community Tab Switcher',
        subtitle: 'Feed, Messages, and Challenges in one place',
        badge: 'Navigation',
        icon: 'chat',
        color: PAL.sky,
        description: 'Switch between the public campus Feed, your direct Messages, and competitive Arena Challenges.',
        bulletPoints: [
          'Feed: Share photo updates, notes, and join campus discussions',
          'Messages: Real-time DMs and study group threads',
          'Challenges: Arena habit races with animal mascots',
        ],
        targetSelector: '[data-tour="community-nav-tabs"]',
        placement: 'bottom',
      },
      {
        title: 'Post Composer',
        subtitle: 'Share study updates and milestones',
        badge: 'Social',
        icon: 'spark',
        color: PAL.pink,
        description: 'Post text, photos, tags, and challenge achievements directly to the campus timeline.',
        bulletPoints: [
          'Upload photo carousels and attach study links',
          'Add hashtag categories to reach interested classmates',
          'Engage with threaded replies, reposts, and bookmarks',
        ],
        targetSelector: '[data-tour="community-composer"]',
        placement: 'bottom',
      },
    ],
    actionLabel: 'Join the Conversation',
    actionRoute: '/community/?tab=feed',
  },

  community_challenges: {
    tabId: 'community_challenges',
    tabTitle: 'The Arena',
    characterName: 'Leo the Lion',
    animal: 'dragon',
    greeting: 'Compete in habit leagues, climb the RP ladder, and win trophies!',
    accentColor: PAL.amber,
    steps: [
      {
        title: 'Ranked RP Ladder',
        subtitle: 'Seasonal competitive tier progression',
        badge: 'Ranked',
        icon: 'trophy',
        color: PAL.amber,
        description: 'Climb through Bronze, Silver, Gold, Platinum, Diamond, Master, and Grandmaster by winning challenges!',
        bulletPoints: [
          'RP gained upon challenge completion and victories',
          'Win/Loss records and peak season RP badges',
          'Trophy room showcasing your won medals and rewards',
        ],
        targetSelector: '[data-tour="challenges-ladder"]',
        placement: 'bottom',
      },
      {
        title: 'Animated Mascot Race Trail',
        subtitle: 'Real-time habit distance race',
        badge: 'Race Trail',
        icon: 'spark',
        color: PAL.coral,
        description: 'Each member’s animal mascot moves down the track as they tick habits and workouts. First to reach the target wins!',
        bulletPoints: [
          'Animated running mascots reflecting each person’s momentum',
          '1-tap Join button that automatically mirrors the habit to your Habits page',
          'Settle up at challenge end to distribute RP and crowns',
        ],
        targetSelector: '[data-tour="challenges-trail"]',
        placement: 'top',
      },
    ],
    actionLabel: 'Enter the Arena',
    actionRoute: '/community/?tab=challenges',
  },

  community_messages: {
    tabId: 'community_messages',
    tabTitle: 'Instant Pulse',
    characterName: 'Pip the Otter',
    animal: 'otter',
    greeting: 'Direct messaging, study group chats, and real-time collaboration!',
    accentColor: PAL.mint,
    steps: [
      {
        title: 'Conversations & Search',
        subtitle: '1-on-1 DMs and study groups',
        badge: 'Threads',
        icon: 'send',
        color: PAL.mint,
        description: 'Start instant chats with any classmate or create group channels for project collaborations.',
        bulletPoints: [
          'Search conversations by name or @handle',
          'Real-time typing indicators and live peer presence',
          'Send voice memos, attachments, and challenge invites',
        ],
        targetSelector: '[data-tour="messages-threads"]',
        placement: 'right',
      },
    ],
    actionLabel: 'Open Messages',
    actionRoute: '/community/?tab=messages',
  },

  files: {
    tabId: 'files',
    tabTitle: 'Cloud Archive',
    characterName: 'Tux the Penguin',
    animal: 'penguin',
    greeting: 'Organize your syllabi, lecture slides, and assignment attachments!',
    accentColor: PAL.cyan,
    steps: [
      {
        title: 'Subject Cloud Drives',
        subtitle: 'All your course assets in one place',
        badge: 'Drive',
        icon: 'files',
        color: PAL.cyan,
        description: 'Store and preview lecture PDFs, slide decks, project assets, and study guides with instant search.',
        bulletPoints: [
          'Organize files by course folders and custom tags',
          'Instant in-browser document previews',
          'Direct linking from tasks, projects, and notes',
        ],
        targetSelector: '[data-tour="files-grid"]',
        placement: 'bottom',
      },
    ],
    actionLabel: 'Manage Files',
    actionRoute: '/files/',
  },

  people: {
    tabId: 'people',
    tabTitle: 'Campus Network',
    characterName: 'Samira the Shiba',
    animal: 'shiba',
    greeting: 'Your campus rolodex for classmates, group partners, and professors!',
    accentColor: PAL.indigo,
    steps: [
      {
        title: 'Directory & Follow Toggles',
        subtitle: 'Connect with peers and instructors',
        badge: 'People',
        icon: 'people',
        color: PAL.indigo,
        description: 'Keep track of classmates, project teammates, and faculty with quick category tags and private notes.',
        bulletPoints: [
          'Category badges (Classmate, Groupmate, Friend, Family, Prof)',
          'Private memory notes to remember key details about people',
          '1-tap Follow/Unfollow and direct profile & message shortcuts',
        ],
        targetSelector: '[data-tour="people-roster"]',
        placement: 'bottom',
      },
    ],
    actionLabel: 'View People',
    actionRoute: '/people/',
  },

  profile: {
    tabId: 'profile',
    tabTitle: 'Your Identity',
    characterName: 'Zane the Wolf',
    animal: 'wolf',
    greeting: 'Showcase your achievements, stories, highlights, and mascot!',
    accentColor: PAL.violet,
    steps: [
      {
        title: 'Mascot & Identity Card',
        subtitle: 'Your public persona on Basedly',
        badge: 'Identity',
        icon: 'focus',
        color: PAL.violet,
        description: 'Customize your handle, signature animal mascot, avatar photo, and bio. Share stories and post activity timelines.',
        bulletPoints: [
          'Pick your signature animal mascot shown in leaderboards',
          'Share ephemeral Story Highlights just like Instagram',
          'Inspect your follower/following network with 1-tap controls',
        ],
        targetSelector: '[data-tour="profile-header"]',
        placement: 'bottom',
        shortcut: 'G then P to jump to Profile',
      },
    ],
    actionLabel: 'View My Profile',
    actionRoute: '/profile/',
  },
};
