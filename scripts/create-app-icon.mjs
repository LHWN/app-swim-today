import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const sourcePath = 'logo.png';
const outputPath = 'assets/app-icon.png';
const size = 1024;
const padding = 112;

const source = PNG.sync.read(readFileSync(sourcePath));
const scale = Math.min((size - padding * 2) / source.width, (size - padding * 2) / source.height);
const targetWidth = Math.round(source.width * scale);
const targetHeight = Math.round(source.height * scale);
const offsetX = Math.round((size - targetWidth) / 2);
const offsetY = Math.round((size - targetHeight) / 2);

const icon = new PNG({ width: size, height: size, colorType: 6 });

for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const index = (y * size + x) * 4;
    icon.data[index] = 255;
    icon.data[index + 1] = 255;
    icon.data[index + 2] = 255;
    icon.data[index + 3] = 255;
  }
}

for (let y = 0; y < targetHeight; y += 1) {
  const sourceY = Math.min(source.height - 1, Math.floor(y / scale));

  for (let x = 0; x < targetWidth; x += 1) {
    const sourceX = Math.min(source.width - 1, Math.floor(x / scale));
    const sourceIndex = (sourceY * source.width + sourceX) * 4;
    const targetIndex = ((offsetY + y) * size + offsetX + x) * 4;
    const alpha = source.data[sourceIndex + 3] / 255;

    for (let channel = 0; channel < 3; channel += 1) {
      icon.data[targetIndex + channel] = Math.round(
        source.data[sourceIndex + channel] * alpha + icon.data[targetIndex + channel] * (1 - alpha)
      );
    }

    icon.data[targetIndex + 3] = 255;
  }
}

writeFileSync(outputPath, PNG.sync.write(icon));
console.log(`${outputPath} ${size}x${size}`);
