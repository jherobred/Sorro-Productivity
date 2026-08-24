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
        title: 'Your Command Center',
        subtitle: 'Everything you need at a single glance',
        badge: 'Overview',
        icon: 'home',
        color: PAL.indigo,
        description: 'Home aggregates your schedule, tasks, habits, budgets, and project velocity into one high-focus dashboard.',
        bulletPoints: [
          'Interactive Study Buddy that reacts to your daily momentum',
          'Daily RPG Quests with earnable ladder RP',
          'Today’s timeline showing what is next up to 10 PM',
          'Live spending meter tracking monthly allowance',
        ],
        proTip: 'Press T to quickly create a task, or N to draft a scratch note from anywhere.',
        shortcut: 'G then H to jump to Home',
      },
      {
        title: 'Daily RPG Quests',
        subtitle: 'Earn RP and level up every morning',
        badge: 'Level Up',
        icon: 'trophy',
        color: PAL.amber,
        description: 'Complete daily objectives across habits, tasks, and notes to claim RP that boosts your global ladder rank.',
        bulletPoints: [
          'Claim rewards with 1 tap upon objective completion',
          'Build discipline while ranking up through competitive tiers',
          'Automatic reset at midnight with fresh challenges',
        ],
        proTip: 'Claiming quests gives instant bonus XP to your companion.',
      },
      {
        title: 'Quick Actions & Focus Hub',
        subtitle: 'Capture ideas at the speed of thought',
        badge: 'Flow State',
        icon: 'spark',
        color: PAL.coral,
        description: 'Launch the immersive Focus Hub for Pomodoro deep-work sessions or use rapid hotkeys to keep momentum.',
        bulletPoints: [
          'Dedicated full-screen Focus Mode with ambient sounds',
          'Overdue task warnings keeping deadlines in check',
          'Instant scratchpad synced across your devices',
        ],
        shortcut: '⌘K to open the Command Palette',
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
        title: 'Master Your Schedule',
        subtitle: 'Day, Week, and Month perspectives',
        badge: 'Time Blocks',
        icon: 'cal',
        color: PAL.mint,
        description: 'Schedule class lectures, study sessions, and social events with precision time blocks and all-day trays.',
        bulletPoints: [
          'Toggle between Month, Week, and Day views with 1 click',
          'Color-coded categories for Classes, Personal, and Org events',
          'Time indicator showing exactly where you are in the day',
        ],
        shortcut: 'G then C to jump to Calendar',
      },
      {
        title: 'Rapid Deletion & Undo',
        subtitle: 'Keyboard-accelerated schedule management',
        badge: 'Pro Control',
        icon: 'trash',
        color: PAL.coral,
        description: 'Manage time slots swiftly without annoying confirmation modals.',
        bulletPoints: [
          'Select any event chip and press Backspace or Delete to remove it',
          'Instant undo toast lets you restore accidental deletions in 1 tap',
          'Click and drag time slots to create new events on the fly',
        ],
        proTip: 'Press Backspace on any selected event for instant removal.',
        shortcut: 'Backspace / Delete to remove event',
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
        title: 'Smart 3-Column Workflow',
        subtitle: 'Due Today, Tomorrow, and Later',
        badge: 'Kanban Flow',
        icon: 'task',
        color: PAL.coral,
        description: 'Stay ahead of deadlines by categorizing to-dos into natural time horizons with priority rings.',
        bulletPoints: [
          'Priority rings (High coral, Medium amber, Low neutral)',
          'Star critical assignments to pin them to the top',
          'Organize tasks into custom lists (School, Personal, Projects)',
        ],
        shortcut: 'Press T anywhere to create a task',
      },
      {
        title: 'Collapsible Completed Shelf',
        subtitle: 'Clean workspace with 1-tap undo',
        badge: 'Zero Clutter',
        icon: 'check',
        color: PAL.mint,
        description: 'Completed tasks tuck neatly into a collapsible shelf so your active board remains crisp and distraction-free.',
        bulletPoints: [
          'Shows total finished count with collapsible toggle',
          '1-tap checkbox to restore completed items back to active',
          'Keeps historic record of your finished achievements',
        ],
        proTip: 'Collapse the completed shelf to keep your focus on remaining goals.',
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
        title: 'Block-Based Rich Text',
        subtitle: 'Write notes with slash commands and media',
        badge: 'Editor',
        icon: 'book',
        color: PAL.violet,
        description: 'Clean Notion-style document editing tailored specifically for college courses and research papers.',
        bulletPoints: [
          'Type “/” for headings, callouts, tables, math, and code blocks',
          'Organize by Academic Term, Course Subjects, and Sections',
          'Instant auto-save with offline local resilience',
        ],
        shortcut: 'Press N anywhere to start a quick note',
      },
      {
        title: 'PDFs, OCR & Flashcards',
        subtitle: 'Transform raw notes into study power',
        badge: 'Study AI',
        icon: 'spark',
        color: PAL.amber,
        description: 'Attach lecture PDFs, extract textbook text with OCR, and turn key concepts into active-recall flashcards.',
        bulletPoints: [
          'Generate flashcard decks directly from your notes',
          'Test yourself in Interactive Quiz & Study Mode',
          'Track retention stats and study duration analytics',
        ],
        proTip: 'Import lecture slide PDFs to annotate directly alongside your text.',
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
        title: 'Visual Project Boards',
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
        shortcut: 'G then P to jump to Projects',
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
        title: 'Daily Streaks & Week Grids',
        subtitle: 'Visually track your daily rituals',
        badge: 'Consistency',
        icon: 'habit',
        color: PAL.pink,
        description: 'Whether it is hydration, reading 20 pages, or coding for 30 minutes, tick routines in 1 click.',
        bulletPoints: [
          'Week, Day, Year, and Analytics visual grid perspectives',
          'Support for Binary (✓), Timed (mins), and Count (+1, +5) habits',
          'Level XP multiplier bonuses for maintaining continuous streaks',
        ],
        shortcut: 'G then B to jump to Habits',
      },
      {
        title: 'Streak Freezes & Analytics',
        subtitle: 'Protect your hard-earned streaks',
        badge: 'Protection',
        icon: 'star',
        color: PAL.amber,
        description: 'Life happens! Use Streak Freezes to protect your momentum during exams, travel, or sick days.',
        bulletPoints: [
          'Equip streak shield freezes so you never lose a streak',
          'Log notes, moods, and reflections for each completed session',
          'Automatic synchronization with joined campus challenges',
        ],
        proTip: 'Use the Focus Timer button to track duration habits in real time.',
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
        subtitle: 'See what muscles you trained this week',
        badge: 'Fitness',
        icon: 'gym',
        color: PAL.coral,
        description: 'Log strength sessions to warm the anatomical body heatmap and ensure balanced physical development.',
        bulletPoints: [
          'Target Chest, Back, Arms, Core, Legs, and Cardio',
          'Log workout duration and exercise splits with 1 tap',
          'Historical workout consistency tracking',
        ],
      },
      {
        title: 'Sleep Arcs & Daily Habits',
        subtitle: 'Dial in recovery and hydration',
        badge: 'Wellness',
        icon: 'heart',
        color: PAL.sky,
        description: 'Intuitive dual-handle sleep arc dials make logging sleep intuitive and honest without typing numbers.',
        bulletPoints: [
          'Rotary dials for bedtime and wake-up times',
          'Water intake glass counter with daily targets',
          'Daily step counter synced with fitness challenges',
        ],
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
        title: 'Real Peso Budgeting',
        subtitle: 'Every peso has a job',
        badge: 'Ledger',
        icon: 'money',
        color: PAL.amber,
        description: 'Track multiple accounts (Cash, GCash, Bank, Savings) and monitor your remaining budget for the month.',
        bulletPoints: [
          'Visual budget consumption rings that alert you before overspending',
          'Categorized transaction logs (Food, Transpo, Bills, School)',
          'Lockable private mode for privacy in public spaces',
        ],
        proTip: 'Press E anywhere to log an expense in under 3 seconds.',
        shortcut: 'Press E to quick-log an expense',
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
        title: 'X/Twitter-Style Community',
        subtitle: 'A lively campus social feed',
        badge: 'Feed',
        icon: 'chat',
        color: PAL.sky,
        description: 'Engage with fellow Basedly students! Post study progress, share photo updates, and join campus discussions.',
        bulletPoints: [
          'Rich posts with photo uploads and tag categorization',
          'Threaded replies, bookmarks, and instant reposts',
          'Trending hashtags and recommended peers to follow',
          'Click any avatar to view their mascot profile and start a DM',
        ],
        shortcut: 'G then F to jump to Community Feed',
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
        title: 'Competitive Habit Leagues',
        subtitle: 'Accountability made thrilling',
        badge: 'Arena',
        icon: 'trophy',
        color: PAL.amber,
        description: 'Join fitness, study, or coding challenges where everyone’s animal mascot races on an animated trail!',
        bulletPoints: [
          'Auto-synced from your real habit ticks, workouts, and tasks',
          'Compete for Ranked RP and climb from Bronze to Grandmaster',
          'Trophy room showcasing your won medals and season records',
          'Stakes and victory payouts when challenges settle',
        ],
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
        title: 'Real-Time Chat & Groups',
        subtitle: 'Stay connected with classmates',
        badge: 'Messaging',
        icon: 'send',
        color: PAL.mint,
        description: 'Direct message anyone by @handle or spin up collaborative group chats for group projects.',
        bulletPoints: [
          'Send direct messages, group chats, and voice memos',
          'Share posts, challenge invites, and notes directly into threads',
          'Real-time typing indicators and live peer presence',
          '1-tap profile navigation from any message avatar',
        ],
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
        title: 'Contacts & Directory',
        subtitle: 'Never lose a contact detail',
        badge: 'People',
        icon: 'people',
        color: PAL.indigo,
        description: 'Keep track of classmates, project teammates, and faculty with quick category tags and private notes.',
        bulletPoints: [
          'Category badges (Classmate, Groupmate, Friend, Family, Prof)',
          'Private memory notes to remember key details about people',
          '1-tap Follow/Unfollow and direct profile & message shortcuts',
        ],
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
        title: 'Mascot & Social Profile',
        subtitle: 'Your public persona on Basedly',
        badge: 'Identity',
        icon: 'focus',
        color: PAL.violet,
        description: 'Customize your handle, animal mascot, avatar photo, and cover art. Share stories and post activity timelines.',
        bulletPoints: [
          'Pick your signature animal mascot shown in leaderboards',
          'Share ephemeral Story Highlights just like Instagram',
          'Inspect your follower/following network with 1-tap controls',
          'Share your unique profile link with friends (@handle)',
        ],
        shortcut: 'G then P to jump to Profile',
      },
    ],
    actionLabel: 'View My Profile',
    actionRoute: '/profile/',
  },
};
