import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ciabosoftwaresolutions.liveactivitiesexample',
  appName: 'Live Activities Example',
  webDir: 'dist',
  plugins: {
    LiveActivities: {},
  },
};

export default config;
