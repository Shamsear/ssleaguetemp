const sharp = require('sharp');
const path = require('path');

async function main() {
  try {
    const imagePath = path.join(__dirname, '..', 'public', 'logo.png');
    console.log('Analyzing:', imagePath);
    
    const { data, info } = await sharp(imagePath)
      .resize(100, 100, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });
      
    const colors = {};
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i];
      const g = data[i+1];
      const b = data[i+2];
      const a = info.channels === 4 ? data[i+3] : 255;
      
      if (a < 30) continue; // Skip very transparent pixels
      
      // Bucket colors to nearest 16 values to group gradients
      const bucketR = Math.round(r / 16) * 16;
      const bucketG = Math.round(g / 16) * 16;
      const bucketB = Math.round(b / 16) * 16;
      
      const hex = '#' + [bucketR, bucketG, bucketB].map(x => Math.min(255, Math.max(0, x)).toString(16).padStart(2, '0')).join('').toUpperCase();
      colors[hex] = (colors[hex] || 0) + 1;
    }
    
    const sorted = Object.entries(colors).sort((a, b) => b[1] - a[1]);
    console.log('Dominant bucketed colors (100x100):');
    sorted.slice(0, 15).forEach(([hex, count]) => {
      console.log(`- ${hex}: ${count} pixels`);
    });
    
  } catch (err) {
    console.error('Error analyzing image:', err);
  }
}

main();
