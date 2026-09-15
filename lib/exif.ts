/**
 * Where and when a JPEG was taken, read from its EXIF block: the GPS position
 * and DateTimeOriginal. A photo chosen from the gallery can carry both, which
 * is what lets an old meal land in the right place on the map. Phones often
 * strip the location from shared photos; then this simply finds nothing.
 * Pure, so node --test can hold it.
 */

export type PhotoFacts = { lat: number | null; lng: number | null; takenAt: number | null };

const NONE: PhotoFacts = { lat: null, lng: null, takenAt: null };

export function readPhotoFacts(buffer: ArrayBuffer): PhotoFacts {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return NONE;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    const size = view.getUint16(offset + 2);
    if ((marker & 0xff00) !== 0xff00) return NONE;
    if (marker === 0xffe1 && offset + 10 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966) {
      return readTiff(view, offset + 10, size - 8);
    }
    if (marker === 0xffda) return NONE;
    offset += 2 + size;
  }
  return NONE;
}

function readTiff(view: DataView, start: number, length: number): PhotoFacts {
  if (start + 8 > view.byteLength) return NONE;
  const little = view.getUint16(start) === 0x4949;
  const end = Math.min(view.byteLength, start + length);
  const u16 = (at: number) => (at + 2 <= end ? view.getUint16(at, little) : 0);
  const u32 = (at: number) => (at + 4 <= end ? view.getUint32(at, little) : 0);

  const entries = (ifd: number) => {
    const at = start + ifd;
    const count = u16(at);
    const out = new Map<number, { type: number; count: number; valueAt: number }>();
    for (let i = 0; i < count && i < 256; i++) {
      const entry = at + 2 + i * 12;
      if (entry + 12 > end) break;
      const type = u16(entry + 2);
      const n = u32(entry + 4);
      const bytes = n * ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[type] ?? 1);
      out.set(u16(entry), { type, count: n, valueAt: bytes <= 4 ? entry + 8 : start + u32(entry + 8) });
    }
    return out;
  };

  const ascii = (e?: { count: number; valueAt: number }) => {
    if (!e) return '';
    let s = '';
    for (let i = 0; i < e.count && e.valueAt + i < end; i++) {
      const c = view.getUint8(e.valueAt + i);
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const rational = (at: number) => { const d = u32(at + 4); return d ? u32(at) / d : 0; };
  const degrees = (e?: { count: number; valueAt: number }) =>
    e && e.count >= 3 ? rational(e.valueAt) + rational(e.valueAt + 8) / 60 + rational(e.valueAt + 16) / 3600 : null;

  const ifd0 = entries(u32(start + 4));
  let takenAt: number | null = null;
  const exifPointer = ifd0.get(0x8769);
  if (exifPointer) {
    const stamp = ascii(entries(u32(exifPointer.valueAt)).get(0x9003)) || ascii(ifd0.get(0x0132));
    const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(stamp);
    // EXIF has no zone. The camera's own clock is local time, which is what a person means by "when".
    if (m) takenAt = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
  }

  let lat: number | null = null, lng: number | null = null;
  const gpsPointer = ifd0.get(0x8825);
  if (gpsPointer) {
    const gps = entries(u32(gpsPointer.valueAt));
    const la = degrees(gps.get(0x0002)), lo = degrees(gps.get(0x0004));
    if (la !== null && lo !== null && (la !== 0 || lo !== 0)) {
      lat = ascii(gps.get(0x0001)) === 'S' ? -la : la;
      lng = ascii(gps.get(0x0003)) === 'W' ? -lo : lo;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) { lat = null; lng = null; }
    }
  }
  return { lat, lng, takenAt };
}
