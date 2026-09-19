import test from 'node:test';
import assert from 'node:assert/strict';
import { driveDownloadUrl, driveFileId } from './driveLink.ts';

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';

test('the file id comes out of every link shape Drive hands out', () => {
  assert.equal(driveFileId(`https://drive.google.com/file/d/${ID}/view?usp=sharing`), ID);
  assert.equal(driveFileId(`https://drive.google.com/file/d/${ID}/view?usp=drive_link`), ID);
  assert.equal(driveFileId(`https://drive.google.com/open?id=${ID}`), ID);
  assert.equal(driveFileId(`https://drive.google.com/uc?id=${ID}&export=download`), ID);
  assert.equal(driveFileId(`https://drive.usercontent.google.com/download?id=${ID}&export=download`), ID);
  assert.equal(driveFileId(`  ${ID}  `), ID);
});

test('anything that is not a Drive link is refused', () => {
  assert.equal(driveFileId(`https://evil.example.com/file/d/${ID}/view`), null);
  assert.equal(driveFileId(`http://drive.google.com/file/d/${ID}/view`), null);
  assert.equal(driveFileId('https://drive.google.com/drive/my-drive'), null);
  assert.equal(driveFileId('not a link'), null);
  assert.equal(driveFileId(''), null);
});

test('the download address carries the id and skips the large-file warning', () => {
  const url = new URL(driveDownloadUrl(ID));
  assert.equal(url.hostname, 'drive.usercontent.google.com');
  assert.equal(url.searchParams.get('id'), ID);
  assert.equal(url.searchParams.get('confirm'), 't');
});
