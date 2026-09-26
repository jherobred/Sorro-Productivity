/** Keep server diagnostics available without making them the recovery instructions. */
export function syncMessage(error: string): string {
  if (/401|token|not signed|jwt|unauthorized/i.test(error)) return 'Sign-in or connection credentials need refreshing. Review this connection and try again.';
  if (/address|404|403|calendar returned/i.test(error)) return 'The calendar could not be read. Check its private iCal address, then retry.';
  if (/timeout|fetch|network|connection/i.test(error)) return 'The service could not be reached. Check your connection and retry.';
  return 'The latest import could not finish. Previously imported items are still available. Retry the sync.';
}
