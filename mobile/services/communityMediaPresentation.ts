export type CommunityMediaFit = 'contain' | 'cover';

export function getCommunityPostImages(payload: Record<string, unknown>) {
  const imageSizes = Array.isArray(payload.imageSizes) ? payload.imageSizes : [];
  const images: Array<{ url: string; imageWidth: number | null; imageHeight: number | null }> = [];
  const addImage = (url: unknown, size: unknown, fallbackSize: unknown = null) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url) || images.some((image) => image.url === url)) return;
    const dimensions = size && typeof size === 'object' ? size : fallbackSize;
    const imageWidth = dimensions && typeof dimensions === 'object' && 'width' in dimensions && typeof dimensions.width === 'number'
      ? dimensions.width
      : null;
    const imageHeight = dimensions && typeof dimensions === 'object' && 'height' in dimensions && typeof dimensions.height === 'number'
      ? dimensions.height
      : null;
    images.push({ url, imageWidth, imageHeight });
  };
  if (typeof payload.imageUrl === 'string' && /^https?:\/\//i.test(payload.imageUrl)) {
    const galleryIndex = Array.isArray(payload.imageUrls) ? payload.imageUrls.indexOf(payload.imageUrl) : -1;
    addImage(payload.imageUrl, galleryIndex >= 0 ? imageSizes[galleryIndex] : null, {
      width: typeof payload.imageWidth === 'number' ? payload.imageWidth : null,
      height: typeof payload.imageHeight === 'number' ? payload.imageHeight : null,
    });
  }
  if (Array.isArray(payload.imageUrls)) {
    payload.imageUrls.forEach((url, index) => addImage(url, imageSizes[index]));
  }
  return images.slice(0, 4);
}

export function getCommunityMediaPresentation(
  windowWidth: number,
  imageWidth: number | null,
  imageHeight: number | null,
  isChart: boolean,
) {
  const frameWidth = Math.min(400, Math.max(1, windowWidth - 56));
  const frameHeight = frameWidth * 0.75;
  const isPortrait = Boolean(imageWidth && imageHeight && imageWidth / imageHeight < 1);
  return {
    frameWidth,
    frameHeight,
    isPortrait,
    contentFit: isPortrait || isChart ? 'contain' as const : 'cover' as const,
    showBlurredBackdrop: isPortrait,
  };
}
