/** Where `id` lands when it is dropped on `onto`: it takes that widget's place and the rest shift. */
export function moveTo<T>(items: T[], id: T, onto: T): T[] {
  const from = items.indexOf(id), to = items.indexOf(onto);
  if (from < 0 || to < 0 || from === to) return items;
  const next = items.filter(x => x !== id);
  next.splice(to, 0, id);
  return next;
}
