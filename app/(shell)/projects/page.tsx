'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Projects moved into My Tasks, where they slide into the side column. An old
 * link to a project still lands on that project; any other lands on the shelf.
 */
export default function ProjectsMoved() {
  const router = useRouter();
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('open');
    router.replace(id ? `/tasks/?project=${encodeURIComponent(id)}` : '/tasks/?projects=1');
  }, [router]);
  return null;
}
