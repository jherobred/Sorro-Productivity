export function moveNotebook(ids: readonly string[], from: string, to: string): string[] {
  const source = ids.indexOf(from), target = ids.indexOf(to);
  if (source < 0 || target < 0 || source === target) return [...ids];
  const result = [...ids];
  result.splice(source, 1);
  result.splice(target, 0, from);
  return result;
}
