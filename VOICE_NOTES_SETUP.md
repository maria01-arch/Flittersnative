# Patch v12 — real logo, feed layout bug, duplicate-key crash, chat badge

## Install
```bash
cd ~/flitters-native
unzip -o ~/storage/downloads/flitters-patch-v12.zip -d ~/flitters-native
```
This round changes `app.json` (icon/splash paths) and adds new binary assets, so it needs the real rebuild, not just a Metro reload:
```bash
EAS_SKIP_AUTO_FINGERPRINT=1 eas build -p android --profile preview
```
(Metro alone will still show the redesigned landing page fine, since that part is just code — it's specifically the app icon/splash that need the rebuild.)

## 1. Landing page — real logo, no more paper-plane icon
Used the logo you sent (`459560.png` — the one with actual transparency, so it drops cleanly onto light or dark backgrounds) instead of the generic icon-in-a-circle placeholder. Removed the glowing-circle animation gimmick too — just the mark, the wordmark, and the tagline, which reads as more deliberate. Also used it for the app icon and splash screen, since you clearly meant it as the real brand mark, not just a landing-page graphic.

## 2. Feed layout — real regression, found and fixed
You were right — I broke this in the repost redesign. The avatar and the name used to be their own row sitting to the left of a second column holding everything else (name, post text, image, action buttons), so that whole column was naturally indented past the avatar. My rewrite collapsed all of that into one single vertical stack with the avatar just being the first inline thing in the header — which meant the text, image, and buttons *below* the header had nothing indenting them anymore, so they all snapped flush to the left edge, under the avatar, instead of aligning with the name. Rebuilt `components/PostCard.tsx` with the correct two-column structure (fixed-width avatar column, flexible content column) — same fix applies to both normal posts and reposts.

## 3. Duplicate-key crash-risk warning — also from the repost merge
The same post can legitimately appear more than once in the merged feed (reposted by more than one person you follow) — every one of those was reusing the *original post's* id as its React key, so two entries for the same post collided. Kept `id` as the real post id (still needed for likes/comments/reposts to target the right thing) but added a separate `feedKey` that's unique per feed entry — the `FlatList` now keys off that instead.

## 4. Verified badge missing in chat
The DM top bar was only ever working off whatever got passed in as navigation params (name, avatar) — never the full profile, so there was no verified/authentic data available there at all, from any screen that links into a chat. `app/conversation/[id].tsx` now fetches the other person's profile directly on load and shows their badge next to their name in the header, regardless of how you got into that chat.

## Files touched this round
- `app/landing.tsx`, `app.json`, `assets/images/flitters-logo.png`, `assets/images/flitters-app-icon.png` (new) — real logo everywhere
- `components/PostCard.tsx` — fixed the layout regression
- `app/(tabs)/index.tsx` — fixed the duplicate-key bug
- `app/conversation/[id].tsx` — verified badge in chat header
