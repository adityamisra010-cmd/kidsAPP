import type { ConfigContext, ExpoConfig } from 'expo/config';

import BRAND from './src/theme/brand.json';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: BRAND.appName,
  slug: 'mykids-tracker',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/brand/icon.png',
  scheme: BRAND.scheme,
  userInterfaceStyle: 'automatic',
  backgroundColor: BRAND.background,
  android: {
    package: process.env.ANDROID_PACKAGE ?? BRAND.androidPackage,
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: BRAND.background,
      foregroundImage: './assets/brand/adaptive-foreground.png',
      monochromeImage: './assets/brand/adaptive-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    softwareKeyboardLayoutMode: 'resize',
    permissions: [
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.SCHEDULE_EXACT_ALARM',
    ],
    blockedPermissions: ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION'],
    ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
  },
  ios: {
    bundleIdentifier: process.env.IOS_BUNDLE_ID ?? BRAND.androidPackage,
    supportsTablet: true,
  },
  web: { output: 'single', favicon: './assets/brand/favicon.png' },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: BRAND.background,
        image: './assets/brand/splash.png',
        imageWidth: 180,
        dark: { backgroundColor: '#1C1713', image: './assets/brand/splash.png' },
      },
    ],
    'expo-sqlite',
    'expo-video',
    'expo-sharing',
    'expo-localization',
    'expo-secure-store',
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow access to photos to attach pictures and practice videos.',
        cameraPermission: 'Allow camera access to record short home-practice videos.',
        microphonePermission: 'Allow microphone access so practice videos include sound.',
      },
    ],
    ['expo-notifications', { color: BRAND.primary, icon: './assets/brand/notification-icon.png' }],
    [
      'expo-build-properties',
      {
        android: { minSdkVersion: 26, enableProguardInReleaseBuilds: false },
      },
    ],
    'react-native-compressor',
    './plugins/withReleaseSigning',
  ],
  experiments: { typedRoutes: false, reactCompiler: false },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  },
});
