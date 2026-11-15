import { readFileSync } from 'node:fs';

/** @type {import('next').NextConfig} */
// Static export: one build serves both the Vercel site and the Capacitor shell.
// Everything talks to Supabase from the browser, so there is no server to lose.
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  // package.json is the one place the version lives; the app compares it with the deployed /version.json.
  env: { NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || JSON.parse(readFileSync('./package.json', 'utf8')).version },
};

export default nextConfig;
