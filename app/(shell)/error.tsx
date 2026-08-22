'use client';

import { Crashed } from '@/components/Crashed';

/** Catches a throw inside any signed-in page, so one bad tab is not the app. */
export default function ShellError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  return <Crashed error={error} reset={reset} />;
}
