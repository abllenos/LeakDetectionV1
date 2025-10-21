export default {
  expo: {
    name: "LeakDetection",
    slug: "leakdetection",
    version: "2.0.0",
    platforms: ["ios", "android", "web"],
    orientation: "portrait",
    icon: "./assets/DCWD LOGO.png",
    updates: {
      enabled: false,
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      buildNumber: "3",
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
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
      ],
      adaptiveIcon: {
        foregroundImage: "./assets/DCWD LOGO.png",
        backgroundColor: "#1e5a8e",
      },
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY || "",
        },
      },
    },
    web: {},
    extra: {
      eas: {
        projectId: "dc7416d6-d011-429f-84c8-03812f11727f",
      },
    },
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
