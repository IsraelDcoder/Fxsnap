import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCommunityMediaPresentation,
  getCommunityPostImages,
} from '../services/communityMediaPresentation';

test('feed media frame keeps a 4:3 ratio and caps wide screens at 300 points tall', () => {
  const phone = getCommunityMediaPresentation(390, 1600, 900, true);
  assert.equal(phone.frameWidth, 334);
  assert.equal(phone.frameHeight, 250.5);

  const tablet = getCommunityMediaPresentation(900, 1600, 900, true);
  assert.equal(tablet.frameWidth, 400);
  assert.equal(tablet.frameHeight, 300);
});

test('portrait posters are contained over a blurred backdrop', () => {
  const poster = getCommunityMediaPresentation(390, 1080, 1920, false);
  assert.equal(poster.contentFit, 'contain');
  assert.equal(poster.isPortrait, true);
  assert.equal(poster.showBlurredBackdrop, true);
});

test('chart images preserve their full contents while landscape photos can crop', () => {
  const chart = getCommunityMediaPresentation(390, 1600, 900, true);
  assert.equal(chart.contentFit, 'contain');
  assert.equal(chart.showBlurredBackdrop, false);

  const photo = getCommunityMediaPresentation(390, 1600, 900, false);
  assert.equal(photo.contentFit, 'cover');
  assert.equal(photo.showBlurredBackdrop, false);
});

test('media gallery preserves legacy single images and reads up to four unique image URLs with dimensions', () => {
  assert.deepEqual(getCommunityPostImages({
    imageUrl: 'https://storage.example/one.jpg',
    imageUrls: ['https://storage.example/one.jpg', 'https://storage.example/two.png', 'https://storage.example/three.webp'],
    imageSizes: [{ width: 100, height: 100 }, { width: 80, height: 120 }, { width: 400, height: 300 }],
  }), [
    { url: 'https://storage.example/one.jpg', imageWidth: 100, imageHeight: 100 },
    { url: 'https://storage.example/two.png', imageWidth: 80, imageHeight: 120 },
    { url: 'https://storage.example/three.webp', imageWidth: 400, imageHeight: 300 },
  ]);
  assert.deepEqual(getCommunityPostImages({ imageUrl: 'https://storage.example/legacy.jpg' }), [
    { url: 'https://storage.example/legacy.jpg', imageWidth: null, imageHeight: null },
  ]);
  assert.deepEqual(getCommunityPostImages({
    imageUrl: 'https://storage.example/legacy.jpg',
    imageWidth: 1200,
    imageHeight: 800,
    imageUrls: ['https://storage.example/gallery.png'],
    imageSizes: [{ width: 400, height: 600 }],
  }), [
    { url: 'https://storage.example/legacy.jpg', imageWidth: 1200, imageHeight: 800 },
    { url: 'https://storage.example/gallery.png', imageWidth: 400, imageHeight: 600 },
  ]);
});
