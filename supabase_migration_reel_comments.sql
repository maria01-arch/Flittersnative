-- Comments on reels — mirrors the existing `comments` table (for posts) but
-- against `reels` instead. Flat (no nested replies) to keep the mobile UI
-- simple; can be extended with reply_to_comment_id later the same way
-- `comments` was, if that's ever wanted.

create table if not exists public.reel_comments (
  id uuid primary key default gen_random_uuid(),
  reel_id uuid not null references public.reels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists reel_comments_reel_id_idx on public.reel_comments(reel_id);
create index if not exists reel_comments_user_id_idx on public.reel_comments(user_id);

alter table public.reel_comments enable row level security;

-- Anyone signed in can read comments on any reel (reels themselves are public).
create policy if not exists "reel_comments_select" on public.reel_comments
  for select using (true);

-- You can only insert a comment as yourself.
create policy if not exists "reel_comments_insert" on public.reel_comments
  for insert with check (auth.uid() = user_id);

-- You can only delete your own comment.
create policy if not exists "reel_comments_delete" on public.reel_comments
  for delete using (auth.uid() = user_id);
