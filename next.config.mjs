/** @type {import('next').NextConfig} */
// Static export: one build serves both the Vercel site and the Capacitor shell.
// Everything talks to Supabase from the browser, so there is no server to lose.
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
