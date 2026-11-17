import { supabase } from '@/lib/supabase';

// Account health + Help center (Batch 2). All data comes from the functions in
// 03_account_health_help.sql, which only ever return the signed-in person's rows.

export type Standing = 'good' | 'warning' | 'at_risk' | 'suspended';
export type StrikeState = 'active' | 'appealed' | 'expired' | 'removed';
export type Strike = {
  id: string; reason_code: string; reason: string; severity: number;
  content_type: string | null; content_snapshot: string | null;
  issued_at: string; expires_at: string; state: StrikeState; resolution_note: string | null;
  appeal: null | { status: 'pending' | 'upheld' | 'overturned'; message: string; feedback: string | null; created_at: string; reviewed_at: string | null };
};
export type Health = { standing: Standing; points: number; unread_alerts: number; strikes: Strike[] };
export type Alert = { id: string; kind: string; title: string; body: string | null; strike_id: string | null; ticket_id: string | null; created_at: string; read_at: string | null };
export type TicketStatus = 'open' | 'pending_user' | 'resolved';
export type TicketRow = { id: string; category: string; subject: string; status: TicketStatus; created_at: string; updated_at: string; unread: boolean };
export type TicketMessage = { id: string; from: 'user' | 'staff'; body: string; created_at: string };
export type Ticket = { id: string; category: string; subject: string; status: TicketStatus; created_at: string; messages: TicketMessage[] };

export const REASON_LABELS: Record<string, string> = {
  child_safety: 'Child safety', nudity_sexual: 'Nudity or sexual content', violence: 'Violence', harassment: 'Harassment',
  hate_speech: 'Hate speech', spam: 'Spam or scam', impersonation: 'Impersonation', copyright: 'Copyright', other: 'Other',
};
export const CATEGORY_LABELS: Record<string, string> = {
  account: 'My account', bug: 'Something is broken', payment: 'Payments or coins', content: 'A post or content issue',
  safety: 'Safety or harassment', verification: 'Verification badge', other: 'Something else',
};
export const STATUS_LABELS: Record<TicketStatus, string> = { open: 'Waiting for us', pending_user: 'We replied', resolved: 'Resolved' };

// Turns the database's short error codes into something a person can read.
export function friendly(message?: string | null): string {
  const m = String(message || '');
  if (m.includes('already_appealed')) return 'You already appealed this strike.';
  if (m.includes('not_appealable')) return "This strike can't be appealed right now.";
  if (m.includes('strike_expired')) return 'This strike has expired, so there is nothing to appeal.';
  if (m.includes('strike_not_found') || m.includes('ticket_not_found')) return "We couldn't find that.";
  if (m.includes('bad_message_length')) return 'Please write a bit more (at least 10 characters).';
  if (m.includes('bad_subject_length')) return 'The title needs 3 to 120 characters.';
  if (m.includes('too_many_open')) return 'You have too many open requests. Wait for a reply or mark some as resolved.';
  if (m.includes('too_many_requests')) return "You're sending a lot of requests. Please try again in a little while.";
  if (/function .* does not exist|schema cache|could not find the function/i.test(m)) return 'This feature is not switched on yet on the server (03_account_health_help.sql).';
  return 'Something went wrong. Check your connection and try again.';
}

type Res<T> = { data: T | null; error: string | null };
const wrap = <T,>(r: { data: any; error: any }): Res<T> => (r.error ? { data: null, error: friendly(r.error.message) } : { data: r.data as T, error: null });

export const fetchHealth = async () => wrap<Health>(await supabase.rpc('my_account_health'));
export const appealStrike = async (strikeId: string, message: string) => wrap<string>(await supabase.rpc('appeal_strike', { p_strike: strikeId, p_message: message }));
export async function fetchAlerts(limit = 30): Promise<Res<Alert[]>> {
  const r = await supabase.from('account_alerts').select('id,kind,title,body,strike_id,ticket_id,created_at,read_at').order('created_at', { ascending: false }).limit(limit);
  return wrap<Alert[]>(r);
}
export const markAlertsRead = async (ids?: string[]) => wrap<number>(await supabase.rpc('mark_alerts_read', { p_ids: ids ?? null }));

export const fetchTickets = async () => wrap<TicketRow[]>(await supabase.rpc('my_tickets'));
export const fetchTicket = async (id: string) => wrap<Ticket>(await supabase.rpc('get_ticket', { p_ticket: id }));
export const createTicket = async (category: string, subject: string, body: string) => wrap<string>(await supabase.rpc('create_ticket', { p_category: category, p_subject: subject, p_body: body }));
export const replyTicket = async (id: string, body: string) => wrap<string>(await supabase.rpc('reply_ticket', { p_ticket: id, p_body: body }));
export const resolveTicket = async (id: string) => wrap<null>(await supabase.rpc('resolve_ticket', { p_ticket: id }));

export function when(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
export function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}
