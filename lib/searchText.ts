// Search text goes straight into a PostgREST `.or(...)` filter string, where
// commas, parentheses, quotes and % have special meaning — one stray comma
// in what someone typed used to break the whole query (and return nothing).
// Strips those characters and the LIKE wildcards instead of trying to
// escape them: nobody's name or username contains them anyway.
export function cleanSearchText(text: string): string {
  return text.replace(/[,()"'\\%_*]/g, ' ').replace(/\s+/g, ' ').trim();
}
