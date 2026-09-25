# Batch — reel thumbnails, video autoplay, action sheets, input sizing, profile animation, notifications

## Install
```bash
cd ~/flitters-native
npx expo install expo-video-thumbnails
unzip -o ~/storage/downloads/flitters-round2.zip -d ~/flitters-native
npx expo start --localhost --clear --max-workers 1
```
Pure JS — no rebuild, no SQL this time.

## 1. Reel preview row — no more autoplay, no more black boxes
Rebuilt to pull an actual still frame from each video once (`expo-video-thumbnails`) and show that as a plain image — no video player mounted in this row at all anymore. That also explains the black boxes: whatever was showing there before either wasn't playing or hadn't decoded a frame yet. Since nothing autoplays here now, I also removed the whole "cycle through one at a time" machinery from the home feed — it's not needed anymore.

## 2. Feed video posts — one at a time
Now uses the same approach reels.tsx already uses: tracks which post is actually in view (`onViewableItemsChanged`) and only that one autoplays (still muted, no controls); every other video post pauses. Scrolling past several video posts won't stack up multiple decoders anymore.

## 3. Swipe-to-report menu — found the actual bug
Android's native `Alert.alert` silently breaks past 3 buttons — it's built for a simple positive/negative/neutral dialog, not an arbitrary list. Your menu had 4 (Block, Delete, Report, Cancel), so Cancel was quietly getting dropped every time. Built a proper custom bottom-sheet component (`components/ActionSheet.tsx`) with no such limit, styled to match the app instead of looking like a bare OS popup — used for both the chat swipe menu and the profile's "..." menu now.

## 4. Bigger message input, mic, and send controls
Sized up the text box, mic icon, and send icon in both DMs and group chat, plus a larger tap target (`hitSlop`) so they're easier to hit.

## 5. Couldn't swipe-to-reply while the keyboard was open
`FlatList` defaults to swallowing the first touch just to dismiss the keyboard when it doesn't know a tap should be "handled" — that's exactly what was eating your drag gesture before it could start. Added `keyboardShouldPersistTaps="handled"` to both chat screens' message lists.

## 6. Nav bar overlapping the keyboard on 3-button-nav phones
The keyboard offset was a flat, hardcoded number that only worked for gesture-nav phones (a thin strip at the bottom). Phones still using the classic 3-button bar reserve real, variable height there — now pulled from `useSafeAreaInsets()` and factored into both the keyboard offset and the input bar's own bottom padding, so it adapts to whatever nav style the phone actually uses.

## 7. Profile scroll animation — rebuilt properly this time
You were right, what I built before was a cross-fade (one element disappearing, a different one appearing), not what you described. Rebuilt as a single floating element — avatar and name together — that continuously scales and slides from its resting position into the corner as you scroll, never disappearing or swapping. One honest caveat: the exact landing position (how close to the back button it ends up) is an estimate — I can't pixel-test this without seeing it on your device, so if it's off by a bit once you try it, tell me which direction to nudge it and I'll adjust the numbers.

## 8. Notifications while already in that chat
The notification handler was never checking what you were actually looking at — it showed a banner for every message regardless. Now tracks which conversation/group screen is currently open and suppresses the foreground alert specifically for messages in that one (everything else still notifies normally).

## 9. Notification doubling — likes and comments
Added the same in-flight guard to comment submission that I'd already put on likes/reposts (a fast double-submit was one real cause). But since you're saying likes are *still* doubling even after that fix, I think there's something else going on that a client-side guard can't reach: **a database trigger that also inserts a notification server-side**, on top of the one the app inserts. If that's happening, you'd get exactly 2 notifications every single time, not just occasionally on a fast double-tap — which matches "still persists" better than a timing bug would.

Please run this in Supabase's SQL editor and send me what it returns:
```sql
select event_object_table, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where event_object_table in ('likes', 'comments', 'notifications')
order by event_object_table, trigger_name;
```
If that shows a trigger on `likes` or `comments` that inserts into `notifications`, that's the real second source — the fix at that point is removing either the trigger or the app's own insert, not another client-side guard.

## On the "list" you mentioned
You said you'd attach a list related to the reports table issue, but nothing came through with this message — if it's still relevant, resend it and I'll take a look. If you already resolved that (sounded like you had, from your earlier message), no need.

## Files in this zip
- `components/ReelPreviewThumb.tsx` — static thumbnails, no video player
- `app/(tabs)/index.tsx`, `components/PostCard.tsx` — one-at-a-time video autoplay, removed old cycling logic
- `components/ActionSheet.tsx` (new), `app/(tabs)/messages.tsx`, `app/user/[id].tsx` — working swipe/profile menus
- `app/conversation/[id].tsx`, `app/groups/[id].tsx` — bigger controls, keyboard fixes, nav-bar-aware offset
- `app/user/[id].tsx` — rebuilt scroll animation
- `lib/activeChatTracker.ts` (new), `lib/usePushNotifications.ts` — suppress notifications for the open chat
- `app/post/[id].tsx` — comment submit guard
