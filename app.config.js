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
      googleServicesFile: "./google-services.json",
      // Every one of these came from a package's default Android manifest
      // (expo-audio/expo-video defensively requesting background media
      // continuation, expo-notifications requesting boot-rescheduling),
      // not from anything Flitters actually does: nothing plays audio or
      // video in the background, nothing needs to run at boot, and
      // nothing draws over other apps. Each also requires its own
      // justification in Play Console's Data Safety form, so unused ones
      // are pure liability with no upside.
      //
      // WAKE_LOCK is deliberately NOT in this list anymore. It used to be,
      // and blocking it silently broke push notifications: Firebase Cloud
      // Messaging (what actually delivers pushes on Android) takes a brief
      // wake lock when a message arrives, and without the permission that
      // throws a SecurityException instead of showing the notification.
      // It's a normal-protection permission with no Play Console
      // declaration needed, so leaving it in costs nothing.
      blockedPermissions: [
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
        "android.permission.SYSTEM_ALERT_WINDOW",
        "android.permission.RECEIVE_BOOT_COMPLETED"
      ]
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
          // Was pure white — same washout problem as the landing page had,
          // but the landing page's fix (an outline traced from the actual
          // image, several tinted copies layered behind it) can't be
          // applied here: this screen is drawn by the OS from this one
          // static image before any JavaScript has run, so there's no
          // code running to layer anything. A background a shade off pure
          // white is the honest fix available at this layer — a real
          // outline would need a version of the PNG with one baked in.
          backgroundColor: "#F4F2FA",
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
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission: "Allow Flitters to use your location to power suggestions and help keep your account secure. Location is only ever used while the app is open."
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
        projectId: "ef10ac98-f4c6-49f4-9696-ec91ea12ba2c"
      }
    }
  }
};

