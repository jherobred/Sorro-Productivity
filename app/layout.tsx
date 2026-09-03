import type { Metadata, Viewport } from 'next';
import { Familjen_Grotesk, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

/* next/font downloads these at build time and emits them as static assets, so
   the APK never reaches for a CDN. globals.css maps them onto --font-heading,
   --font-body and --font-mono, which is what every component actually reads. */
const display = Familjen_Grotesk({
  subsets: ['latin'], weight: ['500', '600', '700'], variable: '--f-display', display: 'swap',
});
const body = IBM_Plex_Sans({
  subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--f-body', display: 'swap',
});
const mono = IBM_Plex_Mono({
  subsets: ['latin'], weight: ['400', '500', '600'], variable: '--f-mono', display: 'swap',
});

export const metadata: Metadata = {
  title: 'Basedly',
  description: 'Your whole week, one surface.',
  // Added to the home screen, the site opens as its own window with no address
  // bar — the web half of "full screen on a phone". iOS reads these two rather
  // than the manifest's `display`.
  appleWebApp: { capable: true, title: 'Basedly', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  // A plain file in public/ rather than an app/manifest.ts metadata route:
  // under `output: export` that route needs `dynamic = 'force-static'` and then
  // still has to agree with `trailingSlash`. A static file has no opinions.
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#0B0A13',
  width: 'device-width',
  initialScale: 1,
  // No maximumScale: Android WebView honours it, and this ships as an APK,
  // so capping it turned pinch-zoom off on the primary target (WCAG 1.4.4).
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <head>
        {/* The same policy vercel.json sends as a header, repeated here because
            the Android shell never sees that header — Capacitor serves this HTML
            from https://localhost, not from Vercel's edge, so a meta tag is the
            only CSP the WebView will ever read. `frame-ancestors` is absent
            because it is header-only; vercel.json carries it for the website.

            `script-src` has to allow inline: a static export ships Next's
            hydration payload as ~7 inline <script> blocks whose contents change
            per page and per build, and with no server there is no request to
            mint a nonce from. So this does NOT stop script injection. What it
            does stop is the part that turns an injection into a breach —
            `connect-src` means injected script cannot post the refresh tokens in
            localStorage to an attacker's host, and object/base-uri close the
            usual sidedoors. Tightening script-src needs a post-build step that
            hashes each page's inline blocks into a per-path header. */}
        <meta
          httpEquiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://jdkbnsjczanvmmpsovhm.supabase.co https://images.unsplash.com; media-src 'self' blob: https://jdkbnsjczanvmmpsovhm.supabase.co; connect-src 'self' https://jdkbnsjczanvmmpsovhm.supabase.co wss://jdkbnsjczanvmmpsovhm.supabase.co; object-src 'none'; base-uri 'none'; form-action 'self'"
        />
        {/* Paint the stored theme/accent before first frame so there is no flash.
            The real values are reconciled from bd_profiles.prefs once signed in. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=JSON.parse(localStorage.getItem('basedly-prefs')||'{}');
var r=document.documentElement;
r.setAttribute('data-theme',p.theme==='light'?'light':'dark');
var ac=p.accent==='#7C6CFF'?'#8B7CFF':p.accent;
if(ac){r.style.setProperty('--acc',ac);
r.style.setProperty('--accTx','color-mix(in srgb, '+ac+(p.theme==='light'?' 62%, #1C1A26)':' 82%, #FFFFFF)'));
r.style.setProperty('--gl2','color-mix(in srgb, '+ac+' 55%, transparent)');}
var mo=p.motion!==false;
r.setAttribute('data-motion',mo?'on':'off');
if(!mo){r.style.setProperty('--anim','paused');r.classList.add('nomo');}
}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
