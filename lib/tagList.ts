/**
 * Courses and tags: a short list the notebook library keeps, and that
 * notebooks and tasks borrow from. A course is just a tag with a class name in
 * it, so the same list works for someone who is not a student.
 *
 * Tags live in the synced profile prefs, like page colours, so they follow the
 * account without a table. Notebooks point at a tag by id. A task keeps the
 * tag's name in its existing course field, so tasks written before tags
 * existed, or with a course that was never added here, still show it.
 */

export type Tag = { id: string; name: string; color: string };

export const TAG_COLORS = [
  { name: 'Blue', value: '#345cff' }, { name: 'Red', value: '#f26047' }, { name: 'Green', value: '#2fb27a' },
  { name: 'Yellow', value: '#e0a100' }, { name: 'Purple', value: '#9b6bff' }, { name: 'Pink', value: '#ff6fa8' },
  { name: 'Teal', value: '#38c6d9' }, { name: 'Orange', value: '#ff9a3c' }, { name: 'Grey', value: '#7a7a74' },
];

const key = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export const cleanTagName = (name: string) => name.trim().replace(/\s+/g, ' ').slice(0, 40);

/** The tag with this name, ignoring case and extra spaces. */
export const findTag = (tags: Tag[], name: string) => tags.find((t) => key(t.name) === key(name));

/** Adds a tag unless one with the same name exists. Colours go round the palette. */
export function addTag(tags: Tag[], name: string, id: string): { tags: Tag[]; tag: Tag | null } {
  const clean = cleanTagName(name);
  if (!clean) return { tags, tag: null };
  const existing = findTag(tags, clean);
  if (existing) return { tags, tag: existing };
  const tag = { id, name: clean, color: TAG_COLORS[tags.length % TAG_COLORS.length].value };
  return { tags: [...tags, tag], tag };
}

/** Renames a tag. Refused, returning null, when the name is empty or already taken by another tag. */
export function renameTag(tags: Tag[], id: string, name: string): Tag[] | null {
  const clean = cleanTagName(name);
  const clash = findTag(tags, clean);
  if (!clean || (clash && clash.id !== id)) return null;
  return tags.map((t) => (t.id === id ? { ...t, name: clean } : t));
}

/** Removes a tag from the list and from everything that carried it. */
export function removeTag(tags: Tag[], assigned: Record<string, string[]>, id: string) {
  const next: Record<string, string[]> = {};
  for (const [owner, ids] of Object.entries(assigned)) {
    const kept = ids.filter((t) => t !== id);
    if (kept.length) next[owner] = kept;
  }
  return { tags: tags.filter((t) => t.id !== id), assigned: next };
}

/** Puts a tag on an owner, or takes it off when it is already there. */
export function toggleTag(assigned: Record<string, string[]>, owner: string, id: string): Record<string, string[]> {
  const current = assigned[owner] ?? [];
  const ids = current.includes(id) ? current.filter((t) => t !== id) : [...current, id];
  const next = { ...assigned };
  if (ids.length) next[owner] = ids; else delete next[owner];
  return next;
}

/** True when a task's course is this tag. */
export const courseIs = (course: string | null | undefined, tag: Tag) => !!course && key(course) === key(tag.name);
