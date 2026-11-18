# Voice calls: setup (in this order)

Calls need a NEW build of the app (new native parts). Nothing here works in Expo Go.

## 1. Database
Run `09_calls.sql` in the Supabase SQL editor. (pg_cron must be on, same as for scheduled posts.)

## 2. Edge functions (Supabase)
- Replace `supabase/functions/send-push/index.ts` with the new one in this patch and deploy it
  (`supabase functions deploy send-push`, or paste it in the dashboard). It adds the ringing / missed-call pushes.
- Deploy the new `supabase/functions/call-ice` (leave "Verify JWT" ON).
- Relay (TURN) server, so calls connect on every mobile network. Without it calls work on most Wi-Fi and
  some mobile networks only. Pick ONE, then add the secrets under Edge Functions > Secrets:
  - Your own coturn server: `TURN_URLS` (for example `turn:turn.yourdomain.com:3478?transport=udp,turns:turn.yourdomain.com:5349?transport=tcp`)
    and `TURN_SECRET` (the `static-auth-secret` in coturn's turnserver.conf, with `use-auth-secret` on).
  - A hosted free-tier relay such as Metered's: `METERED_DOMAIN` (like `yourapp.metered.live`) and `METERED_SECRET_KEY` (the secret key from their dashboard).
    Check their current free limits before relying on it.

## 3. App packages (run on your computer, in the project folder)
```
npx expo install react-native-webrtc @config-plugins/react-native-webrtc
```
This updates package.json and package-lock.json. Commit both. (If EAS says the lock file is out of date, this step was skipped.)

## 4. Build
Make a new EAS build and install it (`eas build -p android`). The first call needs the microphone allowed.

## Play Console
Using a foreground service of the microphone type must be declared in Play Console (App content > Foreground service permissions): "Voice calls: keeps a call going while the app is in the background."
