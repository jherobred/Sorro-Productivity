import test from 'node:test';
import assert from 'node:assert/strict';
import { readPhotoFacts } from './exif.ts';

/** A minimal JPEG with an EXIF block: a timestamp and a GPS position, little-endian like most phones. */
function jpegWithExif(lat: [number, number, number], latRef: string, lng: [number, number, number], lngRef: string, stamp: string): ArrayBuffer {
  const tiff: number[] = [];
  const u16 = (v: number) => tiff.push(v & 0xff, (v >> 8) & 0xff);
  const u32 = (v: number) => tiff.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  const at = (pos: number, v: number) => { tiff[pos] = v & 0xff; tiff[pos + 1] = (v >> 8) & 0xff; tiff[pos + 2] = (v >> 16) & 0xff; tiff[pos + 3] = (v >>> 24) & 0xff; };
  tiff.push(0x49, 0x49); u16(42); u32(8);
  // IFD0: two pointers.
  u16(2);
  u16(0x8769); u16(4); u32(1); const exifPtr = tiff.length; u32(0);
  u16(0x8825); u16(4); u32(1); const gpsPtr = tiff.length; u32(0);
  u32(0);
  // Exif IFD: DateTimeOriginal.
  at(exifPtr, tiff.length);
  u16(1); u16(0x9003); u16(2); u32(20); const stampPtr = tiff.length; u32(0); u32(0);
  at(stampPtr, tiff.length);
  for (const c of stamp) tiff.push(c.charCodeAt(0));
  tiff.push(0);
  // GPS IFD.
  at(gpsPtr, tiff.length);
  u16(4);
  u16(1); u16(2); u32(2); tiff.push(latRef.charCodeAt(0), 0, 0, 0);
  u16(2); u16(5); u32(3); const latPtr = tiff.length; u32(0);
  u16(3); u16(2); u32(2); tiff.push(lngRef.charCodeAt(0), 0, 0, 0);
  u16(4); u16(5); u32(3); const lngPtr = tiff.length; u32(0);
  u32(0);
  const rationals = (ptr: number, dms: [number, number, number]) => { at(ptr, tiff.length); for (const v of dms) { u32(Math.round(v * 100)); u32(100); } };
  rationals(latPtr, lat);
  rationals(lngPtr, lng);
  const app1 = [0xff, 0xe1, ((tiff.length + 8) >> 8) & 0xff, (tiff.length + 8) & 0xff, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  return new Uint8Array([0xff, 0xd8, ...app1, 0xff, 0xda, 0, 2]).buffer;
}

test('reads where and when a photo was taken', () => {
  const facts = readPhotoFacts(jpegWithExif([14, 36, 34.74], 'N', [120, 59, 22.02], 'E', '2026:09:14 12:31:05'));
  assert.ok(Math.abs(facts.lat! - 14.60965) < 1e-4);
  assert.ok(Math.abs(facts.lng! - 120.98945) < 1e-4);
  assert.equal(facts.takenAt, new Date(2026, 8, 14, 12, 31, 5).getTime());
});

test('south and west are negative, and a photo without EXIF has nothing', () => {
  const facts = readPhotoFacts(jpegWithExif([33, 52, 4.8], 'S', [151, 12, 36], 'W', '2025:01:02 03:04:05'));
  assert.ok(facts.lat! < 0 && facts.lng! < 0);
  assert.deepEqual(readPhotoFacts(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer), { lat: null, lng: null, takenAt: null });
  assert.deepEqual(readPhotoFacts(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer), { lat: null, lng: null, takenAt: null });
});
