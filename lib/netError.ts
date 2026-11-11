// True when an error message means "the phone could not reach the server"
// (no signal, DNS problem, timeout) rather than a real answer like "wrong password".
export function isNetworkError(e: any): boolean {
  const msg = String(e?.message || e || '');
  return /network request failed|fetch failed|failed to fetch|unknownhost|unable to resolve|no address associated|timed? ?out|timeout|connection (?:was )?(?:lost|reset|refused|abort)|offline|internet|ECONN|ENOTFOUND|socket/i.test(msg);
}
