import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectCommunityImageMimeType,
  normalizeCommunityImageBase64,
} from '../services/communityImageFormat';

const fixtures = [
  { mimeType: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: 'image/jpeg', bytes: [0xff, 0xd8, 0xff, 0xe0] },
  { mimeType: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50] },
] as const;

for (const fixture of fixtures) {
  test(`detects ${fixture.mimeType} from encoded bytes`, () => {
    const base64 = Buffer.from(fixture.bytes).toString('base64');
    assert.equal(detectCommunityImageMimeType(base64), fixture.mimeType);
  });
}

test('detects an image signature in a data URI and ignores misleading filename metadata', () => {
  const png = Buffer.from(fixtures[0].bytes).toString('base64');
  assert.equal(detectCommunityImageMimeType(`data:image/jpeg;base64,${png}`), 'image/png');
  assert.equal(normalizeCommunityImageBase64(`data:image/jpeg;base64,${png}`), png);
});

test('rejects unsupported or malformed image bytes', () => {
  assert.equal(detectCommunityImageMimeType('bm90IGFuIGltYWdl'), null);
  assert.equal(detectCommunityImageMimeType(''), null);
});
