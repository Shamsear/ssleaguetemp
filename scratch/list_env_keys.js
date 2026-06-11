const fs = require('fs');
const dotenv = require('dotenv');

if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  console.log('Environment variable keys found:');
  Object.keys(envConfig).forEach(key => {
    if (key.includes('DB') || key.includes('URL') || key.includes('NEON') || key.includes('FIREBASE')) {
      console.log(`  - ${key} (length: ${envConfig[key].length})`);
    }
  });
} else {
  console.log('.env.local file not found');
}
