'use client';

import { useState } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { Mascot } from '@/components/challenges/Mascot';
import { useOverlayBack } from '@/lib/nav';
import { useShop, SHOP_ITEMS, type ShopCategory, type ShopItem } from '@/lib/shop';
import { useMyIdentity, useProfiles } from '@/lib/people';
import { animalOf, type Animal, type Accessory } from '@/lib/mascot';

const CATEGORIES: { id: 'all' | ShopCategory; label: string; icon: string }[] = [
  { id: 'all', label: 'All Items', icon: 'spark' },
  { id: 'mascot', label: 'Mascot Gear', icon: 'trophy' },
  { id: 'themes', label: 'Themes', icon: 'pen' },
  { id: 'sounds', label: 'Audio FX', icon: 'chat' },
  { id: 'titles', label: 'Titles', icon: 'star' },
  { id: 'powerups', label: 'Power-Ups', icon: 'flame' },
];

export function ShopModal({ onClose }: { onClose: () => void }) {
  useOverlayBack(true, onClose);
  const myIdentity = useMyIdentity();
  const me = myIdentity.name || 'you';
  const { data: profiles = {} } = useProfiles();
  const userAnimal = (profiles[me]?.animal as Animal) || animalOf(me);

  const {
    rp,
    inventory,
    equipped,
    buyItem,
    isBuying,
    equipItem,
    unequipItem,
    isOwned,
    isEquipped,
  } = useShop();

  const [activeCategory, setActiveCategory] = useState<'all' | ShopCategory>('all');
  const [selectedItem, setSelectedItem] = useState<ShopItem | null>(SHOP_ITEMS[0]);

  const filteredItems = SHOP_ITEMS.filter((item) =>
    activeCategory === 'all' ? true : item.category === activeCategory
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        background: 'rgba(4, 6, 12, 0.72)',
        backdropFilter: 'blur(10px)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Reward Shop"
        className="k-bloom navsb"
        style={{
          width: '100%',
          maxWidth: 920,
          maxHeight: '90vh',
          background: 'var(--card)',
          border: '1.5px solid var(--line2)',
          borderRadius: 24,
          boxShadow: '0 24px 60px -12px rgba(0,0,0,.7), 0 0 32px rgba(255,194,75,.12)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: 'var(--tx)',
        }}
      >
        {/* Header with RP Balance and Close */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px',
            borderBottom: '1px solid var(--line)',
            background: 'var(--card2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'color-mix(in srgb, var(--pal-amber) 20%, transparent)',
                border: '1px solid color-mix(in srgb, var(--pal-amber) 40%, transparent)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name="trophy" size={20} color="var(--pal-amber)" />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.02em' }}>
                Sparks Emporium
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--tx3)', fontWeight: 600 }}>
                Spend your earned Ranked Points on custom gear, themes, & power-ups
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* RP Currency Badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '6px 14px',
                borderRadius: 999,
                background: 'color-mix(in srgb, var(--pal-amber) 16%, var(--card))',
                border: '1.5px solid color-mix(in srgb, var(--pal-amber) 45%, transparent)',
                boxShadow: '0 0 16px color-mix(in srgb, var(--pal-amber) 20%, transparent)',
              }}
            >
              <Icon name="spark" size={14} color="var(--pal-amber)" />
              <span
                style={{
                  fontSize: 13.5,
                  fontWeight: 800,
                  color: 'var(--pal-amber)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {rp.toLocaleString()} RP
              </span>
            </div>

            <button
              onClick={onClose}
              className="hov k-squish"
              aria-label="Close Shop"
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                display: 'grid',
                placeItems: 'center',
                background: 'var(--card)',
                border: '1px solid var(--line2)',
              }}
            >
              <Icon name="close" size={14} color="var(--tx2)" />
            </button>
          </div>
        </div>

        {/* Categories Rail */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '12px 24px',
            borderBottom: '1px solid var(--line)',
            background: 'var(--card)',
            overflowX: 'auto',
          }}
        >
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className="k-squish"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 13px',
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 700,
                border: activeCategory === cat.id ? '1px solid var(--acc)' : '1px solid var(--line2)',
                background: activeCategory === cat.id ? 'color-mix(in srgb, var(--acc) 18%, transparent)' : 'transparent',
                color: activeCategory === cat.id ? 'var(--accTx)' : 'var(--tx2)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon name={cat.icon as IconName} size={13} color={activeCategory === cat.id ? 'var(--accTx)' : 'var(--tx3)'} />
              {cat.label}
            </button>
          ))}
        </div>

        {/* Main Body: Items Grid + Live Companion Preview Panel */}
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 1fr)',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Items Catalog List */}
          <div
            className="navsb"
            style={{
              padding: 20,
              overflowY: 'auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
              gap: 12,
              alignContent: 'start',
            }}
          >
            {filteredItems.map((item) => {
              const owned = isOwned(item.id);
              const equippedNow = isEquipped(item);
              const isSelected = selectedItem?.id === item.id;
              const canAfford = rp >= item.price;

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  style={{
                    background: isSelected ? 'var(--card2)' : 'var(--card)',
                    border: `1.5px solid ${
                      isSelected
                        ? item.accent
                        : owned
                        ? 'var(--line2)'
                        : 'var(--line)'
                    }`,
                    borderRadius: 16,
                    padding: '14px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all .2s ease',
                    boxShadow: isSelected
                      ? `0 8px 24px -6px color-mix(in srgb, ${item.accent} 25%, transparent)`
                      : 'var(--sh)',
                  }}
                >
                  {item.badge && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        fontSize: 9,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                        borderRadius: 6,
                        background: `color-mix(in srgb, ${item.accent} 22%, transparent)`,
                        color: item.accent,
                        border: `1px solid color-mix(in srgb, ${item.accent} 40%, transparent)`,
                      }}
                    >
                      {item.badge}
                    </span>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: `color-mix(in srgb, ${item.accent} 18%, transparent)`,
                        display: 'grid',
                        placeItems: 'center',
                        flex: 'none',
                      }}
                    >
                      <Icon name={item.icon as IconName} size={16} color={item.accent} />
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--tx3)', textTransform: 'capitalize' }}>
                        {item.category}
                      </div>
                    </div>
                  </div>

                  <p style={{ fontSize: 11, color: 'var(--tx2)', lineHeight: 1.4, margin: '0 0 12px', flex: 1 }}>
                    {item.description}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="spark" size={11} color={owned ? 'var(--tx3)' : 'var(--pal-amber)'} />
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: owned ? 'var(--tx3)' : canAfford ? 'var(--pal-amber)' : 'var(--pal-coral)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {owned ? 'Owned' : `${item.price} RP`}
                      </span>
                    </div>

                    {owned ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (equippedNow) {
                            unequipItem(item);
                          } else {
                            equipItem(item);
                          }
                        }}
                        className="k-squish"
                        style={{
                          padding: '5px 10px',
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 800,
                          border: 'none',
                          background: equippedNow ? 'var(--acc)' : 'var(--card)',
                          color: equippedNow ? '#0A0912' : 'var(--tx)',
                          cursor: 'pointer',
                          boxShadow: equippedNow ? '0 2px 8px color-mix(in srgb, var(--acc) 35%, transparent)' : 'none',
                        }}
                      >
                        {equippedNow ? 'Equipped' : 'Equip'}
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          buyItem(item);
                        }}
                        disabled={!canAfford || isBuying}
                        className="k-squish"
                        style={{
                          padding: '5px 12px',
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 800,
                          border: 'none',
                          background: canAfford ? 'var(--pal-amber)' : 'var(--card2)',
                          color: canAfford ? '#0A0912' : 'var(--tx3)',
                          cursor: canAfford ? 'pointer' : 'not-allowed',
                          opacity: canAfford ? 1 : 0.6,
                        }}
                      >
                        Unlock
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Companion Wardrobe Preview Station */}
          {selectedItem && (
            <div
              style={{
                borderLeft: '1px solid var(--line)',
                background: 'var(--card2)',
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  ...KICKER,
                  color: 'var(--tx3)',
                  marginBottom: 12,
                }}
              >
                Wardrobe Fitting Station
              </div>

              {/* Animated Mascot Preview Box */}
              <div
                style={{
                  width: 140,
                  height: 140,
                  borderRadius: 28,
                  background: `radial-gradient(circle, color-mix(in srgb, ${selectedItem.accent} 25%, var(--card)) 0%, var(--card) 70%)`,
                  border: `2px solid color-mix(in srgb, ${selectedItem.accent} 45%, transparent)`,
                  display: 'grid',
                  placeItems: 'center',
                  boxShadow: `0 12px 36px -8px color-mix(in srgb, ${selectedItem.accent} 35%, transparent)`,
                  marginBottom: 16,
                  position: 'relative',
                }}
              >
                <Mascot
                  id={me}
                  animal={userAnimal}
                  size={90}
                  mood="celebrating"
                  accessory={
                    selectedItem.accessoryType ||
                    (equipped.mascotAccessory as Accessory) ||
                    'sweatband'
                  }
                  hue={selectedItem.themeAccent || selectedItem.accent}
                  crown={selectedItem.accessoryType === 'crown'}
                />
              </div>

              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>
                {selectedItem.name}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--tx2)', maxWidth: 260, lineHeight: 1.45, marginBottom: 18 }}>
                {selectedItem.description}
              </div>

              {/* Purchase / Equip Action CTA */}
              {isOwned(selectedItem.id) ? (
                <button
                  onClick={() => {
                    if (isEquipped(selectedItem)) {
                      unequipItem(selectedItem);
                    } else {
                      equipItem(selectedItem);
                    }
                  }}
                  className="k-squish"
                  style={{
                    width: '100%',
                    maxWidth: 220,
                    padding: '10px 18px',
                    borderRadius: 12,
                    fontSize: 12.5,
                    fontWeight: 800,
                    border: 'none',
                    background: isEquipped(selectedItem) ? 'var(--acc)' : 'var(--card)',
                    color: isEquipped(selectedItem) ? '#0A0912' : 'var(--tx)',
                    cursor: 'pointer',
                    boxShadow: isEquipped(selectedItem) ? '0 4px 14px color-mix(in srgb, var(--acc) 40%, transparent)' : 'var(--sh)',
                  }}
                >
                  {isEquipped(selectedItem) ? 'Unequip Item' : 'Equip to Mascot'}
                </button>
              ) : (
                <button
                  onClick={() => buyItem(selectedItem)}
                  disabled={rp < selectedItem.price || isBuying}
                  className="k-squish"
                  style={{
                    width: '100%',
                    maxWidth: 220,
                    padding: '10px 18px',
                    borderRadius: 12,
                    fontSize: 12.5,
                    fontWeight: 800,
                    border: 'none',
                    background: rp >= selectedItem.price ? 'var(--pal-amber)' : 'var(--card)',
                    color: rp >= selectedItem.price ? '#0A0912' : 'var(--tx3)',
                    cursor: rp >= selectedItem.price ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    boxShadow: rp >= selectedItem.price ? '0 4px 16px rgba(255,194,75,.4)' : 'none',
                  }}
                >
                  <Icon name="spark" size={14} color={rp >= selectedItem.price ? '#0A0912' : 'var(--tx3)'} />
                  Unlock for {selectedItem.price} RP
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const KICKER: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '.08em',
};
