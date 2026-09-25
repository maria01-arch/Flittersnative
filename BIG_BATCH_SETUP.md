# Big batch — infinite post nav, doubled notifications, profile tabs, videos, threads, delete, nav icons, block/report, animated header

## Install
```bash
cd ~/flitters-native
npx expo install expo-crypto
unzip -o ~/storage/downloads/flitters-big-batch.zip -d ~/flitters-native
npx expo start --localhost --clear --max-workers 1
```
Pure JS changes — no rebuild needed, just a Metro reload. One database step though:

**Run this in Supabase's SQL editor first** (adds video posts, threads, and a reports table):
```sql
alter table public.posts
  add column if not exists video_url text;

alter table public.posts
  add column if not exists thread_id uuid,
  add column if not exists thread_order integer;

create index if not exists posts_thread_id_idx on public.posts(thread_id);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_type text not null default 'user',
  reported_id uuid not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists reports_reported_idx on public.reports(reported_type, reported_id);

alter table public.reports enable row level security;

create policy if not exists "reports_insert_own" on public.reports
  for insert with check (auth.uid() = reporter_id);

create policy if not exists "reports_select_own" on public.reports
  for select using (auth.uid() = reporter_id);
```

## What was actually wrong, and what's new

**Infinite post stacking** — real bug I introduced a couple rounds back. Tapping a post's body to open it was left active even on the post detail screen itself, so tapping the post while already viewing it pushed another identical screen onto the stack. `PostCard` now takes a `disableOpen` prop, set on the post detail screen's own header copy.

**Doubled "liked your post" notifications** — also real: a fast double-tap on the like button fired the mutation twice before the first tap's state update landed, so both reads saw "not liked yet" and both inserted. Added a proper in-flight guard (keyed per post, so liking one post doesn't block liking another) everywhere like/repost happens — home feed, post detail, profile.

**Delete posts and comments** — a trash icon next to your own posts and comments now deletes them (with a confirm).

**Profile: three tabs** — Posts, Reposts, Videos, matching real data (reposts pulled from the `reposts` table, Videos filtered from your own posts with a video attached).

**Video posts in the feed** — compose now lets you attach a video instead of just images (same reliable upload path voice notes and images already use), and `PostCard` plays it inline.

**200-character cap + threads** — the caption box now hard-limits at 200 with a live counter. A "+ Add to thread" button lets you stack multiple posts into one thread before posting; the first one shows in the feed as normal, the rest appear appended below it on the post's own detail page.

**Bottom nav icons** — notifications is now an actual bell, messages is a chat bubble, instead of a heart and an envelope.

**Block / report** — profile pages get a "..." menu (Block / Report) next to the back button. Chat list rows: swipe left→right to reveal a red delete button; tapping it opens Block / Delete chat / Report for that conversation.

**Animated profile header** — scrolling a profile up smoothly fades the big avatar out while a small version fades in pinned near the back button, giving the "shrinks and moves to the top-left" effect without any layout jank.

## Files in this zip
- `supabase_migration_video_threads_reports.sql` — run first, in Supabase
- `components/PostCard.tsx`, `components/CommentCard.tsx` — delete, disableOpen, video rendering
- `app/post/[id].tsx` — disableOpen wiring, thread display, delete wiring, like/repost guard
- `app/(tabs)/index.tsx` — like/repost guard, delete wiring
- `components/FloatingTabBar.tsx` — bell/chat icons
- `lib/upload.ts` — added `uploadVideo`
- `app/compose.tsx` — video picker, 200-char limit, thread composer
- `app/user/[id].tsx` — three tabs, animated header, block/report menu
- `app/(tabs)/messages.tsx` — swipeable rows with block/delete/report
