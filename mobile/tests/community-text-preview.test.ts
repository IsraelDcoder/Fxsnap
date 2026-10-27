import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMMUNITY_POST_PREVIEW_LINES,
  communityTextExceedsPreview,
} from '../services/communityTextPreview';

test('Community feed previews use three lines', () => {
  assert.equal(COMMUNITY_POST_PREVIEW_LINES, 3);
});

test('short and exactly three-line content does not need an expand control', () => {
  assert.equal(communityTextExceedsPreview('One short line.', ['One short line.']), false);
  assert.equal(communityTextExceedsPreview('First\nsecond\nthird', ['First', 'second', 'third']), false);
});

test('truncated lines expose an expand control without relying on character count', () => {
  assert.equal(
    communityTextExceedsPreview('First paragraph. Second paragraph. Third paragraph. Fourth paragraph.', [
      'First paragraph.',
      'Second paragraph.',
      'Third paragraph.…',
    ]),
    true,
  );
  assert.equal(communityTextExceedsPreview('An emoji 📈 and line breaks\nstay readable.', [
    'An emoji 📈 and',
    'line breaks stay',
    'readable.…',
  ]), true);
});
