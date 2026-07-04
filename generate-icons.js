const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const INPUT_SVG = path.join(__dirname, 'ofm-favicon.svg');
const OUT_DIR = path.join(__dirname, 'icons');

// Sizes needed for favicon + PWA + Apple Touch Icons
const SIZES = [
  16, 32, 48, 64, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512
];

// Apple Touch Icon specific sizes
const APPLE_SIZES = {
  'apple-touch-icon.png': 180,
  'apple-touch-icon-167.png': 167,
  'apple-touch-icon-152.png': 152,
  'apple-touch-icon-120.png': 120,
  'apple-touch-icon-76.png': 76,
};

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function generatePNGs() {
  await ensureDir(OUT_DIR);

  console.log('Generating PNG icons from SVG...\n');

  // Standard favicon sizes
  for (const size of SIZES) {
    const outFile = path.join(OUT_DIR, `icon-${size}.png`);
    await sharp(INPUT_SVG)
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(outFile);
    console.log(`✓ ${size}x${size} → ${path.basename(outFile)}`);
  }

  // Apple Touch Icons
  console.log('\nGenerating Apple Touch Icons...');
  for (const [filename, size] of Object.entries(APPLE_SIZES)) {
    const outFile = path.join(OUT_DIR, filename);
    await sharp(INPUT_SVG)
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(outFile);
    console.log(`✓ ${size}x${size} → ${filename}`);
  }

  // Generate favicon.ico (multi-size: 16, 32, 48)
  console.log('\nGenerating favicon.ico...');
  const icoSizes = [16, 32, 48];
  const buffers = await Promise.all(
    icoSizes.map(size =>
      sharp(INPUT_SVG).resize(size, size).png().toBuffer()
    )
  );

  // Simple ICO writer (concatenates PNGs with ICO header)
  // For production, consider using 'ico-endec' or similar package
  const icoBuffer = createICO(buffers, icoSizes);
  fs.writeFileSync(path.join(__dirname, 'favicon.ico'), icoBuffer);
  console.log('✓ favicon.ico (16, 32, 48)');

  console.log('\n✅ All icons generated in ./icons/');
  console.log('📋 Next: Add to your HTML <head> (see manifest.json)');
}

function createICO(pngBuffers, sizes) {
  // ICO file format: https://en.wikipedia.org/wiki/ICO_(file_format)
  const ICONDIR = 6;
  const ICONDIRENTRY = 16;
  const numImages = pngBuffers.length;

  // Calculate offsets
  let offset = ICONDIR + numImages * ICONDIRENTRY;
  const entries = [];

  for (let i = 0; i < numImages; i++) {
    const png = pngBuffers[i];
    const size = sizes[i];
    entries.push({
      width: size === 256 ? 0 : size,
      height: size === 256 ? 0 : size,
      colorCount: 0,
      reserved: 0,
      planes: 1,
      bitCount: 32,
      sizeInBytes: png.length,
      offset: offset
    });
    offset += png.length;
  }

  // Build ICO buffer
  const buf = Buffer.alloc(offset);

  // ICONDIR header
  buf.writeUInt16LE(0, 0);           // Reserved (0)
  buf.writeUInt16LE(1, 2);           // Type (1 = ICO)
  buf.writeUInt16LE(numImages, 4);   // Count

  // ICONDIRENTRY entries
  entries.forEach((entry, i) => {
    const base = ICONDIR + i * ICONDIRENTRY;
    buf.writeUInt8(entry.width, base);
    buf.writeUInt8(entry.height, base + 1);
    buf.writeUInt8(entry.colorCount, base + 2);
    buf.writeUInt8(entry.reserved, base + 3);
    buf.writeUInt16LE(entry.planes, base + 4);
    buf.writeUInt16LE(entry.bitCount, base + 6);
    buf.writeUInt32LE(entry.sizeInBytes, base + 8);
    buf.writeUInt32LE(entry.offset, base + 12);
  });

  // Write PNG data
  entries.forEach((entry, i) => {
    pngBuffers[i].copy(buf, entry.offset);
  });

  return buf;
}

generatePNGs().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});