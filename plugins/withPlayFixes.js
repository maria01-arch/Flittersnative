// Fixes the two Google Play Console warnings, without changing what the app does:
//  1) "Required hardware feature declarations are restricting availability" (screen.portrait, wifi):
//     those features are declared as optional, so phones/tablets without them can still install the app.
//  2) "No deobfuscation file / native debug symbols": release builds are now minified (R8), which makes
//     the Android bundle carry its own mapping file, and native symbols are included, so Play can read crash reports.
const { withAndroidManifest, withGradleProperties, withAppBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const OPTIONAL_FEATURES = [
  'android.hardware.screen.portrait',
  'android.hardware.wifi',
  'android.hardware.screen.landscape',
  'android.hardware.touchscreen',
  'android.hardware.camera',
  'android.hardware.camera.autofocus',
  'android.hardware.microphone',
  'android.hardware.telephony',
  'android.hardware.bluetooth',
  'android.hardware.location',
  'android.hardware.location.gps',
  'android.hardware.faketouch',
];

const KEEP_RULES = `
# --- Flitters keep rules (added by plugins/withPlayFixes.js) ---
# Voice calls (WebRTC) look up classes by name.
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**
# Our own native modules.
-keep class expo.modules.flitters** { *; }
# Stack traces stay readable in Play Console.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
`;

module.exports = function withPlayFixes(config) {
  config = withAndroidManifest(config, (c) => {
    const m = c.modResults.manifest;
    m['uses-feature'] = (m['uses-feature'] || []).filter((f) => !OPTIONAL_FEATURES.includes(f.$?.['android:name']));
    for (const name of OPTIONAL_FEATURES) {
      m['uses-feature'].push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
    return c;
  });

  config = withGradleProperties(config, (c) => {
    const set = (key, value) => {
      c.modResults = c.modResults.filter((p) => !(p.type === 'property' && p.key === key));
      c.modResults.push({ type: 'property', key, value });
    };
    set('android.enableMinifyInReleaseBuilds', 'true');
    set('android.enableShrinkResourcesInReleaseBuilds', 'true');
    return c;
  });

  // native debug symbols inside the bundle
  config = withAppBuildGradle(config, (c) => {
    if (!c.modResults.contents.includes("debugSymbolLevel")) {
      c.modResults.contents = c.modResults.contents.replace(
        /defaultConfig\s*\{/,
        "defaultConfig {\n        ndk { debugSymbolLevel 'SYMBOL_TABLE' }"
      );
    }
    return c;
  });

  config = withDangerousMod(config, [
    'android',
    async (c) => {
      const file = path.join(c.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      let current = '';
      try { current = fs.readFileSync(file, 'utf8'); } catch {}
      if (!current.includes('Flitters keep rules')) fs.writeFileSync(file, current + KEEP_RULES);
      return c;
    },
  ]);

  return config;
};
