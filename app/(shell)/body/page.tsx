'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Body is two tabs now: `/gym` and `/fuel`.
 *
 * The route stays as a redirect rather than being deleted, because it is in
 * people's history, in the `g o` keyboard shortcut, and in whatever the phone's
 * nav was last customised to. Sending it to Gym rather than to a chooser is the
 * right default: a chooser would be a screen whose only content is the fact
 * that something moved.
 *
 * `replace` rather than `push` so Back does not bounce off this page forever.
 */
export default function BodyPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/gym/'); }, [router]);
  return <div style={{ height: 200 }} aria-hidden />;
}
