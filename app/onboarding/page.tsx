'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function OnboardingRedirect() { const router = useRouter(); useEffect(() => { router.replace('/home/'); }, [router]); return <main role='status'>Opening your workspace…</main>; }
