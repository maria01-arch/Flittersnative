// Ported from the webapp's getFirstUrl (SphereApp.js) so both apps decide
// "is there a link preview to show here" the exact same way.
const URL_RE = /https?:\/\/[^\s]+/i;

export function getFirstUrl(text: string): string | null {
  if (!text) return null;
  const match = text.match(URL_RE);
  if (!match) return null;
  // Trim common trailing punctuation a sentence would leave attached to a URL.
  return match[0].replace(/[),.!?;:]+$/, '');
}
