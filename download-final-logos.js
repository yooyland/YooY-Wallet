const https = require('https');
const fs = require('fs');
const path = require('path');

// 마지막으로 다운로드에 실패한 코인들
const finalCoins = [
  { name: 'SUSHI', url: 'https://assets.coingecko.com/coins/images/12271/large/sushiswap.png' },
  { name: 'KNC', url: 'https://assets.coingecko.com/coins/images/14899/large/RwdDgIC.png' },
  { name: 'BCH', url: 'https://assets.coingecko.com/coins/images/780/large/bitcoin-cash.png' },
  { name: 'BSV', url: 'https://assets.coingecko.com/coins/images/5203/large/bsv.png' }
];

// 이미지 다운로드 함수
function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    const request = https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`✅ Downloaded: ${path.basename(filepath)}`);
          resolve();
        });
      } else {
        file.close();
        fs.unlink(filepath, () => {});
        reject(new Error(`HTTP ${response.statusCode}`));
      }
    });
    
    request.setTimeout(15000, () => {
      request.destroy();
      file.close();
      fs.unlink(filepath, () => {});
      reject(new Error('Timeout'));
    });
    
    request.on('error', (err) => {
      fs.unlink(filepath, () => {});
      reject(err);
    });
  });
}

// 마지막 코인 로고 다운로드
async function downloadFinalLogos() {
  const imagesDir = path.join(__dirname, 'assets', 'images');
  
  console.log('🚀 Starting final coin logo downloads...\n');

  for (const coin of finalCoins) {
    const filename = `${coin.name.toLowerCase()}.png`;
    const filepath = path.join(imagesDir, filename);
    
    // 파일이 이미 존재하면 스킵
    if (fs.existsSync(filepath)) {
      console.log(`⏭️  Skipped: ${filename} (already exists)`);
      continue;
    }

    try {
      await downloadImage(coin.url, filepath);
    } catch (error) {
      console.log(`❌ Failed to download: ${filename} - ${error.message}`);
    }

    // 요청 간격 조절
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n🎉 Final coin logo download completed!');
}

// 실행
downloadFinalLogos().catch(console.error);







