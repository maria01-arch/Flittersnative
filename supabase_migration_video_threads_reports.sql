-- Video posts: same idea as image_url, a separate nullable column rather
-- than repurposing image_url, so a post can be unambiguously checked for
-- which kind of media it has.
alter table public.posts
  add column if not exists video_url text;

-- Threads: a run of posts posted together via the "+" button in compose.
-- thread_id groups them (null = not part of a thread), thread_order says
-- what order they go in within that group. The first post (thread_order
-- 0) is the one that actually shows in feeds; the rest are only fetched
-- when viewing that post's detail screen.
alter table public.posts
  add column if not exists thread_id uuid,
  add column if not exists thread_order integer;

create index if not exists posts_thread_id_idx on public.posts(thread_id);

-- Reports: for the block/report action on a user's chats and profile.
-- Kept generic (reported_type + reported_id) rather than a separate table
-- per reportable thing, since right now this only covers reporting a user,
-- but the shape doesn't need to change if posts/comments get a report
-- button later too.
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

-- Reporters can see their own submitted reports (e.g. to show "already
-- reported" in the UI); reading other people's reports is not exposed —
-- that's for moderation tooling with the service role key, not the app.
create policy if not exists "reports_select_own" on public.reports
  for select using (auth.uid() = reporter_id);
