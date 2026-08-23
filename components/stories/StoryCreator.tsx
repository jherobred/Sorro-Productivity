'use client';

import React, { useState, useRef } from 'react';
import { Icon } from '@/components/Icon';
import {
  type StorySlide, type StorySticker, type StoryTextOverlay,
  createStory,
} from '@/lib/stories';
import { useOverlayBack } from '@/lib/nav';
import { toast } from '@/lib/toast';
import { playClick } from '@/lib/audio';

const GRADIENTS = [
  'linear-gradient(135deg, #FF512F, #DD2476)',
  'linear-gradient(135deg, #7F00FF, #E100FF)',
  'linear-gradient(135deg, #11998e, #38ef7d)',
  'linear-gradient(135deg, #4E54C8, #8F94FB)',
  'linear-gradient(135deg, #FC466B, #3F5EFB)',
  'linear-gradient(135deg, #0BA360, #3CBA92)',
  'linear-gradient(135deg, #1D2671, #C33764)',
  'linear-gradient(135deg, #232526, #414345)',
];

const FILTERS = [
  { id: 'normal', name: 'Normal' },
  { id: 'clarendon', name: 'Clarendon' },
  { id: 'juno', name: 'Juno' },
  { id: 'lark', name: 'Lark' },
  { id: 'moon', name: 'Moon' },
  { id: 'gingham', name: 'Gingham' },
  { id: 'slumber', name: 'Slumber' },
];

const TEXT_COLORS = ['#ffffff', '#000000', '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#5856D6', '#AF52DE'];

export function StoryCreator({
  me,
  onClose,
  onCreated,
}: {
  me: string;
  onClose: () => void;
  onCreated?: (story: StorySlide) => void;
}) {
  useOverlayBack(true, onClose);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [bgGradient, setBgGradient] = useState(GRADIENTS[0]);
  const [selectedFilter, setSelectedFilter] = useState('normal');

  // Text overlay builder state
  const [textOverlays, setTextOverlays] = useState<StoryTextOverlay[]>([]);
  const [editingText, setEditingText] = useState(false);
  const [currentText, setCurrentText] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [fontSize, setFontSize] = useState(22);
  const [bgChip, setBgChip] = useState(true);
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('center');

  // Stickers state
  const [stickers, setStickers] = useState<StorySticker[]>([]);
  const [showStickerDrawer, setShowStickerDrawer] = useState(false);
  const [showPollBuilder, setShowPollBuilder] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('Are you locked in today?');
  const [pollOpt1, setPollOpt1] = useState('100% 🔥');
  const [pollOpt2, setPollOpt2] = useState('Getting there ⏳');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setMediaUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAddTextOverlay = () => {
    if (!currentText.trim()) {
      setEditingText(false);
      return;
    }

    const newOverlay: StoryTextOverlay = {
      id: `text-${Date.now()}`,
      text: currentText.trim(),
      color: textColor,
      fontSize,
      bgChip,
      align: textAlign,
      x: 50,
      y: textOverlays.length === 0 ? 40 : 60,
    };

    setTextOverlays([...textOverlays, newOverlay]);
    setCurrentText('');
    setEditingText(false);
  };

  const handleAddStreakSticker = () => {
    const newSticker: StorySticker = {
      id: `stk-${Date.now()}`,
      type: 'streak',
      data: {
        habitName: 'Daily Habit Streak',
        streakCount: 14,
      },
      x: 50,
      y: 70,
    };
    setStickers([...stickers, newSticker]);
    setShowStickerDrawer(false);
  };

  const handleAddPollSticker = () => {
    const newSticker: StorySticker = {
      id: `stk-${Date.now()}`,
      type: 'poll',
      data: {
        question: pollQuestion.trim() || 'Quick Poll',
        options: [pollOpt1.trim() || 'Option 1', pollOpt2.trim() || 'Option 2'],
        votes: {},
      },
      x: 50,
      y: 65,
    };
    setStickers([...stickers, newSticker]);
    setShowPollBuilder(false);
    setShowStickerDrawer(false);
  };

  const handleAddHabitSticker = () => {
    const newSticker: StorySticker = {
      id: `stk-${Date.now()}`,
      type: 'habit',
      data: {
        habitName: 'Deep Work Sprint ⚡',
      },
      x: 50,
      y: 50,
    };
    setStickers([...stickers, newSticker]);
    setShowStickerDrawer(false);
  };

  const handlePublish = (isCloseFriends = false) => {
    const story = createStory({
      userId: me,
      mediaUrl: mediaUrl || undefined,
      bgGradient: mediaUrl ? undefined : bgGradient,
      filter: selectedFilter,
      textOverlays,
      stickers,
      isCloseFriends,
    });

    onCreated?.(story);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 220,
      background: '#000000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      {/* Main Canvas Frame */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 440,
        height: '100dvh',
        maxHeight: 900,
        background: mediaUrl ? '#121212' : bgGradient,
        borderRadius: 16,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Media Background Preview */}
        {mediaUrl && (
          <img
            src={mediaUrl}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: getCssFilter(selectedFilter),
            }}
          />
        )}

        {/* Text Overlays Display */}
        {textOverlays.map((t) => (
          <div
            key={t.id}
            onClick={() => {
              // Tap to remove or edit
              setTextOverlays(textOverlays.filter((x) => x.id !== t.id));
              setCurrentText(t.text);
              setTextColor(t.color);
              setFontSize(t.fontSize);
              setBgChip(!!t.bgChip);
              setEditingText(true);
            }}
            style={{
              position: 'absolute',
              top: `${t.y}%`,
              left: `${t.x}%`,
              transform: 'translate(-50%, -50%)',
              color: t.color || '#ffffff',
              fontSize: t.fontSize || 18,
              fontWeight: 800,
              textAlign: t.align || 'center',
              background: t.bgChip ? 'rgba(0,0,0,0.65)' : 'transparent',
              padding: t.bgChip ? '6px 14px' : '0',
              borderRadius: 10,
              maxWidth: '85%',
              wordBreak: 'break-word',
              cursor: 'pointer',
              zIndex: 3,
            }}
          >
            {t.text}
          </div>
        ))}

        {/* Stickers Display */}
        {stickers.map((stk) => (
          <div
            key={stk.id}
            onClick={() => {
              setStickers(stickers.filter((x) => x.id !== stk.id));
              toast('Sticker removed');
            }}
            style={{
              position: 'absolute',
              top: `${stk.y}%`,
              left: `${stk.x}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: 4,
              width: '85%',
              maxWidth: 320,
              cursor: 'pointer',
            }}
          >
            {stk.type === 'poll' && (
              <div style={{
                background: 'rgba(255,255,255,0.95)',
                borderRadius: 16,
                padding: '12px 14px',
                color: '#121212',
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, textAlign: 'center', marginBottom: 8 }}>
                  {stk.data.question}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, padding: 8, background: 'rgba(0,0,0,0.05)', borderRadius: 8, textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
                    {stk.data.options?.[0]}
                  </div>
                  <div style={{ flex: 1, padding: 8, background: 'rgba(0,0,0,0.05)', borderRadius: 8, textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
                    {stk.data.options?.[1]}
                  </div>
                </div>
              </div>
            )}

            {stk.type === 'streak' && (
              <div style={{
                background: 'linear-gradient(135deg, #FF6B00, #FF0055)',
                borderRadius: 16,
                padding: '10px 16px',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
              }}>
                <span style={{ fontSize: 24 }}>🔥</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{stk.data.habitName}</div>
                  <div style={{ fontSize: 16, fontWeight: 900 }}>{stk.data.streakCount} DAYS STRONG</div>
                </div>
              </div>
            )}

            {stk.type === 'habit' && (
              <div style={{
                background: 'rgba(0,0,0,0.85)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 14,
                padding: '8px 14px',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <span style={{ fontSize: 18 }}>⚡</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{stk.data.habitName}</span>
              </div>
            )}
          </div>
        ))}

        {/* Top Tool Bar */}
        <div style={{
          position: 'absolute',
          top: 16,
          left: 14,
          right: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 10,
        }}>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(0,0,0,0.4)',
              border: 'none',
              borderRadius: '50%',
              width: 36,
              height: 36,
              color: '#ffffff',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Upload Photo Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Upload photo"
              style={{
                background: 'rgba(0,0,0,0.4)',
                border: 'none',
                borderRadius: '50%',
                width: 36,
                height: 36,
                color: '#ffffff',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
              }}
            >
              <Icon name="photo" size={18} color="#ffffff" />
            </button>

            {/* Text Tool Aa */}
            <button
              onClick={() => setEditingText(true)}
              title="Add text"
              style={{
                background: 'rgba(0,0,0,0.4)',
                border: 'none',
                borderRadius: '50%',
                width: 36,
                height: 36,
                color: '#ffffff',
                fontSize: 15,
                fontWeight: 900,
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
              }}
            >
              Aa
            </button>

            {/* Stickers Drawer Trigger */}
            <button
              onClick={() => setShowStickerDrawer(true)}
              title="Stickers"
              style={{
                background: 'rgba(0,0,0,0.4)',
                border: 'none',
                borderRadius: '50%',
                width: 36,
                height: 36,
                color: '#ffffff',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
              }}
            >
              <Icon name="star" size={18} color="#ffffff" />
            </button>

            {/* Change Gradient Background (if no photo) */}
            {!mediaUrl && (
              <button
                onClick={() => {
                  const currIdx = GRADIENTS.indexOf(bgGradient);
                  const nextIdx = (currIdx + 1) % GRADIENTS.length;
                  setBgGradient(GRADIENTS[nextIdx]);
                }}
                title="Change background color"
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  border: 'none',
                  borderRadius: '50%',
                  width: 36,
                  height: 36,
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                }}
              >
                🎨
              </button>
            )}
          </div>
        </div>

        {/* Filter Carousel at Bottom if media is loaded */}
        {mediaUrl && (
          <div style={{
            position: 'absolute',
            bottom: 80,
            left: 0,
            right: 0,
            display: 'flex',
            gap: 12,
            overflowX: 'auto',
            padding: '8px 16px',
            zIndex: 10,
          }} className="navsb">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setSelectedFilter(f.id)}
                className="hov k-squish"
                style={{
                  padding: '5px 12px',
                  borderRadius: 999,
                  border: selectedFilter === f.id ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.3)',
                  background: selectedFilter === f.id ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.5)',
                  color: '#ffffff',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  flex: 'none',
                  backdropFilter: 'blur(6px)',
                }}
              >
                {f.name}
              </button>
            ))}
          </div>
        )}

        {/* Bottom Publishing Actions */}
        <div style={{
          position: 'absolute',
          bottom: 16,
          left: 14,
          right: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 10,
          gap: 12,
        }}>
          {/* Share to Story Button */}
          <button
            onClick={() => handlePublish(false)}
            className="hov k-squish"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '12px 18px',
              borderRadius: 999,
              background: '#ffffff',
              color: '#000000',
              fontSize: 13.5,
              fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
            }}
          >
            <span style={{ fontSize: 16 }}>✨</span>
            <span>Your Story</span>
          </button>

          {/* Close Friends Button */}
          <button
            onClick={() => handlePublish(true)}
            className="hov k-squish"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '12px 18px',
              borderRadius: 999,
              background: '#10B981',
              color: '#ffffff',
              fontSize: 13.5,
              fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
            }}
          >
            <span style={{ fontSize: 16 }}>⭐</span>
            <span>Close Friends</span>
          </button>
        </div>

        {/* Text Overlay Editor Modal Overlay */}
        {editingText && (
          <div style={{
            position: 'absolute',
            inset: 0,
            zIndex: 30,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setBgChip(!bgChip)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    background: bgChip ? '#ffffff' : 'rgba(255,255,255,0.2)',
                    color: bgChip ? '#000000' : '#ffffff',
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Highlight
                </button>
                <button
                  onClick={() => setTextAlign(textAlign === 'center' ? 'left' : textAlign === 'left' ? 'right' : 'center')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.2)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Align {textAlign}
                </button>
              </div>

              <button
                onClick={handleAddTextOverlay}
                style={{
                  background: '#ffffff',
                  color: '#000000',
                  border: 'none',
                  borderRadius: 999,
                  padding: '6px 16px',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>

            <textarea
              autoFocus
              value={currentText}
              onChange={(e) => setCurrentText(e.target.value)}
              placeholder="Type something..."
              style={{
                width: '100%',
                background: bgChip ? 'rgba(0,0,0,0.7)' : 'transparent',
                border: 'none',
                color: textColor,
                fontSize: 24,
                fontWeight: 800,
                textAlign,
                outline: 'none',
                resize: 'none',
                padding: '12px 16px',
                borderRadius: 12,
              }}
              rows={3}
            />

            {/* Text Color Swatches */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', overflowX: 'auto', paddingBottom: 6 }}>
              {TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setTextColor(c)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    background: c,
                    border: textColor === c ? '3px solid #ffffff' : '1px solid rgba(255,255,255,0.3)',
                    cursor: 'pointer',
                    flex: 'none',
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Sticker Selection Drawer */}
        {showStickerDrawer && (
          <div style={{
            position: 'absolute',
            inset: 0,
            zIndex: 25,
            background: 'rgba(0,0,0,0.92)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            flexDirection: 'column',
            padding: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <span style={{ color: '#ffffff', fontSize: 16, fontWeight: 800 }}>Add Sticker</span>
              <button
                onClick={() => setShowStickerDrawer(false)}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
              <div
                onClick={() => setShowPollBuilder(true)}
                className="hov k-squish"
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: 16,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  color: '#ffffff',
                }}
              >
                <span style={{ fontSize: 28 }}>📊</span>
                <span style={{ fontSize: 13, fontWeight: 800 }}>Poll Sticker</span>
              </div>

              <div
                onClick={handleAddStreakSticker}
                className="hov k-squish"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,107,0,0.3), rgba(255,0,85,0.3))',
                  borderRadius: 16,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  color: '#ffffff',
                }}
              >
                <span style={{ fontSize: 28 }}>🔥</span>
                <span style={{ fontSize: 13, fontWeight: 800 }}>Streak Badge</span>
              </div>

              <div
                onClick={handleAddHabitSticker}
                className="hov k-squish"
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: 16,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  color: '#ffffff',
                }}
              >
                <span style={{ fontSize: 28 }}>⚡</span>
                <span style={{ fontSize: 13, fontWeight: 800 }}>Habit Check-in</span>
              </div>
            </div>
          </div>
        )}

        {/* Poll Builder Sub-modal */}
        {showPollBuilder && (
          <div style={{
            position: 'absolute',
            inset: 0,
            zIndex: 35,
            background: 'rgba(0,0,0,0.92)',
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 14,
          }}>
            <span style={{ color: '#ffffff', fontSize: 15, fontWeight: 800, textAlign: 'center' }}>
              Create a Poll
            </span>

            <input
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="Ask a question..."
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 700,
                outline: 'none',
              }}
            />

            <input
              value={pollOpt1}
              onChange={(e) => setPollOpt1(e.target.value)}
              placeholder="Option 1"
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                color: '#ffffff',
                fontSize: 13,
                outline: 'none',
              }}
            />

            <input
              value={pollOpt2}
              onChange={(e) => setPollOpt2(e.target.value)}
              placeholder="Option 2"
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                color: '#ffffff',
                fontSize: 13,
                outline: 'none',
              }}
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button
                onClick={() => setShowPollBuilder(false)}
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddPollSticker}
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 10,
                  background: '#0095F6',
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Add to Story
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getCssFilter(filterName?: string): string {
  switch (filterName) {
    case 'clarendon': return 'contrast(1.2) saturate(1.25)';
    case 'gingham': return 'sepia(0.05) contrast(0.9) brightness(1.05)';
    case 'moon': return 'grayscale(1) contrast(1.1) brightness(1.1)';
    case 'juno': return 'contrast(1.15) saturate(1.4) hue-rotate(-5deg)';
    case 'lark': return 'contrast(0.9) saturate(1.1) brightness(1.1)';
    case 'slumber': return 'saturate(0.65) brightness(1.05) sepia(0.2)';
    default: return 'none';
  }
}
