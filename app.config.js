export default {
  expo: {
    name: "LeakDetection",
    slug: "leakdetection",
    version: "1.0.7",
    platforms: ["ios", "android"],
    orientation: "portrait",
  icon: "./assets/leaklogo.png",
    updates: {
      enabled: false,
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      buildNumber: "11",
      runtimeVersion: {
        policy: "appVersion",
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          "This app needs your location to detect leaks and show nearby meters.",
        NSLocationAlwaysAndWhenInUseUsageDescription:
          "This app needs your location in the background to track your position for leak detection.",
        NSCameraUsageDescription:
          "This app needs access to your camera to take photos of leaks and landmarks.",
        NSPhotoLibraryUsageDescription:
          "This app needs access to your photo library to select images for leak reports.",
      },
    },
    android: {
      package: "com.leakdetection.app",
      versionCode: 11,
      runtimeVersion: "1.0.0",
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
      ],
      adaptiveIcon: {
        foregroundImage: "./assets/leaklogo.png",
        backgroundColor: "#1e5a8e",
      },
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY || "",
        },
      },
    },
    extra: {
      eas: {
        projectId: "71802a68-9117-40a6-ad7f-486ec32822ab",
      },
    },
    owner: "bogarttt",
    plugins: [
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "Allow LeakDetection to use your location for leak detection and tracking.",
        },
      ],
    ],
  },
};
