'use client';
import { useState } from 'react';
import { Fox } from '@/components/Fox';
import { CaptureSheet } from '@/components/CaptureSheet';

/** Placeholder until S3 puts the assistant here. */
export default function HomePage() {
  const [capture, setCapture] = useState(false);
  return <div className="sx-empty">
    <Fox pose="sleep" size={56} tone="muted" />
    <p>Sorro’s assistant lands here next.</p>
    <button className="sx-pill" onClick={() => setCapture(true)}>Quick capture</button>
    {capture && <CaptureSheet kind="task" onClose={() => setCapture(false)} />}
  </div>;
}
