'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { RANKED, useRanked } from './challenges';
import { playCelebration, playTick } from './audio';
import { toast } from './toast';
import type { Animal, Accessory } from './mascot';

export type ShopCategory = 'mascot' | 'themes' | 'sounds' | 'titles' | 'powerups';

export interface ShopItem {
  id: string;
  name: string;
  category: ShopCategory;
  price: number;
  description: string;
  icon: string;
  accent: string;
  badge?: string;
  // Metadata for custom application
  accessoryType?: Accessory;
  themeAccent?: string;
  soundPack?: 'classic' | 'arcade' | 'zen' | 'synth';
  titleText?: string;
  powerupType?: 'streak_shield' | 'double_xp';
}

export const SHOP_ITEMS: ShopItem[] = [
  // Mascot Gear
  {
    id: 'gear_wizard',
    name: 'Archmage Hat',
    category: 'mascot',
    price: 120,
    description: 'Starry midnight hat infused with deep-work sorcery.',
    icon: 'spark',
    accent: '#8E7BC4',
    accessoryType: 'crown',
  },
  {
    id: 'gear_crown',
    name: 'Imperial Crown',
    category: 'mascot',
    price: 180,
    description: 'Solid gold crown with rubies for leaderboard champions.',
    icon: 'trophy',
    accent: '#FFC24B',
    badge: 'Popular',
    accessoryType: 'crown',
  },
  {
    id: 'gear_headphones',
    name: 'Studio Headphones',
    category: 'mascot',
    price: 100,
    description: 'Noise-canceling cans tuned for high-focus lofi sessions.',
    icon: 'chat',
    accent: '#4FD1C5',
    accessoryType: 'headphones',
  },
  {
    id: 'gear_sweatband',
    name: 'Marathon Sweatband',
    category: 'mascot',
    price: 60,
    description: 'Neon athletic band for unstoppable habit streaks.',
    icon: 'flame',
    accent: '#FF6B6B',
    accessoryType: 'sweatband',
  },

  // Exclusive UI Themes
  {
    id: 'theme_cyberpunk',
    name: 'Cyberpunk Neon',
    category: 'themes',
    price: 150,
    description: 'Electric cyan and neon violet futuristic glow.',
    icon: 'spark',
    accent: '#00F0FF',
    badge: 'Exclusive',
    themeAccent: '#00F0FF',
  },
  {
    id: 'theme_obsidian',
    name: 'Obsidian Gold',
    category: 'themes',
    price: 200,
    description: 'Stealth luxury black with champagne gold reflections.',
    icon: 'trophy',
    accent: '#E5A93C',
    themeAccent: '#E5A93C',
  },
  {
    id: 'theme_matcha',
    name: 'Matcha Zen',
    category: 'themes',
    price: 120,
    description: 'Calming botanical green and soothing organic tones.',
    icon: 'check',
    accent: '#52B788',
    themeAccent: '#52B788',
  },
  {
    id: 'theme_sunset',
    name: 'Sunset Mirage',
    category: 'themes',
    price: 140,
    description: 'Warm coral, amber rays, and dusk purple gradients.',
    icon: 'flame',
    accent: '#FF758F',
    themeAccent: '#FF758F',
  },

  // Sound FX Packs
  {
    id: 'sound_arcade',
    name: '8-Bit Arcade FX',
    category: 'sounds',
    price: 100,
    description: 'Nostalgic chiptune coin dings, jump ticks, and level-ups.',
    icon: 'spark',
    accent: '#38D6F2',
    soundPack: 'arcade',
  },
  {
    id: 'sound_zen',
    name: 'Zen Temple Sounds',
    category: 'sounds',
    price: 100,
    description: 'Organic bamboo woodblock clacks and Tibetan bells.',
    icon: 'spark',
    accent: '#9AA6C4',
    soundPack: 'zen',
  },

  // Titles & Badges
  {
    id: 'title_titan',
    name: 'Apex Titan',
    category: 'titles',
    price: 160,
    description: 'Golden prestige title shown on your profile and community posts.',
    icon: 'trophy',
    accent: '#FFC24B',
    titleText: '⚔️ Apex Titan',
  },
  {
    id: 'title_architect',
    name: 'System Architect',
    category: 'titles',
    price: 130,
    description: 'Elite designer and builder of unstoppable daily systems.',
    icon: 'spark',
    accent: '#7C6CFF',
    titleText: '🏛️ System Architect',
  },
  {
    id: 'title_monk',
    name: 'Focus Monk',
    category: 'titles',
    price: 110,
    description: 'Master of deep work and distraction-free execution.',
    icon: 'clock',
    accent: '#4FD1C5',
    titleText: '🧘 Focus Monk',
  },

  // Power-Ups
  {
    id: 'boost_streak_shield',
    name: 'Streak Shield (x1)',
    category: 'powerups',
    price: 80,
    description: 'Automatically protects your habit streaks if you miss a day.',
    icon: 'flame',
    accent: '#FF8800',
    powerupType: 'streak_shield',
  },
  {
    id: 'boost_double_xp',
    name: '2X RP Booster (24h)',
    category: 'powerups',
    price: 90,
    description: 'Doubles all RP and XP rewards earned over the next 24 hours.',
    icon: 'spark',
    accent: '#A855F7',
    badge: '2X Boost',
    powerupType: 'double_xp',
  },
];

const INVENTORY_STORAGE_KEY = 'basedly-user-inventory-v1';
const EQUIPPED_STORAGE_KEY = 'basedly-user-equipped-v1';

export interface EquippedState {
  mascotAccessory: Accessory;
  themeAccent: string | null;
  soundPack: 'classic' | 'arcade' | 'zen' | 'synth';
  titleText: string | null;
  activeBoosters: string[];
}

const DEFAULT_EQUIPPED: EquippedState = {
  mascotAccessory: 'sweatband',
  themeAccent: null,
  soundPack: 'classic',
  titleText: null,
  activeBoosters: [],
};

export function useShop() {
  const qc = useQueryClient();
  const { data: ranked, isPending: isRankedPending } = useRanked();
  const currentRp = ranked?.rp ?? 0;

  const [inventory, setInventory] = useState<string[]>(() => {
    if (typeof window === 'undefined') return ['gear_sweatband'];
    try {
      const raw = localStorage.getItem(INVENTORY_STORAGE_KEY);
      return raw ? JSON.parse(raw) : ['gear_sweatband'];
    } catch {
      return ['gear_sweatband'];
    }
  });

  const [equipped, setEquipped] = useState<EquippedState>(() => {
    if (typeof window === 'undefined') return DEFAULT_EQUIPPED;
    try {
      const raw = localStorage.getItem(EQUIPPED_STORAGE_KEY);
      return raw ? JSON.parse(raw) : DEFAULT_EQUIPPED;
    } catch {
      return DEFAULT_EQUIPPED;
    }
  });

  // Persist inventory
  const saveInventory = (items: string[]) => {
    setInventory(items);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(items));
      } catch { /* private mode */ }
    }
  };

  // Persist equipped
  const saveEquipped = (eq: EquippedState) => {
    setEquipped(eq);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(EQUIPPED_STORAGE_KEY, JSON.stringify(eq));
      } catch { /* private mode */ }
    }
  };

  // Buy item mutation
  const buyMutation = useMutation({
    mutationFn: async (item: ShopItem) => {
      if (inventory.includes(item.id)) {
        throw new Error('You already own this item');
      }
      if (currentRp < item.price) {
        throw new Error(`Need ${item.price - currentRp} more RP to purchase`);
      }

      const uid = await currentUserId();
      const newRp = Math.max(0, currentRp - item.price);

      // Optimistically update bd_ranked in Supabase
      if (uid) {
        await supabase
          .from('bd_ranked')
          .update({ rp: newRp })
          .eq('user_id', uid);
      }

      return { item, newRp };
    },
    onMutate: async (item) => {
      await qc.cancelQueries({ queryKey: RANKED });
      const prev = qc.getQueryData<{ rp: number; peak_rp: number; wins: number; losses: number; season: string }>(RANKED);
      if (prev) {
        qc.setQueryData(RANKED, {
          ...prev,
          rp: Math.max(0, prev.rp - item.price),
        });
      }
      return { prev };
    },
    onError: (err, _item, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(RANKED, ctx.prev);
      }
      toast(err instanceof Error ? err.message : 'Purchase failed');
    },
    onSuccess: ({ item }) => {
      playCelebration();
      const nextInv = [...inventory, item.id];
      saveInventory(nextInv);
      toast(`Unlocked “${item.name}”! 🎉`);
      // Auto-equip on purchase
      equipItem(item);
      void qc.invalidateQueries({ queryKey: RANKED });
    },
  });

  // Equip item
  const equipItem = useCallback((item: ShopItem) => {
    playTick();
    const next = { ...equipped };
    if (item.accessoryType) {
      next.mascotAccessory = item.accessoryType;
    }
    if (item.themeAccent) {
      next.themeAccent = item.themeAccent;
      // Apply theme CSS variable dynamically
      if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty('--acc', item.themeAccent);
      }
    }
    if (item.soundPack) {
      next.soundPack = item.soundPack;
    }
    if (item.titleText) {
      next.titleText = item.titleText;
    }
    saveEquipped(next);
    toast(`Equipped “${item.name}”`);
  }, [equipped]);

  // Unequip item
  const unequipItem = useCallback((item: ShopItem) => {
    playTick();
    const next = { ...equipped };
    if (item.accessoryType && next.mascotAccessory === item.accessoryType) {
      next.mascotAccessory = 'none';
    }
    if (item.themeAccent && next.themeAccent === item.themeAccent) {
      next.themeAccent = null;
      if (typeof document !== 'undefined') {
        document.documentElement.style.removeProperty('--acc');
      }
    }
    if (item.titleText && next.titleText === item.titleText) {
      next.titleText = null;
    }
    saveEquipped(next);
    toast(`Unequipped “${item.name}”`);
  }, [equipped]);

  return {
    rp: currentRp,
    isRankedPending,
    inventory,
    equipped,
    buyItem: (item: ShopItem) => buyMutation.mutate(item),
    isBuying: buyMutation.isPending,
    equipItem,
    unequipItem,
    isOwned: (id: string) => inventory.includes(id),
    isEquipped: (item: ShopItem) => {
      if (item.accessoryType) return equipped.mascotAccessory === item.accessoryType;
      if (item.themeAccent) return equipped.themeAccent === item.themeAccent;
      if (item.soundPack) return equipped.soundPack === item.soundPack;
      if (item.titleText) return equipped.titleText === item.titleText;
      return false;
    },
  };
}
