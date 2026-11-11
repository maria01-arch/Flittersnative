// People should never see raw database or network wording ("duplicate key value violates
// unique constraint", "row-level security", "run the SQL from the chat"...).
// This turns any such text into a plain sentence. The original text is still written to
// the developer log (console) so it can be debugged.
const TECHNICAL = /(sql|database|violates|constraint|duplicate key|row-level|row level|polic(y|ies)|permission denied|pgrst|relation|column|function|schema|syntax|jwt|\brls\b|trigger|null value|invalid input|does not exist|uuid|\bpg\b|postgres|supabase|stack|undefined|\[object)/i;
const NETWORK = /(network request failed|failed to fetch|network error|timeout|timed out|offline|unable to resolve|econn)/i;

export function cleanMessage(msg?: string | null): string | undefined {
  if (msg == null) return undefined;
  const text = String(msg);
  if (!text.trim()) return undefined;
  if (NETWORK.test(text)) return 'Check your internet connection and try again.';
  if (TECHNICAL.test(text)) {
    console.warn('[hidden error]', text);
    return 'Something went wrong. Please try again in a moment.';
  }
  return text;
}
