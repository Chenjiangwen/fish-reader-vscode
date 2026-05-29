import * as iconv from 'iconv-lite';

export interface DecodeResult {
  text: string;
  encoding: string;
}

/** Validate whether a buffer is well-formed UTF-8. */
function isValidUtf8(buf: Buffer): boolean {
  let i = 0;
  const len = buf.length;
  // Only scan a prefix for speed on large files.
  const scanLen = Math.min(len, 64 * 1024);
  while (i < scanLen) {
    const b = buf[i];
    if (b <= 0x7f) {
      i += 1;
    } else if (b >= 0xc2 && b <= 0xdf) {
      if (i + 1 >= scanLen) break;
      if ((buf[i + 1] & 0xc0) !== 0x80) return false;
      i += 2;
    } else if (b >= 0xe0 && b <= 0xef) {
      if (i + 2 >= scanLen) break;
      if ((buf[i + 1] & 0xc0) !== 0x80 || (buf[i + 2] & 0xc0) !== 0x80) return false;
      i += 3;
    } else if (b >= 0xf0 && b <= 0xf4) {
      if (i + 3 >= scanLen) break;
      if (
        (buf[i + 1] & 0xc0) !== 0x80 ||
        (buf[i + 2] & 0xc0) !== 0x80 ||
        (buf[i + 3] & 0xc0) !== 0x80
      )
        return false;
      i += 4;
    } else {
      return false;
    }
  }
  return true;
}

/**
 * Decode a buffer to a string. `forced` may be 'auto' | 'utf-8' | 'gbk' | 'gb18030'.
 * Detection order: BOM -> UTF-8 validity -> GB18030 fallback.
 */
export function decodeBuffer(buf: Buffer, forced: string = 'auto'): DecodeResult {
  if (forced && forced !== 'auto') {
    const enc = forced === 'gbk' ? 'gbk' : forced;
    return { text: iconv.decode(buf, enc), encoding: enc };
  }

  // BOM checks
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: buf.slice(3).toString('utf8'), encoding: 'utf-8' };
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { text: iconv.decode(buf, 'utf-16le'), encoding: 'utf-16le' };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return { text: iconv.decode(buf, 'utf-16be'), encoding: 'utf-16be' };
  }

  if (isValidUtf8(buf)) {
    return { text: buf.toString('utf8'), encoding: 'utf-8' };
  }

  // Fallback: GB18030 is a superset of GBK and covers most Chinese txt files.
  return { text: iconv.decode(buf, 'gb18030'), encoding: 'gb18030' };
}
