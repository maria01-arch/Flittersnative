const fs = require('fs');
const path = require('path');

// Decode base64 secret to google-services.json during build if available
if (process.env.GOOGLE_SERVICES_BASE64) {
  const filePath = path.resolve(__dirname, './google-services.json');
  const fileContent = Buffer.from(process.env.GOOGLE_SERVICES_BASE64, 'base64').toString('utf-8');
  fs.writeFileSync(filePath, fileContent);
}

const site = require('./site.config.js');

let hasShareIntent = false;
try {
  require.resolve('expo-share-intent/package.json');
  hasShareIntent = true;
} catch (e) {
  hasShareIntent = false;
}

// Saving pictures/videos to the gallery. Added to the build only once the package is installed.
let hasMediaLibrary = false;
try {
  require.resolve('expo-media-library/package.json');
  hasMediaLibrary = true;
} catch (e) {
  hasMediaLibrary = false;
}

module.exports = {
  expo: {
    name: "Flitters",
    slug: "flitters-native",
    version: "1.0.4",
    orientation: "portrait",
    icon: "./assets/images/flitters-app-icon.png",
    scheme: "flittersnative",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    jsEngine: "hermes",
    backgroundColor: "#05060A",
    ios: {
      supportsTablet: true
    },
    android: {
      // Stops the phone's backup from copying the app's saved sign-in to another device.
      allowBackup: false,
      // Links to xchord.space open the app instead of the browser. For Android
      // to trust this, the website must list this app in its assetlinks.json
      // (see the setup steps in the chat).
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: site.ALL_HOSTS.flatMap((host) =>
            ['/join', '/p/', '/post/', '/user/', '/u/', '/hashtag/'].map((pathPrefix) => ({ scheme: 'https', host, pathPrefix }))
          ),
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
      adaptiveIcon: {
        backgroundColor: "#000000",
        foregroundImage: "./assets/images/android-icon-foreground.png",
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
        "android.permission.RECEIVE_BOOT_COMPLETED",
        // Location is never used (login history uses an approximate place from
        // the internet connection), so the app must not even declare it.
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION"
      ]
    },
    web: {
      output: "static",
      favicon: "./assets/images/flitters-app-icon.png"
    },
    plugins: [
      "expo-router",
      "expo-iap",
      ...(hasMediaLibrary ? [["expo-media-library", { savePhotosPermission: "Flitters saves the pictures and videos you choose to your gallery.", isAccessMediaLocationEnabled: false }]] : []),
      // Lets Flitters appear in the phone's Share list (text, links, photos,
      // videos). Android only; needs an EAS build. Skipped quietly when the
      // package is not installed yet, so the app still starts.
      ...(hasShareIntent
        ? [
            [
              "expo-share-intent",
              {
                disableIOS: true,
                androidIntentFilters: ["text/*", "image/*", "video/*"],
                androidMultiIntentFilters: ["image/*", "video/*"]
              }
            ]
          ]
        : []),
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
            backgroundColor: "#05060A"
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
          color: "#3DA9FF",
          // The Flitters notification sound (needs a new EAS build to take effect).
          sounds: ["./assets/sounds/flit.wav"]
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

