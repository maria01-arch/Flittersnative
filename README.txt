FLITTERS APP PATCH (cumulative). Latest: call fixes (cancelled calls no longer get stuck) and call cards in chats.
Copy over your project (same paths). Then: run 10_call_cards.sql in Supabase, redeploy the send-push function (supabase/functions/send-push/index.ts), rebuild the app.
