import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Hockey Runner MVP',
  slug: 'hockey-runner-mvp',
  version: '0.1.0',
  orientation: 'landscape',
  scheme: 'hockeyrunner',
  userInterfaceStyle: 'dark',
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.maxraw.hockeyrunner.mvp',
    infoPlist: {
      NSCameraUsageDescription:
        'Камера нужна для распознавания игрового поля и движения хоккейной шайбы.',
      NSLocalNetworkUsageDescription:
        'Локальная сеть нужна для соединения телефона-трекера и устройства с игрой.',
      NSBonjourServices: ['_hockeyrunner._tcp'],
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
      },
    },
  },
  android: {
    package: 'com.maxraw.hockeyrunner.mvp',
    permissions: [
      'CAMERA',
      'INTERNET',
      'ACCESS_NETWORK_STATE',
      'ACCESS_WIFI_STATE'
    ]
  },
  extra: {
    relayDefaultUrl: 'ws://192.168.1.5:8787',
    eas: {
      projectId: '00000000-0000-0000-0000-000000000000'
    }
  }
};

export default config;
