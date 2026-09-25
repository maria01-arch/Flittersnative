const fs = require('fs');
const path = require('path');

// Decode base64 secret to google-services.json during build if available
if (process.env.GOOGLE_SERVICES_BASE64) {
  const filePath = path.resolve(__dirname, './google-services.json');
  const fileContent = Buffer.from(process.env.GOOGLE_SERVICES_BASE64, 'base64').toString('utf-8');
  fs.writeFileSync(filePath, fileContent);
}

module.exports = {
  expo: {
    name: "Flitters",
    slug: "flitters-native",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/flitters-app-icon.png",
    scheme: "flittersnative",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    jsEngine: "hermes",
    backgroundColor: "#0B0F17",
    ios: {
      supportsTablet: true
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#6C5CE7",
        foregroundImage: "./assets/images/flitters-app-icon.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png"
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: "com.xchordlabs.flitters",
      useNextNotificationsApi: true,
      googleServicesFile: "./google-services.json"
    },
    web: {
      output: "static",
      favicon: "./assets/images/flitters-app-icon.png"
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/flitters-logo.png",
          imageWidth: 160,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#0B0F17"
          }
        }
      ],
      "expo-font",
      "expo-image",
      "expo-status-bar",
      "expo-web-browser",
      "expo-video",
      "expo-system-ui",
      [
        "expo-notifications",
        {
          icon: "./assets/images/flitters-logo.png",
          color: "#6C5CE7"
        }
      ],
      [
        "expo-audio",
        {
          microphonePermission: "Allow Flitters to access your microphone."
        }
      ]
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true
    },
    extra: {
      router: {},
      eas: {
        projectId: "8593f64a-594b-4a8c-b73f-36ff25480d9d"
      }
    }
  }
};

