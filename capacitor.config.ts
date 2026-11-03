import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.basedly.app',
  appName: 'Sorro',
  // The static export. One `npm run build` feeds both the website and the APK,
  // which is what keeps the two in sync — same code, same Supabase.
  webDir: 'out',
  // The app runs the live site, so every deploy reaches it on the next online
  // launch with no reinstall. The service worker (/sw.js) keeps a copy of every
  // page for offline launches. `offline.html` from the bundle shows only when
  // the very first launch has no connection and nothing is cached yet.
  server: {
    url: 'https://basedly-web-jhemsini.vercel.app',
    errorPath: 'offline.html',
  },
  android: {
    // The app is dark-first and owns all its own scrolling.
    backgroundColor: '#111113',
  },
  plugins: {
    // Edge to edge. With `overlaysWebView: false` the webview started below the
    // status bar, so the app was a page inside a grey frame rather than the
    // screen — and a body tab that is meant to be black to the edges cannot be.
    // The Shell frame is exactly 100dvh and already pads itself by
    // env(safe-area-inset-*), so it can be handed the whole display. The
    // transparent background is required: a colour here would repaint the strip
    // the overlay just gave us. (`backgroundColor` is documented as having no
    // effect while overlaysWebView is true; it is set for the moment before the
    // plugin loads.)
    StatusBar: { overlaysWebView: true, style: 'DARK', backgroundColor: '#00000000' },
  },
};

export default config;
