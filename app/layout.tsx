import type { Metadata, Viewport } from 'next';
import { Familjen_Grotesk } from 'next/font/google';
import './globals.css';
import './studio.css';
import './recovery-planning.css';
import './daily-workspace.css';
import './tokens.css';
import './motion.css';
import { Providers } from './providers';

/* next/font downloads these at build time and emits them as static assets, so
   the APK never reaches for a CDN. globals.css maps them onto --font-heading,
   --font-body and --font-mono, which is what every component actually reads. */
const display = Familjen_Grotesk({
  subsets: ['latin'], weight: ['500', '600', '700'], variable: '--f-display', display: 'swap',
});

export const metadata: Metadata = {
  title: 'Sorro',
  description: 'Notes, calendar and tasks with an assistant.',
  // Added to the home screen, the site opens as its own window with no address
  // bar — the web half of "full screen on a phone". iOS reads these two rather
  // than the manifest's `display`.
  appleWebApp: { capable: true, title: 'Sorro', statusBarStyle: 'black-translucent' },
  icons: { icon: '/brand/app-icon.png', apple: '/brand/app-icon.png' },
  // A plain file in public/ rather than an app/manifest.ts metadata route:
  // under `output: export` that route needs `dynamic = 'force-static'` and then
  // still has to agree with `trailingSlash`. A static file has no opinions.
  manifest: '/manifest.webmanifest',
};

const SUPABASE_ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#F7F6F4' }, { media: '(prefers-color-scheme: dark)', color: '#111113' }],
  width: 'device-width',
  initialScale: 1,
  // No maximumScale: Android WebView honours it, and this ships as an APK,
  // so capping it turned pinch-zoom off on the primary target (WCAG 1.4.4).
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning
      className={display.variable}>
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
            hashes each page's inline blocks into a per-path header.

            Dev needs one extra source: the webpack runtime executes modules
            through eval, so without `unsafe-eval` in development every page
            dies on its first module. It is added only when NODE_ENV is
            development at build time — the shipped export never carries it. */}
        <meta
          httpEquiv="Content-Security-Policy"
          content={`default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob: https://jdkbnsjczanvmmpsovhm.supabase.co; connect-src 'self' https://jdkbnsjczanvmmpsovhm.supabase.co wss://jdkbnsjczanvmmpsovhm.supabase.co https://huggingface.co https://*.huggingface.co https://*.hf.co https://*.xethub.hf.co https://cdn.jsdelivr.net https://nominatim.openstreetmap.org https://www.googleapis.com https://api.open-meteo.com https://geocoding-api.open-meteo.com; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'`}
        />

        {/* Every screen's first job is a Supabase call, and ~65% of that first
            round trip is DNS + TCP + TLS, not the query. Opening the socket
            while the bundle is still parsing takes that off the critical path.
            `crossOrigin` is required: Supabase requests are CORS, and a
            preconnect in the wrong credentials mode is not reused. The URL is
            read from env so it stays a single source of truth — under
            `output: export` it is inlined at build time. */}
        {SUPABASE_ORIGIN && (
          <>
            <link rel="preconnect" href={SUPABASE_ORIGIN} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={SUPABASE_ORIGIN} />
          </>
        )}

        {/* Paint the stored theme and motion before first frame so there is no flash.
            The real values are reconciled from sorro_profiles.prefs once signed in. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{[localStorage,sessionStorage].forEach(function(s){var o=[];for(var i=0;i<s.length;i++){var k=s.key(i);if(/^basedly[-_]/.test(k))o.push(k);}o.forEach(function(k){try{if(k!=='basedly-cache'){var n=k.replace(/^basedly/,'sorro');if(s.getItem(n)===null)s.setItem(n,s.getItem(k));}s.removeItem(k);}catch(e){}});});}catch(e){}
try{var p=JSON.parse(localStorage.getItem('sorro-prefs')||'{}');
var r=document.documentElement;
var t=p.theme==='dark'||p.theme==='light'?p.theme:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
r.setAttribute('data-theme',t);
var mo=typeof p.motion==='boolean'?p.motion:!matchMedia('(prefers-reduced-motion: reduce)').matches;
r.setAttribute('data-motion',mo?'on':'off');
if(!mo){r.style.setProperty('--anim','paused');r.classList.add('nomo');}
}catch(e){}})();`,
          }}
        />
        {/* Offline shell for the website, the APK and the desktop app. Only the
            export has a /sw.js; `next dev` would cache stale dev chunks. */}
        {process.env.NODE_ENV === 'production' && (
          <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator)addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})});` }} />
        )}
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
