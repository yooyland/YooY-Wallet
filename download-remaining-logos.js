const https = require('https');
const fs = require('fs');
const path = require('path');

// 다운로드에 실패한 코인들
const failedCoins = [
  'UNI', 'SUSHI', 'COMP', 'MKR', 'SNX', 'YFI', 'UMA', 'LRC', 'REN', 'AAVE',
  'KNC', 'BAL', 'CRV', '1INCH', 'GRT', 'BCH', 'BSV'
];

// 더 많은 소스 URL들
const getSources = (coin) => {
  const coinLower = coin.toLowerCase();
  return [
    // CoinGecko 다양한 ID들
    `https://assets.coingecko.com/coins/images/12559/large/${coinLower}.png`,
    `https://assets.coingecko.com/coins/images/12560/large/${coinLower}.png`,
    `https://assets.coingecko.com/coins/images/12561/large/${coinLower}.png`,
    `https://assets.coingecko.com/coins/images/12562/large/${coinLower}.png`,
    `https://assets.coingecko.com/coins/images/12563/large/${coinLower}.png`,
    
    // CoinMarketCap
    `https://s2.coinmarketcap.com/static/img/coins/64x64/${coinLower}.png`,
    `https://s2.coinmarketcap.com/static/img/coins/128x128/${coinLower}.png`,
    `https://s2.coinmarketcap.com/static/img/coins/200x200/${coinLower}.png`,
    
    // CryptoIcons
    `https://cryptoicons.org/api/color/${coinLower}/200.png`,
    `https://cryptoicons.org/api/icon/${coinLower}/200.png`,
    `https://cryptoicons.org/api/white/${coinLower}/200.png`,
    
    // CryptoLogos
    `https://cryptologos.cc/logos/${coinLower}-${coinLower}-logo.png`,
    
    // 특별한 코인별 URL들
    ...(coin === 'UNI' ? [
      'https://assets.coingecko.com/coins/images/12504/large/uniswap-uni.png',
      'https://cryptologos.cc/logos/uniswap-uni-logo.png'
    ] : []),
    ...(coin === 'SUSHI' ? [
      'https://assets.coingecko.com/coins/images/12271/large/sushiswap.png',
      'https://cryptologos.cc/logos/sushiswap-sushi-logo.png'
    ] : []),
    ...(coin === 'COMP' ? [
      'https://assets.coingecko.com/coins/images/10775/large/COMP.png',
      'https://cryptologos.cc/logos/compound-comp-logo.png'
    ] : []),
    ...(coin === 'MKR' ? [
      'https://assets.coingecko.com/coins/images/1364/large/Mark_Maker.png',
      'https://cryptologos.cc/logos/maker-mkr-logo.png'
    ] : []),
    ...(coin === 'SNX' ? [
      'https://assets.coingecko.com/coins/images/3406/large/SNX.png',
      'https://cryptologos.cc/logos/synthetix-network-token-snx-logo.png'
    ] : []),
    ...(coin === 'YFI' ? [
      'https://assets.coingecko.com/coins/images/11849/large/yfi-192x192.png',
      'https://cryptologos.cc/logos/yearn-finance-yfi-logo.png'
    ] : []),
    ...(coin === 'UMA' ? [
      'https://assets.coingecko.com/coins/images/10951/large/UMA.png',
      'https://cryptologos.cc/logos/uma-uma-logo.png'
    ] : []),
    ...(coin === 'LRC' ? [
      'https://assets.coingecko.com/coins/images/913/large/LRC.png',
      'https://cryptologos.cc/logos/loopring-lrc-logo.png'
    ] : []),
    ...(coin === 'REN' ? [
      'https://assets.coingecko.com/coins/images/3139/large/REN.png',
      'https://cryptologos.cc/logos/republic-protocol-ren-logo.png'
    ] : []),
    ...(coin === 'AAVE' ? [
      'https://assets.coingecko.com/coins/images/12645/large/AAVE.png',
      'https://cryptologos.cc/logos/aave-aave-logo.png'
    ] : []),
    ...(coin === 'KNC' ? [
      'https://assets.coingecko.com/coins/images/14899/large/RwdDgIC.png',
      'https://cryptologos.cc/logos/kyber-network-crystal-knc-logo.png'
    ] : []),
    ...(coin === 'BAL' ? [
      'https://assets.coingecko.com/coins/images/11683/large/Balancer.png',
      'https://cryptologos.cc/logos/balancer-bal-logo.png'
    ] : []),
    ...(coin === 'CRV' ? [
      'https://assets.coingecko.com/coins/images/12124/large/Curve.png',
      'https://cryptologos.cc/logos/curve-dao-token-crv-logo.png'
    ] : []),
    ...(coin === '1INCH' ? [
      'https://assets.coingecko.com/coins/images/13469/large/1inch.png',
      'https://cryptologos.cc/logos/1inch-1inch-logo.png'
    ] : []),
    ...(coin === 'GRT' ? [
      'https://assets.coingecko.com/coins/images/13397/large/Graph_Token.png',
      'https://cryptologos.cc/logos/the-graph-grt-logo.png'
    ] : []),
    ...(coin === 'BCH' ? [
      'https://assets.coingecko.com/coins/images/780/large/bitcoin-cash.png',
      'https://cryptologos.cc/logos/bitcoin-cash-bch-logo.png'
    ] : []),
    ...(coin === 'BSV' ? [
      'https://assets.coingecko.com/coins/images/5203/large/bsv.png',
      'https://cryptologos.cc/logos/bitcoin-sv-bsv-logo.png'
    ] : [])
  ].filter(Boolean);
};

// 이미지 다운로드 함수
function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    const request = https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`✅ Downloaded: ${path.basename(filepath)} from ${url}`);
          resolve();
        });
      } else {
        file.close();
        fs.unlink(filepath, () => {});
        reject(new Error(`HTTP ${response.statusCode}`));
      }
    });
    
    request.setTimeout(10000, () => {
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

// 코인 로고 다운로드
async function downloadRemainingLogos() {
  const imagesDir = path.join(__dirname, 'assets', 'images');
  
  console.log('🚀 Starting remaining coin logo downloads...\n');

  for (const coin of failedCoins) {
    const filename = `${coin.toLowerCase()}.png`;
    const filepath = path.join(imagesDir, filename);
    
    // 파일이 이미 존재하면 스킵
    if (fs.existsSync(filepath)) {
      console.log(`⏭️  Skipped: ${filename} (already exists)`);
      continue;
    }

    const sources = getSources(coin);
    console.log(`🔍 Trying to download ${filename} from ${sources.length} sources...`);

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
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n🎉 Remaining coin logo download completed!');
}

// 실행
downloadRemainingLogos().catch(console.error);







