'use client';

import React, { useEffect, useState, Children } from 'react';

export type TextLoopProps = {
  children: React.ReactNode;
  className?: string;
  interval?: number;
  style?: React.CSSProperties;
};

export function TextLoop({
  children,
  className = '',
  interval = 3200,
  style = {},
}: TextLoopProps) {
  const items = Children.toArray(children);
  const [index, setIndex] = useState(0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (items.length <= 1) return;

    const timer = setInterval(() => {
      setAnimating(true);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % items.length);
        setAnimating(false);
      }, 300); // halfway transition
    }, interval);

    return () => clearInterval(timer);
  }, [items.length, interval]);

  if (items.length === 0) return null;

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
        verticalAlign: 'middle',
        minHeight: '1.4em',
        ...style,
      }}
    >
      <span
        style={{
          display: 'inline-block',
          opacity: animating ? 0 : 1,
          transform: animating ? 'translateY(-8px)' : 'translateY(0)',
          transition: 'opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1), transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {items[index]}
      </span>
    </span>
  );
}
