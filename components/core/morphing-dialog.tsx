'use client';

import React, {
  createContext,
  useContext,
  useState,
  useId,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, type Transition, type Variants } from 'motion/react';
import { X } from 'lucide-react';
import { useOverlayBack } from '@/lib/nav';

type MorphingDialogContextType = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  uniqueId: string;
  transition: Transition;
};

const MorphingDialogContext = createContext<MorphingDialogContextType | null>(null);

function useMorphingDialog() {
  const ctx = useContext(MorphingDialogContext);
  if (!ctx) throw new Error('useMorphingDialog must be used within MorphingDialog');
  return ctx;
}

export function MorphingDialog({
  children,
  transition = { type: 'spring', bounce: 0.05, duration: 0.28 },
}: {
  children: ReactNode;
  transition?: Transition;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const uniqueId = useId();

  return (
    <MorphingDialogContext.Provider
      value={{ isOpen, setIsOpen, uniqueId, transition }}
    >
      {children}
    </MorphingDialogContext.Provider>
  );
}

export function MorphingDialogTrigger({
  children,
  className = '',
  style = {},
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const { setIsOpen, uniqueId, transition } = useMorphingDialog();

  return (
    <motion.div
      layoutId={`dialog-container-${uniqueId}`}
      transition={transition}
      onClick={() => setIsOpen(true)}
      className={`cursor-pointer ${className}`}
      style={style}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setIsOpen(true);
        }
      }}
    >
      {children}
    </motion.div>
  );
}

export function MorphingDialogContainer({
  children,
}: {
  children: ReactNode;
}) {
  const { isOpen, setIsOpen } = useMorphingDialog();
  useOverlayBack(isOpen, () => setIsOpen(false));

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[160] flex items-center justify-center p-4 sm:p-6"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          {children}
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export function MorphingDialogContent({
  children,
  className = '',
  style = {},
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const { uniqueId, transition } = useMorphingDialog();

  return (
    <motion.div
      layoutId={`dialog-container-${uniqueId}`}
      transition={transition}
      className={`relative z-10 max-h-[90vh] overflow-y-auto ${className}`}
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </motion.div>
  );
}

export function MorphingDialogImage({
  src,
  alt = '',
  className = '',
  style = {},
}: {
  src: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { uniqueId, transition } = useMorphingDialog();

  return (
    <motion.img
      layoutId={`dialog-img-${uniqueId}`}
      transition={transition}
      src={src}
      alt={alt}
      className={className}
      style={style}
    />
  );
}

export function MorphingDialogTitle({
  children,
  className = '',
  style = {},
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const { uniqueId, transition } = useMorphingDialog();

  return (
    <motion.h2
      layoutId={`dialog-title-${uniqueId}`}
      transition={transition}
      className={className}
      style={style}
    >
      {children}
    </motion.h2>
  );
}

export function MorphingDialogSubtitle({
  children,
  className = '',
  style = {},
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const { uniqueId, transition } = useMorphingDialog();

  return (
    <motion.h3
      layoutId={`dialog-subtitle-${uniqueId}`}
      transition={transition}
      className={className}
      style={style}
    >
      {children}
    </motion.h3>
  );
}

export function MorphingDialogDescription({
  children,
  className = '',
  style = {},
  disableLayoutAnimation = false,
  variants,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  disableLayoutAnimation?: boolean;
  variants?: Variants;
}) {
  return (
    <motion.div
      variants={variants}
      initial={variants ? 'initial' : { opacity: 0, y: 10 }}
      animate={variants ? 'animate' : { opacity: 1, y: 0 }}
      exit={variants ? 'exit' : { opacity: 0, y: 10 }}
      transition={{ duration: 0.22, delay: 0.05 }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}

export function MorphingDialogClose({
  className = '',
  variants,
}: {
  className?: string;
  variants?: Variants;
}) {
  const { setIsOpen } = useMorphingDialog();

  return (
    <motion.button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setIsOpen(false);
      }}
      aria-label="Close dialog"
      variants={variants}
      initial={variants ? 'initial' : { opacity: 0, scale: 0.8 }}
      animate={variants ? 'animate' : { opacity: 1, scale: 1 }}
      exit={variants ? 'exit' : { opacity: 0, scale: 0.8 }}
      className={`absolute top-4 right-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors ${className}`}
    >
      <X className="h-4 w-4" />
    </motion.button>
  );
}
