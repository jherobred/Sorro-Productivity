'use client';

import { Crashed } from '@/components/Crashed';

/**
 * The last boundary. This one replaces the root layout, so it has to render its
 * own <html> and <body> — that is a framework requirement, not a style choice.
 */
export default function GlobalError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <Crashed error={error} reset={reset} />
      </body>
    </html>
  );
}
