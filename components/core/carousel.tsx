'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  Children,
  type ReactNode,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type CarouselContextType = {
  index: number;
  setIndex: (i: number) => void;
  total: number;
  setTotal: (t: number) => void;
  next: () => void;
  prev: () => void;
  isPaused: boolean;
  setIsPaused: (p: boolean) => void;
};

const CarouselContext = createContext<CarouselContextType | null>(null);

export function useCarousel() {
  const ctx = useContext(CarouselContext);
  if (!ctx) throw new Error('useCarousel must be used within a <Carousel>');
  return ctx;
}

export type CarouselProps = {
  children: ReactNode;
  className?: string;
  autoPlayInterval?: number;
  initialIndex?: number;
  style?: React.CSSProperties;
};

export function Carousel({
  children,
  className = '',
  autoPlayInterval = 6500,
  initialIndex = 0,
  style = {},
}: CarouselProps) {
  const [index, setIndex] = useState(initialIndex);
  const [total, setTotal] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const next = useCallback(() => {
    if (total <= 1) return;
    setIndex((prev) => (prev + 1) % total);
  }, [total]);

  const prev = useCallback(() => {
    if (total <= 1) return;
    setIndex((prev) => (prev - 1 + total) % total);
  }, [total]);

  useEffect(() => {
    if (total <= 1 || isPaused || autoPlayInterval <= 0) return;
    const timer = setInterval(next, autoPlayInterval);
    return () => clearInterval(timer);
  }, [total, isPaused, autoPlayInterval, next]);

  return (
    <CarouselContext.Provider
      value={{
        index,
        setIndex,
        total,
        setTotal,
        next,
        prev,
        isPaused,
        setIsPaused,
      }}
    >
      <div
        className={`relative overflow-hidden ${className}`}
        style={style}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {children}
      </div>
    </CarouselContext.Provider>
  );
}

export type CarouselContentProps = {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export function CarouselContent({
  children,
  className = '',
  style = {},
}: CarouselContentProps) {
  const { index, setTotal } = useCarousel();
  const items = Children.toArray(children);

  useEffect(() => {
    setTotal(items.length);
  }, [items.length, setTotal]);

  return (
    <div
      className={`relative w-full overflow-hidden ${className}`}
      style={{ minHeight: '100%', ...style }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={index}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="w-full"
        >
          {items[index]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export type CarouselItemProps = {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export function CarouselItem({
  children,
  className = '',
  style = {},
}: CarouselItemProps) {
  return (
    <div className={`w-full ${className}`} style={style}>
      {children}
    </div>
  );
}

export type CarouselNavigationProps = {
  alwaysShow?: boolean;
  className?: string;
};

export function CarouselNavigation({
  alwaysShow = false,
  className = '',
}: CarouselNavigationProps) {
  const { prev, next, total } = useCarousel();
  if (total <= 1) return null;

  return (
    <div
      className={`flex items-center gap-1 ${
        alwaysShow ? 'opacity-100' : 'opacity-0 hover:opacity-100 transition-opacity'
      } ${className}`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          prev();
        }}
        aria-label="Previous slide"
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/90 text-zinc-300 transition-colors hover:bg-zinc-800 active:scale-95"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          next();
        }}
        aria-label="Next slide"
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/90 text-zinc-300 transition-colors hover:bg-zinc-800 active:scale-95"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export type CarouselIndicatorProps = {
  className?: string;
};

export function CarouselIndicator({ className = '' }: CarouselIndicatorProps) {
  const { index, setIndex, total } = useCarousel();
  const count = total > 0 ? total : 1;

  return (
    <div className={`flex items-center justify-center gap-1.5 py-1.5 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Go to slide ${i + 1}`}
          onClick={(e) => {
            e.stopPropagation();
            setIndex(i);
          }}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === (index % count)
              ? 'w-5 bg-amber-400 dark:bg-amber-400'
              : 'w-1.5 bg-zinc-600/60 hover:bg-zinc-400'
          }`}
        />
      ))}
    </div>
  );
}

export function CarouselBasic() {
  return (
    <div className="relative w-full max-w-xs">
      <Carousel>
        <CarouselContent>
          <CarouselItem className="p-4">
            <div className="flex aspect-square items-center justify-center border border-zinc-200 dark:border-zinc-800">
              1
            </div>
          </CarouselItem>
          <CarouselItem className="p-4">
            <div className="flex aspect-square items-center justify-center border border-zinc-200 dark:border-zinc-800">
              2
            </div>
          </CarouselItem>
          <CarouselItem className="p-4">
            <div className="flex aspect-square items-center justify-center border border-zinc-200 dark:border-zinc-800">
              3
            </div>
          </CarouselItem>
          <CarouselItem className="p-4">
            <div className="flex aspect-square items-center justify-center border border-zinc-200 dark:border-zinc-800">
              4
            </div>
          </CarouselItem>
        </CarouselContent>
        <CarouselNavigation alwaysShow />
        <CarouselIndicator />
      </Carousel>
    </div>
  );
}
