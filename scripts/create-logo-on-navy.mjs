import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const inputPath = 'logo.png';
const outputPath = 'logo-on-navy.png';
const previewPath = '/tmp/logo-on-navy-preview.png';
const navy = [5, 55, 99, 255];

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const file = readFileSync(inputPath);

function readChunks(buffer) {
  if (!buffer.subarray(0, 8).equals(signature)) {
    throw new Error('Invalid PNG signature');
  }

  const chunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 12 + length;
  }

  return chunks;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilter(inflated, width, height, bytesPerPixel) {
  const stride = width * bytesPerPixel;
  const raw = Buffer.alloc(height * stride);
  let sourceOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowOffset = y * stride;
    const prevOffset = (y - 1) * stride;

    for (let x = 0; x < stride; x += 1) {
      const value = inflated[sourceOffset + x];
      const left = x >= bytesPerPixel ? raw[rowOffset + x - bytesPerPixel] : 0;
      const up = y > 0 ? raw[prevOffset + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? raw[prevOffset + x - bytesPerPixel] : 0;

      if (filter === 0) raw[rowOffset + x] = value;
      else if (filter === 1) raw[rowOffset + x] = (value + left) & 255;
      else if (filter === 2) raw[rowOffset + x] = (value + up) & 255;
      else if (filter === 3) raw[rowOffset + x] = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) raw[rowOffset + x] = (value + paeth(left, up, upLeft)) & 255;
      else throw new Error(`Unsupported PNG filter ${filter}`);
    }

    sourceOffset += stride;
  }

  return raw;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuffer, data]);
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  typeBuffer.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(body), 8 + data.length);
  return result;
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const stride = width * 4;
  const scanlines = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    scanlines[y * (stride + 1)] = 0;
    rgba.copy(scanlines, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(scanlines)), chunk('IEND')]);
}

const chunks = readChunks(file);
const ihdr = chunks.find((item) => item.type === 'IHDR')?.data;
if (!ihdr) throw new Error('Missing IHDR');

const width = ihdr.readUInt32BE(0);
const height = ihdr.readUInt32BE(4);
const bitDepth = ihdr[8];
const colorType = ihdr[9];
if (bitDepth !== 8 || colorType !== 6) {
  throw new Error(`Only 8-bit RGBA PNG is supported. Got bitDepth=${bitDepth}, colorType=${colorType}`);
}

const compressed = Buffer.concat(chunks.filter((item) => item.type === 'IDAT').map((item) => item.data));
const source = unfilter(inflateSync(compressed), width, height, 4);
const recolored = Buffer.alloc(source.length);
let minX = width;
let minY = height;
let maxX = -1;
let maxY = -1;

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const index = (y * width + x) * 4;
    const r = source[index];
    const g = source[index + 1];
    const b = source[index + 2];
    const originalAlpha = source[index + 3];
    const distanceFromWhite = Math.sqrt((255 - r) ** 2 + (255 - g) ** 2 + (255 - b) ** 2);
    let alpha = Math.round(Math.max(0, Math.min(255, (distanceFromWhite - 7) * 3.1)) * (originalAlpha / 255));

    if (alpha < 7) {
      alpha = 0;
    }

    const isAccent = r < 115 && g > 132 && b > 165;
    const color = isAccent ? [76, 210, 244] : [247, 252, 255];

    recolored[index] = color[0];
    recolored[index + 1] = color[1];
    recolored[index + 2] = color[2];
    recolored[index + 3] = alpha;

    if (alpha > 10) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
}

if (maxX < minX || maxY < minY) {
  throw new Error('Could not detect logo pixels');
}

const padding = 24;
minX = Math.max(0, minX - padding);
minY = Math.max(0, minY - padding);
maxX = Math.min(width - 1, maxX + padding);
maxY = Math.min(height - 1, maxY + padding);

const outWidth = maxX - minX + 1;
const outHeight = maxY - minY + 1;
const cropped = Buffer.alloc(outWidth * outHeight * 4);
const preview = Buffer.alloc(outWidth * outHeight * 4);

for (let y = 0; y < outHeight; y += 1) {
  for (let x = 0; x < outWidth; x += 1) {
    const srcIndex = ((y + minY) * width + x + minX) * 4;
    const dstIndex = (y * outWidth + x) * 4;
    recolored.copy(cropped, dstIndex, srcIndex, srcIndex + 4);

    const alpha = cropped[dstIndex + 3] / 255;
    for (let channel = 0; channel < 3; channel += 1) {
      preview[dstIndex + channel] = Math.round(cropped[dstIndex + channel] * alpha + navy[channel] * (1 - alpha));
    }
    preview[dstIndex + 3] = 255;
  }
}

writeFileSync(outputPath, encodePng(outWidth, outHeight, cropped));
writeFileSync(previewPath, encodePng(outWidth, outHeight, preview));

console.log(`${outputPath} ${outWidth}x${outHeight}`);
