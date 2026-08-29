'use client';

import React, {
  createContext,
  useContext,
  useState,
  useId,
  useRef,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { motion, AnimatePresence, type Transition } from 'motion/react';
import useClickOutside from '@/hooks/useClickOutside';

type MorphingPopoverContextType = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  uniqueId: string;
  transition: Transition;
};

const MorphingPopoverContext = createContext<MorphingPopoverContextType | null>(null);

function useMorphingPopover() {
  const ctx = useContext(MorphingPopoverContext);
  if (!ctx) throw new Error('useMorphingPopover must be used within MorphingPopover');
  return ctx;
}

export function MorphingPopover({
  children,
  open,
  onOpenChange,
  transition = { type: 'spring', bounce: 0.05, duration: 0.3 },
}: {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  transition?: Transition;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof open === 'boolean';
  const isOpen = isControlled ? open : internalOpen;
  const uniqueId = useId();

  const setIsOpen = (val: boolean) => {
    if (!isControlled) setInternalOpen(val);
    onOpenChange?.(val);
  };

  return (
    <MorphingPopoverContext.Provider
      value={{ isOpen, setIsOpen, uniqueId, transition }}
    >
      <div className="relative inline-block">{children}</div>
    </MorphingPopoverContext.Provider>
  );
}

export function MorphingPopoverTrigger({
  children,
  className = '',
  style = {},
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const { isOpen, setIsOpen, uniqueId, transition } = useMorphingPopover();

  if (isOpen) return null;

  return (
    <motion.button
      type="button"
      layoutId={`popover-${uniqueId}`}
      transition={transition}
      onClick={() => setIsOpen(true)}
      className={`cursor-pointer ${className}`}
      style={style}
    >
      {children}
    </motion.button>
  );
}

export function MorphingPopoverContent({
  children,
  className = '',
  style = {},
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const { isOpen, setIsOpen, uniqueId, transition } = useMorphingPopover();
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => {
    if (isOpen) setIsOpen(false);
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={ref}
          layoutId={`popover-${uniqueId}`}
          transition={transition}
          className={`absolute left-0 top-0 z-30 overflow-hidden ${className}`}
          style={style}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
