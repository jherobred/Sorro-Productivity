import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

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
  themeColor: '#141210',
  width: 'device-width',
  initialScale: 1,
  // No maximumScale: Android WebView honours it, and this ships as an APK,
  // so capping it turned pinch-zoom off on the primary target (WCAG 1.4.4).
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Paint the stored theme/accent before first frame so there is no flash.
            The real values are reconciled from bd_profiles.prefs once signed in. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=JSON.parse(localStorage.getItem('basedly-prefs')||'{}');
var r=document.documentElement;
r.setAttribute('data-theme',p.theme==='light'?'light':'dark');
if(p.accent&&p.accent!=='#7C6CFF'){r.style.setProperty('--acc',p.accent);
r.style.setProperty('--accTx','color-mix(in srgb, '+p.accent+(p.theme==='light'?' 62%, #1C1A26)':' 82%, #FFFFFF)'));
r.style.setProperty('--gl2','color-mix(in srgb, '+p.accent+' 55%, transparent)');}
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
