'use client';

import { NoteSketchpad } from './NoteSketchpad';

export function MathSketchpad(props: { initialImage?: string; onInsert: (dataUrl: string) => void; onClose: () => void }) {
  return <NoteSketchpad {...props} />;
}
