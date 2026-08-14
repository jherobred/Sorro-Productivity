import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.basedly.app',
  appName: 'Basedly',
  // The static export. One `npm run build` feeds both the website and the APK,
  // which is what keeps the two in sync — same code, same Supabase.
  webDir: 'out',
  android: {
    // The app is dark-first and owns all its own scrolling.
    backgroundColor: '#07060D',
  },
  plugins: {
    StatusBar: { style: 'DARK', backgroundColor: '#0A0912' },
  },
};

export default config;
