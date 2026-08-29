'use client';

import React, { useRef, useState } from 'react';
import { motion, MotionConfig, type Transition } from 'motion/react';
import useClickOutside from '@/hooks/useClickOutside';
import { ArrowLeft, Search } from 'lucide-react';

const transition: Transition = {
  type: 'spring',
  bounce: 0.1,
  duration: 0.22,
};

export function ToolbarDynamic({
  onSearch,
  placeholder = 'Search anything...',
}: {
  onSearch?: (query: string) => void;
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => {
    setIsOpen(false);
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    onSearch?.(val);
  };

  return (
    <MotionConfig transition={transition}>
      <div className="relative inline-flex items-center" ref={containerRef}>
        <motion.div
          animate={{
            width: isOpen ? '280px' : '36px',
            borderRadius: isOpen ? '12px' : '50%',
          }}
          initial={false}
          className="overflow-hidden border border-[var(--line2)] bg-[var(--card2)] shadow-sm"
          style={{ height: '36px' }}
        >
          {!isOpen ? (
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              aria-label="Search"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--tx2)] hover:text-[var(--tx)] transition-colors active:scale-95"
            >
              <Search className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex h-full w-full items-center gap-1.5 px-2">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setQuery('');
                  onSearch?.('');
                }}
                aria-label="Back"
                className="flex h-7 w-7 flex-none items-center justify-center rounded-md text-[var(--tx2)] hover:text-[var(--tx)] transition-colors active:scale-95"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <input
                value={query}
                onChange={handleChange}
                autoFocus
                placeholder={placeholder}
                className="h-full w-full bg-transparent text-[13px] font-medium text-[var(--tx)] placeholder-[var(--tx3)] focus:outline-none"
              />
              <Search className="h-3.5 w-3.5 flex-none text-[var(--tx3)] mr-1" />
            </div>
          )}
        </motion.div>
      </div>
    </MotionConfig>
  );
}
