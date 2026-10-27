const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export type CommunityImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export function normalizeCommunityImageBase64(value: string): string {
  const dataUriPrefix = /^data:image\/(?:jpeg|png|webp);base64,/i.exec(value)?.[0];
  return (dataUriPrefix ? value.slice(dataUriPrefix.length) : value).replace(/\s/g, '');
}

function decodeBase64Prefix(value: string, byteLimit: number): Uint8Array {
  const data = normalizeCommunityImageBase64(value);
  const bytes: number[] = [];
  let accumulator = 0;
  let bitCount = 0;

  for (const character of data) {
    if (character === '=') break;
    const digit = character === '-' ? 62 : character === '_' ? 63 : BASE64_ALPHABET.indexOf(character);
    if (digit < 0) return new Uint8Array();
    accumulator = (accumulator << 6) | digit;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes.push((accumulator >> bitCount) & 0xff);
      accumulator &= (1 << bitCount) - 1;
      if (bytes.length === byteLimit) break;
    }
  }

  return Uint8Array.from(bytes);
}

export function detectCommunityImageMimeType(base64: string): CommunityImageMimeType | null {
  const bytes = decodeBase64Prefix(base64, 12);
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) return 'image/png';

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50
  ) return 'image/webp';

  return null;
}
