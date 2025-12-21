const https = require('https');
const fs = require('fs');
const path = require('path');

// 마켓에서 사용하는 모든 코인 목록
const allCoins = [
  // KRW 마켓
  'YOY', 'BTC', 'ETH', 'XRP', 'ADA', 'DOT', 'DOGE', 'SOL', 'AVAX', 'MATIC',
  'LINK', 'UNI', 'LTC', 'ATOM', 'NEAR', 'ALGO', 'VET', 'ICP', 'FIL', 'THETA',
  'EOS', 'XTZ', 'SUSHI', 'COMP', 'MKR', 'SNX', 'YFI', 'UMA', 'LRC', 'REN',
  
  // USDT 마켓 추가 코인들
  'USDC', 'BNB', 'TRX', 'XLM', 'XMR', 'AAVE', 'SHIB', 'FTM',
  
  // ETH 마켓 추가 코인들
  'USDT', 'KNC', 'BAL', 'CRV', '1INCH', 'GRT',
  
  // BTC 마켓 추가 코인들
  'BCH', 'BSV'
];

// 현재 assets/images 폴더에 있는 이미지들 (소문자로 변환)
const existingImages = [
  'ada.png', 'algo.png', 'atom.png', 'avax.png', 'bnb.png', 'btc.png',
  'doge.png', 'dot.png', 'eos.png', 'eth.png', 'fil.png', 'ftm.png',
  'icp.png', 'link.png', 'ltc.png', 'matic.png', 'near.png', 'shib.png',
  'sol.png', 'theta.png', 'trx.png', 'usdc.png', 'usdt.png', 'vet.png',
  'xlm.png', 'xmr.png', 'xrp.png', 'xtz.png', 'yoy.png'
];

// 누락된 코인들 찾기
const missingCoins = allCoins.filter(coin => {
  const filename = `${coin.toLowerCase()}.png`;
  return !existingImages.includes(filename);
});

console.log('🔍 Missing coin images:');
missingCoins.forEach(coin => console.log(`  - ${coin.toLowerCase()}.png`));
console.log(`\n📊 Total missing: ${missingCoins.length} coins\n`);

// 이미지 다운로드 함수
function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, (response) => {
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
    }).on('error', (err) => {
      fs.unlink(filepath, () => {});
      reject(err);
    });
  });
}

// 코인별 특별한 다운로드 URL 매핑
const specialUrls = {
  'SUSHI': 'https://cryptologos.cc/logos/sushiswap-sushi-logo.png',
  'COMP': 'https://cryptologos.cc/logos/compound-comp-logo.png',
  'MKR': 'https://cryptologos.cc/logos/maker-mkr-logo.png',
  'SNX': 'https://cryptologos.cc/logos/synthetix-network-token-snx-logo.png',
  'YFI': 'https://cryptologos.cc/logos/yearn-finance-yfi-logo.png',
  'UMA': 'https://cryptologos.cc/logos/uma-uma-logo.png',
  'LRC': 'https://cryptologos.cc/logos/loopring-lrc-logo.png',
  'REN': 'https://cryptologos.cc/logos/republic-protocol-ren-logo.png',
  'KNC': 'https://cryptologos.cc/logos/kyber-network-crystal-knc-logo.png',
  'BAL': 'https://cryptologos.cc/logos/balancer-bal-logo.png',
  'CRV': 'https://cryptologos.cc/logos/curve-dao-token-crv-logo.png',
  '1INCH': 'https://cryptologos.cc/logos/1inch-1inch-logo.png',
  'GRT': 'https://cryptologos.cc/logos/the-graph-grt-logo.png',
  'BCH': 'https://cryptologos.cc/logos/bitcoin-cash-bch-logo.png',
  'BSV': 'https://cryptologos.cc/logos/bitcoin-sv-bsv-logo.png',
  'AAVE': 'https://cryptologos.cc/logos/aave-aave-logo.png'
};

// 코인 로고 다운로드
async function downloadMissingLogos() {
  const imagesDir = path.join(__dirname, 'assets', 'images');
  
  // 디렉토리가 없으면 생성
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  console.log('🚀 Starting missing coin logo downloads...\n');

  for (const coin of missingCoins) {
    const filename = `${coin.toLowerCase()}.png`;
    const filepath = path.join(imagesDir, filename);
    
    // 파일이 이미 존재하면 스킵
    if (fs.existsSync(filepath)) {
      console.log(`⏭️  Skipped: ${filename} (already exists)`);
      continue;
    }

    // 여러 소스에서 시도
    const sources = [
      // 특별한 URL이 있으면 우선 사용
      specialUrls[coin],
      // 일반적인 소스들
      `https://cryptologos.cc/logos/${coin.toLowerCase()}-${coin.toLowerCase()}-logo.png`,
      `https://assets.coingecko.com/coins/images/1/large/${coin.toLowerCase()}.png`,
      `https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.toLowerCase()}.png`,
      `https://cryptoicons.org/api/color/${coin.toLowerCase()}/200.png`,
      `https://cryptoicons.org/api/icon/${coin.toLowerCase()}/200.png`
    ].filter(Boolean); // undefined 제거

    let downloaded = false;
    for (const source of sources) {
      try {
        await downloadImage(source, filepath);
        downloaded = true;
        break;
      } catch (error) {
        // 다음 소스 시도
        continue;
      }
    }

    if (!downloaded) {
      console.log(`❌ Failed to download: ${filename} from all sources`);
    }

    // 요청 간격 조절 (API 제한 방지)
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  console.log('\n🎉 Missing coin logo download completed!');
}

// 실행
downloadMissingLogos().catch(console.error);







