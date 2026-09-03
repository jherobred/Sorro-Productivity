import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSafeFile, effectiveType, safeFileName, IMAGE_EXT, MAX_BYTES } from './uploadGuard.ts';

const f = (name: string, type: string, size = 1000) => ({ name, type, size });

test('svg is refused however it is dressed up', () => {
  // The whole point of the gate: an SVG can carry a <script>, and the avatar
  // bucket is public, so a stored one is reachable by raw link.
  assert.throws(() => assertSafeFile(f('x.svg', 'image/svg+xml')), /not supported/);
  // Blank type, .svg extension — the fallback path must not let it through.
  assert.throws(() => assertSafeFile(f('x.svg', '')), /not supported/);
  // An SVG renamed to look like a photo still fails, because the type decides.
  assert.throws(() => assertSafeFile(f('x.png', 'image/svg+xml')), /not supported/);
  assert.throws(() => assertSafeFile(f('x.html', 'text/html')), /not supported/);
});

test('a real photo with no MIME type still uploads', () => {
  // Android camera intents hand back a blank type. Rejecting these would break
  // the meal and receipt camera buttons on the APK.
  assert.equal(assertSafeFile(f('IMG_0001.JPG', '')), 'image/jpeg');
  assert.equal(assertSafeFile(f('clip.mov', '')), 'video/quicktime');
  assert.equal(assertSafeFile(f('shot.png', 'image/png')), 'image/png');
});

test('a file with neither a known type nor a known extension is refused', () => {
  assert.throws(() => assertSafeFile(f('payload', '')), /not supported/);
  assert.throws(() => assertSafeFile(f('a.exe', 'application/octet-stream')), /not supported/);
});

test('size cap applies to an otherwise allowed file', () => {
  assert.throws(() => assertSafeFile(f('big.png', 'image/png', MAX_BYTES + 1)), /too large/);
  assert.equal(assertSafeFile(f('ok.png', 'image/png', MAX_BYTES)), 'image/png');
});

test('avatars take images only, never video', () => {
  const imagesOnly = new Set(Object.keys(IMAGE_EXT));
  assert.throws(() => assertSafeFile(f('clip.mp4', 'video/mp4'), imagesOnly), /not supported/);
  assert.equal(assertSafeFile(f('me.webp', 'image/webp'), imagesOnly), 'image/webp');
});

test('filenames cannot inject path segments', () => {
  assert.equal(safeFileName('../../etc/passwd'), '.._.._etc_passwd');
  assert.ok(!safeFileName('a/b/c.png').includes('/'));
  assert.equal(safeFileName('holiday photo.png'), 'holiday_photo.png');
});

test('a present type always wins over the extension', () => {
  assert.equal(effectiveType(f('x.png', 'image/jpeg')), 'image/jpeg');
});

console.log('uploadGuard.ts ok');
