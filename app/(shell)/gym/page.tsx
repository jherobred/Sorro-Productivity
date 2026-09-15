'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Gym is Fitness now. The old address stays as a redirect, because it is in
 * people's history and in whatever the phone's nav was last set to.
 * `replace` so Back does not land here again.
 */
export default function GymPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/fitness/'); }, [router]);
  return <div style={{ height: 200 }} aria-hidden />;
}
