// BMP decoder: 8-bit palette, 24-bit and 32-bit, bottom-up or top-down, 4-byte row padding.
// Output is RGBA with the key colour (0,0,0) turned into alpha 0.

export function decodeBmp(buf, keyColor = [0, 0, 0]) {
  if (buf.length < 54 || buf[0] !== 0x42 || buf[1] !== 0x4d) throw new Error('not a BMP file');
  const dataOffset = buf.readUInt32LE(10);
  const headerSize = buf.readUInt32LE(14);
  if (headerSize < 40) throw new Error(`unsupported BMP header size ${headerSize}`);
  const width = buf.readInt32LE(18);
  const rawHeight = buf.readInt32LE(22);
  const bits = buf.readUInt16LE(28);
  const compression = buf.readUInt32LE(30);
  if (compression !== 0) throw new Error(`unsupported BMP compression ${compression}`);
  if (![8, 24, 32].includes(bits)) throw new Error(`unsupported BMP bit depth ${bits}`);
  const topDown = rawHeight < 0;
  const height = Math.abs(rawHeight);
  if (width <= 0 || height === 0) throw new Error('bad BMP size');

  let palette = null;
  if (bits === 8) {
    const used = buf.readUInt32LE(46) || 256;
    palette = new Uint8Array(256 * 3);
    const palStart = 14 + headerSize;
    for (let i = 0; i < used && i < 256; i++) {
      const o = palStart + i * 4;
      palette[i * 3] = buf[o + 2];
      palette[i * 3 + 1] = buf[o + 1];
      palette[i * 3 + 2] = buf[o];
    }
  }

  const stride = Math.floor((bits * width + 31) / 32) * 4;
  if (dataOffset + stride * height > buf.length) throw new Error('BMP pixel data is truncated');
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcRow = dataOffset + (topDown ? y : height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      let r, g, b;
      if (bits === 8) {
        const i = buf[srcRow + x] * 3;
        r = palette[i]; g = palette[i + 1]; b = palette[i + 2];
      } else {
        const o = srcRow + x * (bits / 8);
        b = buf[o]; g = buf[o + 1]; r = buf[o + 2];
      }
      const d = (y * width + x) * 4;
      rgba[d] = r; rgba[d + 1] = g; rgba[d + 2] = b;
      rgba[d + 3] = r === keyColor[0] && g === keyColor[1] && b === keyColor[2] ? 0 : 255;
    }
  }
  return { width, height, rgba };
}
