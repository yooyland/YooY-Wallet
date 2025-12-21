import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePreferences } from '@/contexts/PreferencesContext';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

interface NewsItem {
  id: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  url: string;
  imageUrl?: string;
  author?: string;
  fullContent?: string;
}

interface NewsListProps {
  coinSymbol?: string;
}

export default function NewsList({ coinSymbol = 'BTC' }: NewsListProps) {
  const { language } = usePreferences();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<NewsItem | null>(null);
  const [showArticleModal, setShowArticleModal] = useState(false);
  const [loadingFullContent, setLoadingFullContent] = useState(false);

  useEffect(() => {
    fetchNews();
  }, [coinSymbol, language]);

  const fetchNews = async () => {
    try {
      setLoading(true);
      setError(null);
      
      let coinNews: NewsItem[] = [];
      
      if (coinSymbol === 'YOY') {
        // YOY 코인은 실제 검색어로 검색
        coinNews = await fetchYOYNews();
      } else {
        // 다른 코인들은 기존 샘플 데이터 사용
        coinNews = getCoinSpecificNews(coinSymbol);
      }
      
      // 언어 설정에 따라 번역 적용
      const translatedNews = translateNews(coinNews);
      console.log('News loaded:', { 
        coinNews: coinNews.length,
        translatedNews: translatedNews.length 
      });
      setNews(translatedNews);
      
    } catch (err) {
      console.error('Error fetching news:', err);
      setError('뉴스를 불러오는데 실패했습니다.');
      // 에러 시 샘플 뉴스 데이터 표시
      setNews(getSampleNews());
    } finally {
      setLoading(false);
    }
  };


  const fetchYOYNews = async (): Promise<NewsItem[]> => {
    try {
      // YOY 관련 검색어들
      const searchTerms = [
        'YOY', 'YooY Land', 'YooYLand', 'ERC20', 'Ethereum', 'Mintable', 'Burnable', 
        'Tokenomics', 'Smart Contract', 'Alpha Contract', 'Virtual Person', 'Validator Person', 
        'VP', 'Valp', 'Meta Governance', 'Blacklist Recovery', 'Whitelist System', 'Staking', 
        'Reward System', 'Airdrop', 'Galxe Campaign', 'Uniswap V3', 'Liquidity Pool', 
        'Trust Wallet Listing', 'CoinMarketCap Registration', 'Defi Integration', 'Web3 Wallet',
        'YooY Wallet', 'YooY DEX', 'YooY Board', 'YooY Social Login', 'YooY Portal', 
        'OpenStudio', 'Firebase Integration', 'React Native App', 'Multilingual Ecosystem', 
        'Gold Themed Branding', 'Infura RPC', 'Etherscan Verified', 'VP Authority', 
        'DAO Compatibility', 'Security Audit', 'Alpha Contract v2', 'Social DAO Edition'
      ];

      const allNews: NewsItem[] = [];
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      // 각 검색어로 뉴스 검색 (실제로는 CoinTelegraph API 호출)
      for (const term of searchTerms) {
        try {
          // 실제 API 호출 대신 시뮬레이션
          const searchResults = await searchCoinTelegraphNews(term, oneWeekAgo);
          allNews.push(...searchResults);
        } catch (error) {
          console.warn(`Failed to search for term: ${term}`, error);
        }
      }
      
      // 중복 제거 (제목 기준)
      const uniqueNews = allNews.filter((news, index, self) => 
        index === self.findIndex(n => n.title === news.title)
      );
      
      // 최신순으로 정렬
      uniqueNews.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      
      // 30개가 안 되면 인기 뉴스로 채우기
      if (uniqueNews.length < 30) {
        const popularNews = getPopularNews();
        const needed = 30 - uniqueNews.length;
        const additionalNews = popularNews.slice(0, needed);
        
        // 추가 뉴스의 ID를 YOY 관련으로 변경
        additionalNews.forEach((news, index) => {
          news.id = `yoy-popular-${index + 1}`;
          news.title = `YooY Land Ecosystem: ${news.title}`;
          news.excerpt = `YooY Land continues to expand its ecosystem. ${news.excerpt}`;
        });
        
        uniqueNews.push(...additionalNews);
      }
      
      return uniqueNews.slice(0, 30);
      
    } catch (error) {
      console.error('Error fetching YOY news:', error);
      // 에러 시 기존 YOY 샘플 데이터 반환
      return getCoinSpecificNews('YOY');
    }
  };

  const searchCoinTelegraphNews = async (searchTerm: string, fromDate: Date): Promise<NewsItem[]> => {
    // 실제 CoinTelegraph API 호출 시뮬레이션
    // 실제 구현에서는 CoinTelegraph의 검색 API를 사용해야 함
    
    return new Promise((resolve) => {
      setTimeout(() => {
        // 검색어에 따른 뉴스 생성
        const newsCount = Math.floor(Math.random() * 3) + 1; // 1-3개 뉴스
        const news: NewsItem[] = [];
        
        for (let i = 0; i < newsCount; i++) {
          const publishedAt = new Date(fromDate.getTime() + Math.random() * (Date.now() - fromDate.getTime()));
          
          // 작성자 목록
          const authors = [
            'Sarah Johnson', 'Michael Chen', 'Alex Rodriguez', 'David Martinez', 
            'Jennifer Lee', 'Robert Kim', 'Emma Wilson', 'James Thompson',
            'Lisa Park', 'Carlos Silva', 'Anna Kowalski', 'Tom Anderson'
          ];
          
          news.push({
            id: `yoy-${searchTerm.toLowerCase().replace(/\s+/g, '-')}-${i + 1}`,
            title: generateYOYNewsTitle(searchTerm),
            excerpt: generateYOYNewsExcerpt(searchTerm),
            publishedAt: publishedAt.toISOString(),
            url: 'https://cointelegraph.com',
            imageUrl: undefined,
            author: authors[Math.floor(Math.random() * authors.length)]
          });
        }
        
        resolve(news);
      }, 100);
    });
  };

  const generateYOYNewsTitle = (searchTerm: string): string => {
    const titles = {
      'YOY': 'YOO Token Surges 25% as YooY Land Ecosystem Expands',
      'YooY Land': 'YooY Land Platform Reaches 1 Million Active Users Milestone',
      'ERC20': 'YOO ERC20 Token Achieves Major Exchange Listings',
      'Ethereum': 'YOO Token Leverages Ethereum Network for Enhanced Security',
      'Smart Contract': 'YooY Land Smart Contracts Pass Comprehensive Security Audit',
      'Alpha Contract': 'Alpha Contract v2.0 Launches with Advanced Features',
      'Virtual Person': 'Virtual Person Technology Revolutionizes YooY Land Governance',
      'Staking': 'YOO Token Staking Rewards Reach 12% APY',
      'DeFi': 'YooY Land DeFi Integration Surpasses $100M TVL',
      'Web3': 'YooY Land Web3 Wallet Achieves 500K Downloads',
      'NFT': 'YooY Land NFT Marketplace Launches with 1000+ Collections',
      'Metaverse': 'YooY Land Metaverse Expansion Attracts Major Investors'
    };
    
    return titles[searchTerm as keyof typeof titles] || 
           `YooY Land ${searchTerm} Integration Drives Platform Growth`;
  };

  const generateYOYNewsExcerpt = (searchTerm: string): string => {
    const excerpts = {
      'YOY': 'YOO token has experienced significant growth as the YooY Land ecosystem continues to expand. The platform has seen increased adoption across multiple sectors...',
      'YooY Land': 'YooY Land platform has reached a major milestone with 1 million active users. The comprehensive ecosystem includes DeFi, NFT, and metaverse features...',
      'ERC20': 'YOO ERC20 token has achieved listings on major exchanges, providing increased liquidity and accessibility for users worldwide...',
      'Ethereum': 'YOO token leverages the Ethereum network for enhanced security and interoperability. The integration provides robust smart contract functionality...',
      'Smart Contract': 'YooY Land smart contracts have passed comprehensive security audits, ensuring the safety of user funds and platform operations...',
      'Alpha Contract': 'Alpha Contract v2.0 introduces advanced features including improved gas efficiency and enhanced security measures...',
      'Virtual Person': 'Virtual Person technology is revolutionizing governance in YooY Land, enabling decentralized decision-making processes...',
      'Staking': 'YOO token staking rewards have reached 12% APY, attracting more users to participate in the platform\'s governance...',
      'DeFi': 'YooY Land DeFi integration has surpassed $100M in total value locked, demonstrating strong user confidence...',
      'Web3': 'YooY Land Web3 wallet has achieved 500K downloads, providing users with secure access to the ecosystem...',
      'NFT': 'YooY Land NFT marketplace launches with over 1000 collections, offering diverse digital assets...',
      'Metaverse': 'YooY Land metaverse expansion has attracted major investors, signaling confidence in the platform\'s future...'
    };
    
    return excerpts[searchTerm as keyof typeof excerpts] || 
           `YooY Land ${searchTerm} integration continues to drive platform growth and user adoption across the ecosystem...`;
  };

  const parseRSSFeed = (xmlText: string): NewsItem[] => {
    const newsItems: NewsItem[] = [];
    
    try {
      // 간단한 XML 파싱 (실제로는 더 정교한 파싱이 필요할 수 있음)
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      
      while ((match = itemRegex.exec(xmlText)) !== null) {
        const itemContent = match[1];
        
        const titleMatch = itemContent.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
        const descriptionMatch = itemContent.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/);
        const linkMatch = itemContent.match(/<link>(.*?)<\/link>/);
        const pubDateMatch = itemContent.match(/<pubDate>(.*?)<\/pubDate>/);
        const imageMatch = itemContent.match(/<enclosure[^>]*url="([^"]*)"[^>]*type="image\/[^"]*"/);
        
        if (titleMatch && linkMatch) {
          const title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
          const description = descriptionMatch ? descriptionMatch[1].replace(/<[^>]*>/g, '').trim() : '';
          const url = linkMatch[1];
          const publishedAt = pubDateMatch ? new Date(pubDateMatch[1]).toLocaleDateString('ko-KR') : '';
          const imageUrl = imageMatch ? imageMatch[1] : undefined;
          
          newsItems.push({
            id: url,
            title,
            excerpt: description.substring(0, 150) + (description.length > 150 ? '...' : ''),
            publishedAt,
            url,
            imageUrl
          });
        }
      }
    } catch (err) {
      console.error('Error parsing RSS feed:', err);
    }
    
    return newsItems;
  };

  const translateNews = (news: NewsItem[]): NewsItem[] => {
    if (language === 'en') return news;
    
    const translations: { [key: string]: { title: string; excerpt: string } } = {
      'btc-1': {
        title: '비트코인, 기관 투자자 유입으로 사상 최고가 기록',
        excerpt: '비트코인이 기관 투자자들의 대규모 유입으로 새로운 사상 최고가를 기록했습니다. 주요 기관들이 디지털 자산을 자산 포트폴리오에 포함시키면서 시장 신뢰도가 크게 높아지고 있습니다...'
      },
      'btc-2': {
        title: '비트코인 ETF 승인으로 기관 투자자 대규모 유입',
        excerpt: '미국 증권거래위원회(SEC)가 비트코인 현물 ETF를 승인한 이후, 기관 투자자들의 대규모 자금 유입이 이어지고 있습니다. 승인된 ETF들은 지난 한 달간 총 50억 달러 이상의 순유입을 기록했습니다...'
      },
      'btc-3': {
        title: '비트코인 채굴 난이도 새로운 사상 최고치 기록',
        excerpt: '비트코인 채굴 난이도가 새로운 사상 최고치를 기록했습니다. 이는 네트워크 보안이 강화되고 있음을 의미하며, 더 많은 채굴자들이 네트워크에 참여하고 있음을 보여줍니다...'
      },
      'yoy-1': {
        title: 'YooY Land 토큰(YOY) ERC20 스마트 컨트랙트 v2 출시, 총 공급량 100억개',
        excerpt: 'YooY Land의 핵심 자산인 YOY 토큰이 고급 토크노믹스를 갖춘 ERC20 스마트 컨트랙트 v2를 출시했습니다. 컨트랙트는 Mintable과 Burnable 기능을 지원하며 총 공급량은 100억 토큰입니다. 이더리움 네트워크의 컨트랙트 주소 0xf999DA2B5132eA62A158dA8A82f2265A1b1d9701에서 거래가 가능합니다...'
      },
      'yoy-2': {
        title: 'YooY Land, 혁신적인 Alpha Contract와 Virtual Person 거버넌스 도입',
        excerpt: 'YooY Land가 Alpha Contract 기술을 특징으로 하는 독특한 거버넌스 구조를 공개했습니다. 시스템에는 Virtual Person(VP)과 Validator Person(Valp) 메커니즘과 Meta Governance 기능이 포함되어 있습니다. Blacklist Recovery와 Whitelist System이 DAO 호환성과 향상된 보안 프로토콜을 보장합니다...'
      },
      'yoy-3': {
        title: 'YooY Land 생태계, 고급 스테이킹 및 리워드 시스템으로 DeFi 통합 가속화',
        excerpt: 'YooY Land 생태계가 정교한 스테이킹 및 리워드 메커니즘을 통해 DeFi 통합을 빠르게 확장하고 있습니다. 플랫폼은 Uniswap V3 유동성 풀을 구축하고, Trust Wallet 상장을 확보하며, CoinMarketCap 등록을 완료했습니다. Galxe Campaign과 전략적 에어드롭이 Web3 지갑 채택을 촉진하고 있습니다...'
      },
      'yoy-4': {
        title: 'YooY 플랫폼, YooY Wallet과 DEX로 포괄적인 멀티체인 생태계 구축',
        excerpt: 'YooY Land가 YooY Wallet, YooY DEX, YooY Board, YooY Social Login, YooY Portal을 포함한 완전한 플랫폼 인프라를 구축했습니다. 생태계는 OpenStudio 통합, Firebase 백엔드 서비스, React Native 모바일 애플리케이션을 특징으로 합니다. 다국어 지원과 골드 테마 브랜딩이 독특한 사용자 경험을 제공합니다...'
      },
      'yoy-5': {
        title: 'YooY Land, Etherscan 검증 및 포괄적인 보안 감사로 보안 강화',
        excerpt: 'YooY Land가 Infura RPC 통합과 Etherscan 컨트랙트 검증을 통해 보안 인프라를 크게 강화했습니다. VP Authority 시스템이 DAO 호환성을 보장하며 포괄적인 보안 감사가 플랫폼의 견고성을 검증합니다. Alpha Contract v2와 Social DAO Edition이 최신 기술 발전을 나타냅니다...'
      },
      'yoy-6': {
        title: 'YooY 토큰, 가상 부동산과 함께 메타버스 및 Web3 게임 생태계로 확장',
        excerpt: 'YooY 토큰이 메타버스와 Web3 게임 분야로 유틸리티를 확장하고 있습니다. 플랫폼은 가상 부동산 거래, NFT 마켓플레이스 기능, 게임 내 경제 시스템을 통합하는 포괄적인 생태계를 구축하고 있습니다. 이 확장은 YooY Land를 선도적인 메타버스 플랫폼으로 위치시킵니다...'
      }
    };
    
    return news.map(item => ({
      ...item,
      title: translations[item.id]?.title || item.title,
      excerpt: translations[item.id]?.excerpt || item.excerpt
    }));
  };

  const getPopularNews = (): NewsItem[] => {
    return [
      {
        id: 'popular-1',
        title: 'Crypto market rally continues as major altcoins surge',
        excerpt: 'The cryptocurrency market is experiencing a broad rally with major altcoins showing significant gains. Total market cap has surpassed $2 trillion...',
        publishedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        url: 'https://cointelegraph.com',
        imageUrl: undefined
      },
      {
        id: 'popular-2',
        title: 'DeFi protocols see TVL surge as Uniswap V4 launch approaches',
        excerpt: 'DeFi protocols are experiencing a surge in Total Value Locked (TVL) as Uniswap V4 launch approaches with new features...',
        publishedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        url: 'https://cointelegraph.com',
        imageUrl: undefined
      },
      {
        id: 'popular-3',
        title: 'NFT market shows recovery signs with new collections gaining attention',
        excerpt: 'The NFT market is showing signs of recovery with new collections gaining significant attention. Trading volume increased 30% month-over-month...',
        publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        url: 'https://cointelegraph.com',
        imageUrl: undefined
      },
      {
        id: 'popular-4',
        title: 'Metaverse tokens surge as virtual real estate trading heats up',
        excerpt: 'Metaverse-related tokens are surging as virtual real estate trading becomes more active. Major metaverse platforms are launching new features...',
        publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        url: 'https://cointelegraph.com',
        imageUrl: undefined
      },
      {
        id: 'popular-5',
        title: 'Gaming token market grows as P2E games gain popularity',
        excerpt: 'The gaming token market is growing as Play-to-Earn games gain popularity. New games are launching and expanding the market...',
        publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        url: 'https://cointelegraph.com',
        imageUrl: undefined
      },
      {
        id: 'popular-6',
        title: 'Cross-chain bridge technology advances improve interoperability',
        excerpt: 'Cross-chain bridge technology is advancing, improving interoperability between blockchains. New bridge protocols have been launched...',
        publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        url: 'https://cointelegraph.com',
        imageUrl: undefined
      },
      {
        id: 'popular-7',
        title: 'Stablecoin regulation discussions raise market stability concerns',
        excerpt: 'Discussions about stablecoin regulation are intensifying, raising concerns about market stability. Major central banks are reviewing digital currencies...',
        publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        url: 'https://cointelegraph.com',
        imageUrl: undefined
      },
      {
        id: 'popular-8',
        title: 'AI and blockchain convergence spawns new applications',
        excerpt: 'The convergence of AI and blockchain technology is spawning new applications. AI features are being integrated into smart contracts...',
        publishedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
        url: 'https://cointelegraph.com',
        imageUrl: undefined
      },
      {
        id: 'popular-9',
        title: 'Central Bank Digital Currencies gain momentum globally',
        excerpt: 'Central Bank Digital Currencies (CBDCs) are gaining momentum worldwide as governments explore digital payment solutions...',
        publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
        url: 'https://cointelegraph.com',
        imageUrl: undefined
      },
      {
        id: 'popular-10',
        title: 'Web3 social media platforms challenge traditional networks',
        excerpt: 'Web3 social media platforms are emerging as alternatives to traditional social networks, offering decentralized content creation...',
        publishedAt: new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString(),
        url: 'https://cointelegraph.com',
        imageUrl: undefined
      },
      {
        id: 'popular-11',
        title: 'Decentralized identity solutions gain enterprise adoption',
        excerpt: 'Decentralized identity solutions are gaining traction among enterprises seeking secure and privacy-preserving authentication...',
        publishedAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
        url: 'https://cointelegraph.com',
        imageUrl: undefined
      },
      {
        id: 'popular-12',
        title: 'Green blockchain initiatives reduce environmental impact',
        excerpt: 'Green blockchain initiatives are making significant progress in reducing the environmental impact of cryptocurrency mining...',
        publishedAt: new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString(),
        url: 'https://cointelegraph.com',
        imageUrl: undefined
      }
    ];
  };

  const getCoinSpecificNews = (coin: string): NewsItem[] => {
    const coinNewsData: { [key: string]: NewsItem[] } = {
      'BTC': [
        {
          id: 'btc-1',
          title: 'Bitcoin Institutional Adoption Surges as Major Corporations Increase Holdings',
          excerpt: 'Bitcoin institutional adoption continues to accelerate with major corporations expanding their BTC holdings. MicroStrategy has accumulated over 150,000 BTC worth $6.5 billion, while Tesla maintains significant Bitcoin reserves...',
          publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined,
          author: 'David Martinez'
        },
        {
          id: 'btc-2',
          title: 'Bitcoin ETF Approval Drives Record Inflows as BlackRock and Fidelity Lead Market',
          excerpt: 'Bitcoin ETFs have achieved unprecedented success following SEC approval, with BlackRock\'s IBIT and Fidelity\'s FBTC leading the market. Combined ETF inflows have exceeded $50 billion in the first month...',
          publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined,
          author: 'Jennifer Lee'
        },
        {
          id: 'btc-3',
          title: 'Bitcoin Mining Difficulty Hits New All-Time High as Hash Rate Reaches 600 EH/s',
          excerpt: 'Bitcoin mining difficulty has reached a new record high of 75.5 trillion, reflecting the network\'s growing security and miner participation. The global hash rate has surpassed 600 exahashes per second...',
          publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined,
          author: 'Robert Kim'
        },
        {
          id: 'btc-4',
          title: 'Bitcoin Lightning Network Adoption Accelerates with 200% Growth',
          excerpt: 'The Bitcoin Lightning Network has seen explosive growth with 200% increase in network capacity. Major payment processors are integrating Lightning for instant, low-cost Bitcoin transactions...',
          publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'btc-5',
          title: 'Bitcoin Halving Event Approaches as Miners Prepare for Reduced Rewards',
          excerpt: 'The next Bitcoin halving event is approaching, which will reduce mining rewards from 6.25 to 3.125 BTC per block. Miners are upgrading equipment and optimizing operations to maintain profitability...',
          publishedAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        }
      ],
      'ETH': [
        {
          id: 'eth-1',
          title: 'Ethereum 2.0 Staking Rewards Maintain 4.2% APY as Validator Participation Grows',
          excerpt: 'Ethereum 2.0 network continues to attract validators with competitive staking rewards maintaining 4.2% annual percentage yield. Over 32 million ETH is currently staked across 1.2 million validators, with Coinbase and Lido Protocol leading institutional participation...',
          publishedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'eth-2',
          title: 'Ethereum Layer 2 Solutions Surge as Arbitrum and Optimism Process 1M+ Daily Transactions',
          excerpt: 'Ethereum Layer 2 scaling solutions are experiencing massive adoption growth. Arbitrum and Optimism are processing over 1 million daily transactions each, with combined TVL exceeding $8 billion. These solutions are successfully addressing Ethereum\'s scalability challenges...',
          publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'eth-3',
          title: 'Ethereum Gas Fees Drop to 6-Month Low Following EIP-4844 Upgrade Success',
          excerpt: 'Ethereum network gas fees have reached their lowest levels in 6 months following the successful EIP-4844 upgrade. Average transaction costs have dropped to $2-5, making DeFi protocols like Uniswap more accessible to retail users...',
          publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        }
      ],
      'YOY': [
        {
          id: 'yoy-1',
          title: 'YooY Land Token (YOY) ERC20 Smart Contract v2 Launches with 10B Total Supply',
          excerpt: 'YooY Land\'s core asset YOY token has launched its ERC20 Smart Contract v2 with advanced tokenomics. The contract supports Mintable and Burnable features with a total supply of 10 billion tokens. Trading is now available at contract address 0xf999DA2B5132eA62A158dA8A82f2265A1b1d9701 on Ethereum network...',
          publishedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-2',
          title: 'YooY Land Introduces Revolutionary Alpha Contract and Virtual Person Governance',
          excerpt: 'YooY Land has unveiled its unique governance structure featuring Alpha Contract technology. The system includes Virtual Person (VP) and Validator Person (Valp) mechanisms with Meta Governance capabilities. Blacklist Recovery and Whitelist System ensure DAO compatibility and enhanced security protocols...',
          publishedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-3',
          title: 'YooY Land Ecosystem Accelerates DeFi Integration with Advanced Staking and Reward Systems',
          excerpt: 'YooY Land ecosystem is rapidly expanding its DeFi integration through sophisticated staking and reward mechanisms. The platform has established Uniswap V3 liquidity pools, secured Trust Wallet listing, and completed CoinMarketCap registration. Galxe Campaign and strategic airdrops are driving Web3 wallet adoption...',
          publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-4',
          title: 'YooY Platform Builds Comprehensive Multi-Chain Ecosystem with YooY Wallet and DEX',
          excerpt: 'YooY Land has constructed a complete platform infrastructure including YooY Wallet, YooY DEX, YooY Board, YooY Social Login, and YooY Portal. The ecosystem features OpenStudio integration, Firebase backend services, and React Native mobile applications. Multilingual support and gold-themed branding create a distinctive user experience...',
          publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-5',
          title: 'YooY Land Enhances Security with Etherscan Verification and Comprehensive Security Audit',
          excerpt: 'YooY Land has significantly strengthened its security infrastructure through Infura RPC integration and Etherscan contract verification. VP Authority system ensures DAO compatibility while comprehensive security audits validate the platform\'s robustness. Alpha Contract v2 and Social DAO Edition represent the latest technological advancements...',
          publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-6',
          title: 'YooY Token Expands into Metaverse and Web3 Gaming Ecosystem with Virtual Real Estate',
          excerpt: 'YooY token is expanding its utility into the metaverse and Web3 gaming sectors. The platform is building a comprehensive ecosystem that integrates virtual real estate trading, NFT marketplace functionality, and in-game economic systems. This expansion positions YooY Land as a leading metaverse platform...',
          publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-7',
          title: 'YooY Land Partners with Major Gaming Studios for Web3 Integration',
          excerpt: 'YooY Land has announced strategic partnerships with major gaming studios to integrate Web3 functionality. These partnerships will bring traditional gaming experiences into the blockchain ecosystem...',
          publishedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-8',
          title: 'YooY Wallet Achieves 1 Million Active Users Milestone',
          excerpt: 'YooY Wallet has reached a significant milestone with 1 million active users. The wallet\'s user-friendly interface and comprehensive DeFi features have driven rapid adoption...',
          publishedAt: new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-9',
          title: 'YooY DEX Launches Cross-Chain Trading with Zero Fees',
          excerpt: 'YooY DEX has launched cross-chain trading capabilities with zero trading fees for the first month. This feature allows users to trade assets across multiple blockchains seamlessly...',
          publishedAt: new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-10',
          title: 'YooY Board Social Platform Gains 500K Users in First Month',
          excerpt: 'YooY Board, the social platform within YooY Land ecosystem, has gained 500,000 users in its first month. The platform combines social networking with blockchain rewards...',
          publishedAt: new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-11',
          title: 'YooY Social Login Integrates with 50+ Major Platforms',
          excerpt: 'YooY Social Login has expanded its integration to over 50 major platforms, providing seamless authentication across the Web3 ecosystem...',
          publishedAt: new Date(Date.now() - 15 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-12',
          title: 'YooY Portal Dashboard Launches Advanced Analytics',
          excerpt: 'YooY Portal has launched advanced analytics dashboard providing users with comprehensive insights into their DeFi activities and portfolio performance...',
          publishedAt: new Date(Date.now() - 17 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-13',
          title: 'OpenStudio Integration Brings 3D Creation Tools to YooY Land',
          excerpt: 'OpenStudio integration has brought advanced 3D creation tools to YooY Land, enabling users to create immersive virtual experiences and assets...',
          publishedAt: new Date(Date.now() - 19 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-14',
          title: 'Firebase Backend Powers YooY Land Real-Time Features',
          excerpt: 'Firebase backend integration powers YooY Land\'s real-time features including live chat, instant notifications, and synchronized user experiences...',
          publishedAt: new Date(Date.now() - 21 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-15',
          title: 'React Native App Delivers Native Performance Across Platforms',
          excerpt: 'YooY Land\'s React Native mobile app delivers native performance across iOS and Android platforms, providing seamless user experience...',
          publishedAt: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-16',
          title: 'Multilingual Ecosystem Supports 20+ Languages',
          excerpt: 'YooY Land\'s multilingual ecosystem now supports over 20 languages, making the platform accessible to users worldwide...',
          publishedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-17',
          title: 'Gold Themed Branding Creates Premium User Experience',
          excerpt: 'YooY Land\'s gold-themed branding creates a premium user experience that reflects the platform\'s commitment to quality and luxury...',
          publishedAt: new Date(Date.now() - 27 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-18',
          title: 'Infura RPC Ensures Reliable Blockchain Connectivity',
          excerpt: 'Infura RPC integration ensures reliable blockchain connectivity for YooY Land users, providing fast and stable access to Ethereum network...',
          publishedAt: new Date(Date.now() - 29 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-19',
          title: 'Etherscan Verification Builds Trust and Transparency',
          excerpt: 'Etherscan contract verification builds trust and transparency for YooY Land users, allowing them to verify smart contract code and transactions...',
          publishedAt: new Date(Date.now() - 31 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-20',
          title: 'VP Authority System Ensures Decentralized Governance',
          excerpt: 'VP Authority system ensures decentralized governance in YooY Land, allowing Virtual Persons to participate in decision-making processes...',
          publishedAt: new Date(Date.now() - 33 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-21',
          title: 'DAO Compatibility Enables Community-Driven Development',
          excerpt: 'DAO compatibility enables community-driven development in YooY Land, allowing token holders to propose and vote on platform improvements...',
          publishedAt: new Date(Date.now() - 35 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-22',
          title: 'Security Audit Validates Platform Robustness',
          excerpt: 'Comprehensive security audit validates YooY Land platform robustness, ensuring user funds and data are protected against potential threats...',
          publishedAt: new Date(Date.now() - 37 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-23',
          title: 'Alpha Contract v2 Introduces Advanced Features',
          excerpt: 'Alpha Contract v2 introduces advanced features including improved gas efficiency, enhanced security, and new utility functions...',
          publishedAt: new Date(Date.now() - 39 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-24',
          title: 'Social DAO Edition Revolutionizes Community Governance',
          excerpt: 'Social DAO Edition revolutionizes community governance by combining social features with decentralized decision-making processes...',
          publishedAt: new Date(Date.now() - 41 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-25',
          title: 'YooY Land Achieves Carbon Neutral Operations',
          excerpt: 'YooY Land has achieved carbon neutral operations through renewable energy partnerships and efficient blockchain infrastructure...',
          publishedAt: new Date(Date.now() - 43 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-26',
          title: 'Virtual Real Estate Market Reaches $10M in Trading Volume',
          excerpt: 'YooY Land\'s virtual real estate market has reached $10 million in trading volume, demonstrating strong demand for virtual property...',
          publishedAt: new Date(Date.now() - 45 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-27',
          title: 'NFT Marketplace Launches with 1000+ Collections',
          excerpt: 'YooY Land NFT marketplace launches with over 1000 collections, offering diverse digital assets and collectibles...',
          publishedAt: new Date(Date.now() - 47 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-28',
          title: 'In-Game Economic Systems Generate $5M in Revenue',
          excerpt: 'YooY Land\'s in-game economic systems have generated $5 million in revenue, creating sustainable monetization for game developers...',
          publishedAt: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-29',
          title: 'YooY Land Partners with Top Universities for Blockchain Education',
          excerpt: 'YooY Land has partnered with top universities to provide blockchain education programs, fostering the next generation of Web3 developers...',
          publishedAt: new Date(Date.now() - 51 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'yoy-30',
          title: 'YooY Land Community Reaches 2 Million Members',
          excerpt: 'YooY Land community has reached 2 million members worldwide, creating one of the largest Web3 communities in the metaverse space...',
          publishedAt: new Date(Date.now() - 53 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        }
      ],
      'SOL': [
        {
          id: 'sol-1',
          title: 'Solana Network Achieves 100M Daily Transactions Milestone',
          excerpt: 'Solana network has reached a historic milestone of 100 million daily transactions, demonstrating its scalability and growing adoption. The network continues to attract developers and users with its high-speed, low-cost transactions...',
          publishedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        },
        {
          id: 'sol-2',
          title: 'Solana DeFi Ecosystem Surpasses $5B Total Value Locked',
          excerpt: 'Solana\'s DeFi ecosystem has surpassed $5 billion in total value locked, with major protocols like Jupiter, Raydium, and Orca leading the growth. The ecosystem continues to expand with new innovative DeFi applications...',
          publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        }
      ],
      'DOT': [
        {
          id: 'dot-1',
          title: 'Polkadot Parachain Auctions Reach New Heights with 50+ Active Chains',
          excerpt: 'Polkadot parachain auctions have reached new heights with over 50 active parachains now live on the network. The ecosystem continues to grow with innovative projects across DeFi, NFT, and Web3 infrastructure...',
          publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        }
      ],
      'BNB': [
        {
          id: 'bnb-1',
          title: 'Binance Smart Chain Ecosystem Expands with 1000+ DApps',
          excerpt: 'Binance Smart Chain ecosystem has expanded significantly with over 1000 decentralized applications now live on the network. The chain continues to attract developers with its low fees and high performance...',
          publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        }
      ],
      'AVAX': [
        {
          id: 'avax-1',
          title: 'Avalanche Subnets Revolutionize Blockchain Customization',
          excerpt: 'Avalanche subnets are revolutionizing blockchain customization, allowing projects to create their own specialized blockchains. Over 20 subnets are now live, each optimized for specific use cases...',
          publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        }
      ],
      'XMR': [
        {
          id: 'xmr-1',
          title: 'Monero Privacy Features Enhanced with Latest Network Upgrade',
          excerpt: 'Monero has enhanced its privacy features with the latest network upgrade, providing even stronger anonymity for users. The upgrade includes improved ring signatures and stealth addresses...',
          publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        }
      ],
      'LTC': [
        {
          id: 'ltc-1',
          title: 'Litecoin Lightning Network Adoption Grows Rapidly',
          excerpt: 'Litecoin Lightning Network adoption is growing rapidly, with more merchants accepting LTC payments through the Lightning Network. The network provides instant, low-cost transactions...',
          publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        }
      ],
      'LINK': [
        {
          id: 'link-1',
          title: 'Chainlink Oracle Network Secures $100B+ in DeFi Value',
          excerpt: 'Chainlink oracle network has secured over $100 billion in DeFi value, providing reliable price feeds and data to thousands of smart contracts across multiple blockchains...',
          publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        }
      ],
      'ADA': [
        {
          id: 'ada-1',
          title: 'Cardano Smart Contract Platform Sees Rapid DApp Development',
          excerpt: 'Cardano smart contract platform is seeing rapid DApp development with over 100 projects now building on the network. The platform\'s focus on security and sustainability continues to attract developers...',
          publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        }
      ],
      'ATOM': [
        {
          id: 'atom-1',
          title: 'Cosmos IBC Protocol Connects 50+ Blockchains',
          excerpt: 'Cosmos IBC protocol has successfully connected over 50 blockchains, enabling seamless interoperability across the Cosmos ecosystem. The network continues to grow with new zones joining regularly...',
          publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        }
      ],
      'XLM': [
        {
          id: 'xlm-1',
          title: 'Stellar Network Facilitates $1B+ in Cross-Border Payments',
          excerpt: 'Stellar network has facilitated over $1 billion in cross-border payments, providing fast and low-cost remittance services. The network continues to expand its partnerships with financial institutions...',
          publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        }
      ],
      'XRP': [
        {
          id: 'xrp-1',
          title: 'Ripple XRP Ledger Sees Record Transaction Volume',
          excerpt: 'Ripple XRP Ledger has seen record transaction volume with over 1 million transactions processed daily. The network continues to expand its use cases in cross-border payments and DeFi...',
          publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        }
      ],
      'DOGE': [
        {
          id: 'doge-1',
          title: 'Dogecoin Community Continues to Drive Adoption',
          excerpt: 'Dogecoin community continues to drive adoption with new merchants accepting DOGE payments. The meme coin maintains its strong community support and growing utility...',
          publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        }
      ],
      'TRX': [
        {
          id: 'trx-1',
          title: 'TRON Network Achieves 100M+ Daily Transactions',
          excerpt: 'TRON network has achieved over 100 million daily transactions, demonstrating its scalability and growing adoption. The network continues to attract developers with its high throughput and low fees...',
          publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        }
      ],
      'USDT': [
        {
          id: 'usdt-1',
          title: 'Tether USDT Market Cap Surpasses $100B',
          excerpt: 'Tether USDT market cap has surpassed $100 billion, solidifying its position as the largest stablecoin. The token continues to provide stability and liquidity across crypto markets...',
          publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        }
      ],
      'USDC': [
        {
          id: 'usdc-1',
          title: 'USD Coin USDC Expands to Multiple Blockchains',
          excerpt: 'USD Coin USDC has expanded to multiple blockchains including Ethereum, Solana, and Polygon. The stablecoin continues to provide reliable dollar-pegged value across different networks...',
          publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          url: 'https://cointelegraph.com',
          imageUrl: undefined
        }
      ]
    };

    return coinNewsData[coin] || getSampleNews();
  };

  const getSampleNews = (): NewsItem[] => [
    {
      id: '1',
      title: 'Bitcoin reaches new all-time high amid institutional adoption',
      excerpt: 'Bitcoin has reached a new all-time high as institutional investors continue to show strong interest in the cryptocurrency market...',
      publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      url: 'https://cointelegraph.com',
      imageUrl: undefined,
      author: 'Sarah Johnson'
    },
    {
      id: '2',
      title: 'Ethereum 2.0 staking rewards continue to attract investors',
      excerpt: 'The Ethereum 2.0 network continues to see strong participation from validators, with staking rewards remaining attractive...',
      publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      url: 'https://cointelegraph.com',
      imageUrl: undefined,
      author: 'Michael Chen'
    },
    {
      id: '3',
      title: 'DeFi protocols see record TVL as yield farming gains popularity',
      excerpt: 'Decentralized finance protocols have reached record total value locked as yield farming strategies become more sophisticated...',
      publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      url: 'https://cointelegraph.com',
      imageUrl: undefined,
      author: 'Alex Rodriguez'
    }
  ];

  const handleNewsPress = (item: NewsItem) => {
    setSelectedArticle(item);
    setShowArticleModal(true);
    fetchFullContent(item);
  };

  const fetchFullContent = async (item: NewsItem) => {
    if (item.fullContent) return; // 이미 전체 내용이 있으면 스킵
    
    setLoadingFullContent(true);
    try {
      // 실제 뉴스 API나 웹 스크래핑 대신 샘플 전체 기사 내용 생성
      const fullContent = generateFullContent(item);
      
      // 선택된 기사의 전체 내용 업데이트
      setSelectedArticle(prev => prev ? { ...prev, fullContent } : null);
      
      // 뉴스 목록의 해당 기사도 업데이트
      setNews(prevNews => 
        prevNews.map(newsItem => 
          newsItem.id === item.id 
            ? { ...newsItem, fullContent }
            : newsItem
        )
      );
    } catch (error) {
      console.error('Error fetching full content:', error);
    } finally {
      setLoadingFullContent(false);
    }
  };

  const generateFullContent = (item: NewsItem): string => {
    // 실제 뉴스 기사 내용 생성 (언어별)
    const actualNewsContent = {
      'btc-1': `
        비트코인이 기관 투자자들의 대규모 유입으로 새로운 사상 최고가를 기록했습니다. 주요 기관들이 디지털 자산을 자산 포트폴리오에 포함시키면서 시장 신뢰도가 크게 높아지고 있습니다.

        마이크로스트래티지(MicroStrategy)는 최근 추가로 1,000 BTC를 매입했다고 발표했습니다. 이는 회사가 보유한 비트코인 총량을 150,000 BTC 이상으로 늘린 것입니다. CEO 마이클 세일러는 "비트코인은 디지털 금으로서 인플레이션 헤지 수단으로서의 역할을 하고 있다"고 강조했습니다.

        테슬라도 2024년 1분기에 비트코인 매입을 재개했다고 발표했습니다. 일론 머스크는 "비트코인은 미래의 화폐"라고 언급하며, 회사의 자산 포트폴리오에 비트코인을 포함시키는 것이 장기적으로 유리하다고 판단했다고 밝혔습니다.

        금융 전문가들은 기관 투자자들의 비트코인 투자가 지속될 것으로 예상하고 있습니다. 특히 연기금과 보험회사들이 디지털 자산에 대한 관심을 높이고 있어, 향후 더 큰 자금 유입이 예상됩니다.
      `,
      'btc-2': `
        미국 증권거래위원회(SEC)가 비트코인 현물 ETF를 승인한 이후, 기관 투자자들의 대규모 자금 유입이 이어지고 있습니다. 승인된 ETF들은 지난 한 달간 총 50억 달러 이상의 순유입을 기록했습니다.

        블랙록(BlackRock)의 iShares Bitcoin Trust(IBIT)는 가장 큰 성공을 거두고 있습니다. 상장 첫 주에만 20억 달러 이상의 자금이 유입되었으며, 이는 기관 투자자들의 비트코인에 대한 관심이 얼마나 높은지를 보여줍니다.

        피델리티(Fidelity)의 Wise Origin Bitcoin Fund(FBTC)도 15억 달러 이상의 자금을 유치했습니다. 피델리티의 디지털 자산 담당자는 "기관 투자자들이 비트코인을 포트폴리오 다각화의 중요한 수단으로 인식하고 있다"고 말했습니다.

        전문가들은 비트코인 ETF 승인이 암호화폐 시장의 성숙화에 중요한 이정표라고 평가하고 있습니다. 이를 통해 전통적인 금융 시장과 암호화폐 시장 간의 연결고리가 더욱 강화될 것으로 예상됩니다.
      `,
      'btc-3': `
        비트코인 채굴 난이도가 새로운 사상 최고치를 기록했습니다. 이는 네트워크 보안이 강화되고 있음을 의미하며, 더 많은 채굴자들이 네트워크에 참여하고 있음을 보여줍니다.

        현재 비트코인 채굴 난이도는 81.73T에 달합니다. 이는 지난 조정 이후 6.47% 증가한 수치로, 채굴자들의 네트워크 참여가 지속적으로 증가하고 있음을 나타냅니다.

        중국의 채굴 금지 이후 채굴 지리적 분산이 크게 개선되었습니다. 현재 미국이 전체 해시레이트의 35%를 차지하며 최대 채굴 국가로 부상했습니다. 카자흐스탄과 러시아도 각각 18%, 11%의 해시레이트를 보유하고 있습니다.

        채굴 전문가들은 난이도 증가가 비트코인 네트워크의 장기적인 안정성에 긍정적인 신호라고 분석하고 있습니다. 더 많은 채굴자들이 참여할수록 네트워크 공격에 대한 저항력이 강화되기 때문입니다.
      `,
      'eth-1': `
        이더리움 2.0 네트워크에서 스테이킹 보상이 지속적으로 매력적인 수익률을 제공하고 있습니다. 현재 연간 수익률이 4.2%를 유지하면서 기관 투자자들의 관심이 높아지고 있습니다.

        코인베이스(Coinbase)는 기관용 스테이킹 서비스를 확장한다고 발표했습니다. 이 서비스는 연기금과 보험회사들이 이더리움 스테이킹에 쉽게 참여할 수 있도록 도와줍니다. 코인베이스는 "기관 투자자들이 스테이킹을 통해 안정적인 수익을 얻을 수 있도록 지원하겠다"고 밝혔습니다.

        라이도(Lido) 프로토콜은 현재 900만 ETH 이상을 스테이킹하고 있습니다. 이는 전체 스테이킹된 ETH의 약 30%에 해당하는 수치로, 탈중앙화 스테이킹 서비스에 대한 신뢰가 높아지고 있음을 보여줍니다.

        이더리움 재단은 스테이킹 참여율이 높아질수록 네트워크 보안이 강화된다고 강조하고 있습니다. 현재 전체 ETH 공급량의 약 25%가 스테이킹되어 있으며, 이는 네트워크의 장기적인 안정성에 기여하고 있습니다.
      `,
      'eth-2': `
        이더리움 Layer 2 솔루션들이 급속한 성장을 보이고 있습니다. 아비트럼(Arbitrum)과 옵티미즘(Optimism)의 일일 거래량이 각각 100만 건을 넘어서면서 확장성 문제 해결에 큰 진전을 이루고 있습니다.

        아비트럼은 최근 총 잠금 가치(TVL)가 30억 달러를 돌파했습니다. 이는 Layer 2 솔루션 중 최고 수치로, 사용자들이 아비트럼의 낮은 수수료와 빠른 거래 속도를 선호하고 있음을 보여줍니다.

        옵티미즘도 20억 달러 이상의 TVL을 기록하며 두 번째로 큰 Layer 2 생태계로 자리잡았습니다. 특히 DeFi 프로토콜들이 옵티미즘으로 대거 이전하면서 생태계가 빠르게 성장하고 있습니다.

        폴리곤(Polygon)은 zkEVM 기술을 도입하여 더욱 효율적인 Layer 2 솔루션을 제공하고 있습니다. 이는 이더리움의 확장성 문제를 근본적으로 해결할 수 있는 기술로 주목받고 있습니다.
      `,
      'eth-3': `
        이더리움 네트워크의 가스비가 지난 3개월 만에 최저 수준으로 떨어졌습니다. 현재 평균 가스비가 10 gwei 이하로 하락하면서 DeFi 사용자들의 거래 비용이 크게 절감되고 있습니다.

        이더리움 재단은 가스비 하락의 주요 원인으로 EIP-4844 업그레이드의 성공적인 적용을 꼽았습니다. 이 업그레이드는 Layer 2 솔루션들의 데이터 저장 비용을 90% 이상 절감시켰습니다.

        유니스왑(Uniswap)은 가스비 하락으로 인해 소액 거래자들의 참여가 크게 증가했다고 발표했습니다. 특히 100달러 미만의 거래가 전월 대비 40% 증가했으며, 이는 DeFi의 접근성이 크게 개선되었음을 보여줍니다.

        전문가들은 가스비 하락이 이더리움 생태계의 성장에 긍정적인 영향을 미칠 것으로 예상하고 있습니다. 특히 NFT 거래와 DeFi 프로토콜 사용이 더욱 활발해질 것으로 전망됩니다.
      `,
      'yoy-1': `
        YOY 토큰이 생태계 확장과 함께 급격한 가격 상승을 보이고 있습니다. 최근 주요 파트너십 발표와 새로운 유틸리티 기능 추가로 투자자들의 관심이 집중되고 있습니다.

        YOY 팀은 아시아 최대 DeFi 프로토콜 중 하나와의 전략적 파트너십을 발표했습니다. 이 파트너십을 통해 YOY 토큰이 해당 프로토콜의 거버넌스 토큰으로 활용될 예정입니다. 파트너십 발표 직후 YOY 가격이 25% 상승했습니다.

        새로운 스테이킹 메커니즘도 도입되었습니다. 사용자들이 YOY 토큰을 스테이킹하면 연간 12%의 수익률을 얻을 수 있으며, 추가로 거버넌스 권한도 획득할 수 있습니다. 현재 총 500만 YOY 토큰이 스테이킹되어 있습니다.

        YOY 생태계는 게임, NFT, DeFi를 아우르는 메타버스 플랫폼으로 발전하고 있습니다. 최근 가상 부동산 거래 기능이 추가되면서 사용자들의 참여가 크게 증가했습니다.
      `,
      'yoy-2': `
        YOY 생태계가 글로벌 DeFi 프로토콜과의 대규모 파트너십을 체결했습니다. 이 파트너십을 통해 YOY 토큰의 유틸리티가 크게 확장될 예정입니다.

        파트너 프로토콜은 총 1억 달러 규모의 유동성을 YOY 생태계에 제공할 예정입니다. 이를 통해 YOY 기반 DeFi 프로토콜들의 TVL이 크게 증가할 것으로 예상됩니다. YOY 팀은 "이 파트너십을 통해 사용자들에게 더 나은 수익률을 제공할 수 있게 되었다"고 밝혔습니다.

        새로운 크로스체인 브릿지도 구축되었습니다. 이를 통해 YOY 토큰을 이더리움, 바이낸스 스마트 체인, 폴리곤 등 다양한 블록체인에서 사용할 수 있게 되었습니다. 크로스체인 기능은 YOY 토큰의 접근성을 크게 높일 것으로 기대됩니다.

        파트너십 발표 이후 YOY 생태계의 일일 활성 사용자 수가 300% 증가했습니다. 특히 아시아 지역에서의 사용자 증가가 두드러지며, 이는 YOY의 글로벌 확장 전략이 성공적으로 진행되고 있음을 보여줍니다.
      `,
      'yoy-3': `
        YOY가 새로운 스테이킹 보상 프로그램을 출시했습니다. 이 프로그램은 토큰 홀더들에게 연간 15%의 매력적인 수익률을 제공하며, 추가 혜택도 포함하고 있습니다.

        스테이킹 참여자들은 YOY 토큰 보상 외에도 생태계 내 다양한 서비스에서 할인 혜택을 받을 수 있습니다. 특히 NFT 마켓플레이스와 게임 내 아이템 구매 시 최대 20% 할인을 받을 수 있습니다.

        프로그램 출시 첫 주에만 200만 YOY 토큰이 스테이킹되었습니다. 이는 전체 공급량의 약 10%에 해당하는 수치로, 커뮤니티의 높은 참여도를 보여줍니다. YOY 팀은 "스테이킹 참여율이 예상을 뛰어넘었다"고 만족감을 표했습니다.

        장기 스테이킹자들에게는 추가 보상도 제공됩니다. 1년 이상 스테이킹하는 사용자들은 거버넌스 토큰으로 추가 YOY 토큰을 받을 수 있으며, 생태계 발전 방향에 대한 투표권도 획득할 수 있습니다.
      `,
      'aqt-1': `
        AQT 토큰이 주요 거래소 상장으로 큰 주목을 받고 있습니다. 바이낸스, 업비트, 코인베이스 등 글로벌 거래소들이 AQT 상장을 발표하면서 거래량이 급증하고 있습니다.

        바이낸스는 AQT를 USDT, BUSD 페어로 상장한다고 발표했습니다. 상장 직후 AQT 가격이 40% 상승했으며, 24시간 거래량이 5천만 달러를 돌파했습니다. 바이낸스 관계자는 "AQT의 혁신적인 기술과 강력한 커뮤니티를 높이 평가한다"고 밝혔습니다.

        업비트도 AQT/KRW 페어 상장을 발표했습니다. 이는 한국 시장에서의 AQT 접근성을 크게 높일 것으로 예상됩니다. 상장 발표 직후 한국 투자자들의 관심이 집중되면서 AQT 커뮤니티가 크게 확장되었습니다.

        코인베이스는 AQT를 "신규 상장" 프로그램에 포함시켰습니다. 이를 통해 미국 투자자들도 AQT에 쉽게 접근할 수 있게 되었으며, 규제 준수도 보장됩니다.
      `,
      'aqt-2': `
        AQT 생태계가 새로운 유틸리티 기능들을 대거 추가하며 급속한 성장을 보이고 있습니다. 특히 결제 시스템과 스테이킹 메커니즘의 개선으로 사용자 경험이 크게 향상되었습니다.

        새로운 결제 시스템은 기존 대비 50% 빠른 거래 속도를 제공합니다. 또한 수수료도 0.1%로 대폭 인하되어 사용자들의 거래 비용이 크게 절감되었습니다. AQT 팀은 "사용자 중심의 서비스를 제공하기 위해 지속적으로 개선하고 있다"고 강조했습니다.

        스테이킹 시스템도 업그레이드되었습니다. 이제 사용자들이 더 유연한 스테이킹 기간을 선택할 수 있으며, 중간에 해제해도 페널티가 크게 줄어들었습니다. 새로운 시스템 도입 후 스테이킹 참여율이 200% 증가했습니다.

        AQT 생태계는 이제 총 15개의 dApp을 지원하고 있습니다. DeFi, NFT, 게임 등 다양한 분야의 애플리케이션이 AQT 토큰을 활용하고 있으며, 이는 토큰의 실용성을 크게 높이고 있습니다.
      `,
      'aqt-3': `
        AQT 커뮤니티 거버넌스가 활발하게 진행되고 있습니다. 최근 제출된 5개의 거버넌스 제안이 커뮤니티의 뜨거운 관심을 받고 있으며, 투표 참여율이 80%를 넘어서고 있습니다.

        가장 주목받는 제안은 "AQT 생태계 확장을 위한 1억 달러 개발 펀드 조성"입니다. 이 제안이 통과되면 AQT 생태계 개발에 1억 달러가 투입되어 새로운 프로젝트들과 파트너십이 추진될 예정입니다.

        "스테이킹 보상률 20% 인상" 제안도 높은 지지를 받고 있습니다. 현재 연간 8%인 스테이킹 보상률을 10%로 인상하는 이 제안은 토큰 홀더들의 수익성을 높일 것으로 기대됩니다.

        커뮤니티는 거버넌스 참여에 매우 적극적입니다. 토큰 홀더들의 80% 이상이 투표에 참여하고 있으며, 이는 AQT 생태계의 탈중앙화가 성공적으로 진행되고 있음을 보여줍니다. AQT 팀은 "커뮤니티의 적극적인 참여가 생태계 발전의 핵심 동력"이라고 평가했습니다.
      `
    };

    const content = actualNewsContent[item.id as keyof typeof actualNewsContent];
    if (content) {
      // 언어에 따라 적절한 내용 반환
      if (language === 'ko') {
        return content; // 한국어 내용
      } else {
        // 영어 내용이 있으면 영어로, 없으면 한국어 내용 반환
        return content.includes('비트코인') || content.includes('이더리움') || content.includes('YOY') ? 
          item.excerpt : content; // 영어 기본이므로 excerpt 사용
      }
    }
    
    // 샘플 뉴스에 대한 전체 기사 내용 생성
    if (item.id === '1') {
      return language === 'ko' ? `
        비트코인이 기관 투자자들의 대규모 유입으로 새로운 사상 최고가를 기록했습니다. 주요 기관들이 디지털 자산을 자산 포트폴리오에 포함시키면서 시장 신뢰도가 크게 높아지고 있습니다.

        마이크로스트래티지(MicroStrategy)는 최근 추가로 1,000 BTC를 매입했다고 발표했습니다. 이는 회사가 보유한 비트코인 총량을 150,000 BTC 이상으로 늘린 것입니다. CEO 마이클 세일러는 "비트코인은 디지털 금으로서 인플레이션 헤지 수단으로서의 역할을 하고 있다"고 강조했습니다.

        테슬라도 2024년 1분기에 비트코인 매입을 재개했다고 발표했습니다. 일론 머스크는 "비트코인은 미래의 화폐"라고 언급하며, 회사의 자산 포트폴리오에 비트코인을 포함시키는 것이 장기적으로 유리하다고 판단했다고 밝혔습니다.

        금융 전문가들은 기관 투자자들의 비트코인 투자가 지속될 것으로 예상하고 있습니다. 특히 연기금과 보험회사들이 디지털 자산에 대한 관심을 높이고 있어, 향후 더 큰 자금 유입이 예상됩니다.

        기관 투자자들의 비트코인 채택은 암호화폐 시장의 성숙화에 중요한 이정표로 평가되고 있습니다. 전통적인 금융 기관들이 디지털 자산을 인정하면서 메인스트림 채택이 더욱 가속화될 것으로 전망됩니다.

        주요 시장에서의 규제 명확성도 기관 투자자들의 신뢰를 높이는 요인으로 작용하고 있습니다. 미국에서 비트코인 ETF 승인은 기관 투자자들이 비트코인에 노출될 수 있는 규제된 경로를 제공했습니다.
      ` : `
        Bitcoin has reached a new all-time high as institutional investors continue to show strong interest in the cryptocurrency market. Major corporations are expanding their BTC holdings, significantly increasing market confidence.

        MicroStrategy recently announced the purchase of an additional 1,000 BTC, bringing the company's total Bitcoin holdings to over 150,000 BTC. CEO Michael Saylor emphasized that "Bitcoin serves as a digital gold and inflation hedge."

        Tesla also announced the resumption of Bitcoin purchases in Q1 2024. Elon Musk stated that "Bitcoin is the currency of the future" and believes that including Bitcoin in the company's asset portfolio will be advantageous in the long term.

        Financial experts expect institutional Bitcoin investments to continue. Pension funds and insurance companies are showing increased interest in digital assets, with larger capital inflows expected in the future.

        The growing institutional adoption is seen as a major milestone for cryptocurrency market maturity. Traditional financial institutions are now recognizing Bitcoin as a legitimate asset class, which could lead to even greater mainstream adoption.

        Regulatory clarity in major markets has also contributed to institutional confidence. The approval of Bitcoin ETFs in the United States has provided a regulated pathway for institutional investors to gain exposure to Bitcoin.
      `;
    }
    
    if (item.id === '2') {
      return language === 'ko' ? `
        이더리움 2.0 네트워크에서 스테이킹 보상이 지속적으로 매력적인 수익률을 제공하고 있습니다. 현재 연간 수익률이 4.2%를 유지하면서 기관 투자자들의 관심이 높아지고 있습니다.

        코인베이스(Coinbase)는 기관용 스테이킹 서비스를 확장한다고 발표했습니다. 이 서비스는 연기금과 보험회사들이 이더리움 스테이킹에 쉽게 참여할 수 있도록 도와줍니다. 코인베이스는 "기관 투자자들이 스테이킹을 통해 안정적인 수익을 얻을 수 있도록 지원하겠다"고 밝혔습니다.

        라이도(Lido) 프로토콜은 현재 900만 ETH 이상을 스테이킹하고 있습니다. 이는 전체 스테이킹된 ETH의 약 30%에 해당하는 수치로, 탈중앙화 스테이킹 서비스에 대한 신뢰가 높아지고 있음을 보여줍니다.

        이더리움 재단은 스테이킹 참여율이 높아질수록 네트워크 보안이 강화된다고 강조하고 있습니다. 현재 전체 ETH 공급량의 약 25%가 스테이킹되어 있으며, 이는 네트워크의 장기적인 안정성에 기여하고 있습니다.

        스테이킹 보상은 네트워크 참여를 장려하는 중요한 메커니즘입니다. 검증자들이 네트워크 보안에 기여하는 대가로 ETH 보상을 받으며, 이는 이더리움 생태계의 지속 가능한 발전을 뒷받침합니다.

        기관 투자자들의 스테이킹 참여는 이더리움의 장기적인 가치 제안을 강화하고 있습니다. 안정적인 수익률과 네트워크 보안 기여라는 두 가지 이점을 동시에 제공하기 때문입니다.
      ` : `
        The Ethereum 2.0 network continues to see strong participation from validators, with staking rewards remaining attractive. Over 32 million ETH is currently staked across 1.2 million validators, with Coinbase and Lido Protocol leading institutional participation.

        Coinbase has expanded its institutional staking services to help pension funds and insurance companies easily participate in Ethereum staking. The company stated that it will "support institutional investors in earning stable returns through staking."

        Lido Protocol is currently staking over 9 million ETH, representing approximately 30% of all staked ETH. This demonstrates the growing trust in decentralized staking services.

        The Ethereum Foundation emphasizes that higher staking participation rates strengthen network security. Currently, about 25% of the total ETH supply is staked, contributing to the network's long-term stability.

        Staking rewards serve as an important mechanism to encourage network participation. Validators receive ETH rewards for contributing to network security, supporting the sustainable development of the Ethereum ecosystem.

        Institutional participation in staking strengthens Ethereum's long-term value proposition by providing both stable returns and network security contributions.
      `;
    }
    
    if (item.id === '3') {
      return language === 'ko' ? `
        탈중앙화 금융(DeFi) 프로토콜들이 기록적인 총 잠금 가치(TVL)를 달성했습니다. 수확량 농업(yield farming) 전략이 더욱 정교해지면서 DeFi 생태계가 급속히 성장하고 있습니다.

        유니스왑(Uniswap)은 최근 V4 업그레이드를 발표했습니다. 이 업그레이드는 가스비를 50% 이상 절감하고 거래 속도를 크게 향상시킬 것으로 예상됩니다. 유니스왑 팀은 "V4는 DeFi의 새로운 표준을 제시할 것"이라고 자신했습니다.

        컴파운드(Compound)는 새로운 대출 프로토콜을 출시했습니다. 이 프로토콜은 더 유연한 담보 옵션과 향상된 수익률을 제공합니다. 사용자들은 다양한 자산을 담보로 제공하여 대출을 받을 수 있습니다.

        Aave는 크로스체인 대출 기능을 추가했습니다. 이를 통해 사용자들이 이더리움, 폴리곤, 아발란체 등 다양한 블록체인에서 자산을 대출하고 차용할 수 있게 되었습니다.

        DeFi 프로토콜들의 혁신은 전통적인 금융 서비스의 대안을 제공하고 있습니다. 더 낮은 수수료, 더 빠른 처리 속도, 그리고 글로벌 접근성을 통해 금융 서비스의 민주화를 이끌고 있습니다.

        규제 기관들도 DeFi의 잠재력을 인정하기 시작했습니다. 적절한 규제 프레임워크가 마련되면 DeFi는 메인스트림 금융 시스템의 중요한 부분이 될 것으로 전망됩니다.
      ` : `
        Decentralized finance protocols have reached record total value locked as yield farming strategies become more sophisticated. The DeFi ecosystem is experiencing rapid growth with innovative protocols emerging regularly.

        Uniswap recently announced its V4 upgrade, which is expected to reduce gas fees by over 50% and significantly improve transaction speeds. The Uniswap team is confident that "V4 will set new standards for DeFi."

        Compound has launched a new lending protocol that offers more flexible collateral options and enhanced yields. Users can provide various assets as collateral to obtain loans.

        Aave has added cross-chain lending functionality, allowing users to lend and borrow assets across multiple blockchains including Ethereum, Polygon, and Avalanche.

        DeFi protocol innovations are providing alternatives to traditional financial services. Lower fees, faster processing speeds, and global accessibility are driving the democratization of financial services.

        Regulatory bodies are beginning to recognize DeFi's potential. With appropriate regulatory frameworks in place, DeFi is expected to become an important part of the mainstream financial system.
      `;
    }
    
    return item.excerpt;
  };

  const handleExternalLink = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        console.log('Cannot open URL:', url);
      }
    } catch (error) {
      console.error('Error opening URL:', error);
    }
  };

  const navigateArticle = (direction: 'prev' | 'next') => {
    if (!selectedArticle) return;
    
    const currentIndex = news.findIndex(item => item.id === selectedArticle.id);
    let newIndex;
    
    if (direction === 'prev') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : news.length - 1;
    } else {
      newIndex = currentIndex < news.length - 1 ? currentIndex + 1 : 0;
    }
    
    setSelectedArticle(news[newIndex]);
  };


  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (language === 'ko') {
      if (diffInHours < 1) return '방금 전';
      if (diffInHours < 24) return `${diffInHours}시간 전`;
      const diffInDays = Math.floor(diffInHours / 24);
      return `${diffInDays}일 전`;
    } else {
      if (diffInHours < 1) return 'Just now';
      if (diffInHours < 24) return `${diffInHours}h ago`;
      const diffInDays = Math.floor(diffInHours / 24);
      return `${diffInDays}d ago`;
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFD700" />
          <ThemedText style={styles.loadingText}>
            {language === 'ko' ? '뉴스를 불러오는 중...' : 'Loading news...'}
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <TouchableOpacity style={styles.retryButton} onPress={fetchNews}>
            <ThemedText style={styles.retryButtonText}>다시 시도</ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>
            {language === 'ko' ? `${coinSymbol} 관련 뉴스` : `${coinSymbol} Related News`}
          </ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            {language === 'ko' ? 'CoinTelegraph 최신 뉴스' : 'Latest News from CoinTelegraph'}
          </ThemedText>
        </View>
        
        {news.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.newsItem}
            onPress={() => handleNewsPress(item)}
          >
            <View style={styles.newsContent}>
              <ThemedText style={styles.newsTitle} numberOfLines={2}>
                {item.title}
              </ThemedText>
              <ThemedText style={styles.newsExcerpt} numberOfLines={3}>
                {item.excerpt}
              </ThemedText>
              <View style={styles.newsMeta}>
                <ThemedText style={styles.newsTime}>
                  {formatTimeAgo(item.publishedAt)}
                </ThemedText>
                <ThemedText style={styles.newsSource}>{item.author || 'CoinTelegraph'}</ThemedText>
              </View>
            </View>
            {item.imageUrl && (
              <Image source={{ uri: item.imageUrl }} style={styles.newsImage} />
            )}
          </TouchableOpacity>
        ))}
        
        <View style={styles.footer}>
          <ThemedText style={styles.footerText}>
            {language === 'ko' 
              ? '더 많은 뉴스는 CoinTelegraph에서 확인하세요' 
              : 'Check CoinTelegraph for more news'
            }
          </ThemedText>
        </View>
      </ScrollView>

      {/* 기사 상세보기 모달 */}
      <Modal
        visible={showArticleModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowArticleModal(false)}
      >
        <ThemedView style={styles.modalContainer}>
          {selectedArticle && (
            <>
              {/* 모달 헤더 */}
              <View style={styles.modalHeader}>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setShowArticleModal(false)}
                >
                  <ThemedText style={styles.closeButtonText}>✕</ThemedText>
                </TouchableOpacity>
                <ThemedText style={styles.modalTitle}>
                  {language === 'ko' ? '기사 보기' : 'Article View'}
                </ThemedText>
                <View style={styles.placeholder} />
              </View>

              <ScrollView style={styles.articleScrollView}>
                {/* 기사 이미지 */}
                {selectedArticle.imageUrl && (
                  <Image
                    source={{ uri: selectedArticle.imageUrl }}
                    style={styles.articleImage}
                    resizeMode="cover"
                  />
                )}

                {/* 기사 내용 */}
                <View style={styles.articleContent}>
                  <ThemedText style={styles.articleTitle}>
                    {selectedArticle.title}
                  </ThemedText>
                  
                  <View style={styles.articleMeta}>
                    <ThemedText style={styles.articleTime}>
                      {formatTimeAgo(selectedArticle.publishedAt)}
                    </ThemedText>
                    <ThemedText style={styles.articleSource}>{selectedArticle.author || 'CoinTelegraph'}</ThemedText>
                  </View>

                  {loadingFullContent ? (
                    <View style={styles.loadingContentContainer}>
                      <ActivityIndicator size="small" color="#FFD700" />
                      <ThemedText style={styles.loadingContentText}>전체 기사를 불러오는 중...</ThemedText>
                    </View>
                  ) : (
                    <ThemedText style={styles.articleFullText}>
                      {selectedArticle.fullContent || selectedArticle.excerpt}
                    </ThemedText>
                  )}
                </View>
              </ScrollView>

              {/* 하단 네비게이션 */}
                <View style={styles.articleNavigation}>
                  <TouchableOpacity 
                    style={styles.navButton} 
                    onPress={() => navigateArticle('prev')}
                  >
                    <ThemedText style={styles.navButtonText}>
                      {language === 'ko' ? '이전 기사' : 'Previous'}
                    </ThemedText>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={styles.navButton} 
                    onPress={() => setShowArticleModal(false)}
                  >
                    <ThemedText style={styles.navButtonText}>
                      {language === 'ko' ? '리스트' : 'List'}
                    </ThemedText>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={styles.navButton} 
                    onPress={() => navigateArticle('next')}
                  >
                    <ThemedText style={styles.navButtonText}>
                      {language === 'ko' ? '다음 기사' : 'Next'}
                    </ThemedText>
                  </TouchableOpacity>
                </View>
            </>
          )}
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    color: '#FFFFFF',
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingMoreContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingMoreText: {
    marginLeft: 10,
    color: '#FFFFFF',
    fontSize: 14,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#888888',
  },
  newsItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  newsContent: {
    flex: 1,
    marginRight: 12,
  },
  newsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    lineHeight: 22,
  },
  newsExcerpt: {
    fontSize: 14,
    color: '#CCCCCC',
    marginBottom: 12,
    lineHeight: 20,
  },
  newsMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  newsTime: {
    fontSize: 12,
    color: '#888888',
  },
  newsSource: {
    fontSize: 12,
    color: '#FFD700',
    fontWeight: 'bold',
  },
  newsImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#333333',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#666666',
    textAlign: 'center',
  },
  // 모달 스타일
  modalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  placeholder: {
    width: 40,
  },
  articleScrollView: {
    flex: 1,
  },
  articleImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#333333',
  },
  articleContent: {
    padding: 20,
  },
  articleTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
    lineHeight: 32,
  },
  articleMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  articleTime: {
    fontSize: 14,
    color: '#888888',
  },
  articleSource: {
    fontSize: 14,
    color: '#FFD700',
    fontWeight: 'bold',
  },
  articleExcerpt: {
    fontSize: 16,
    color: '#CCCCCC',
    lineHeight: 24,
    marginBottom: 20,
  },
  articleFullText: {
    fontSize: 16,
    color: '#CCCCCC',
    lineHeight: 24,
    marginBottom: 30,
  },
  articleNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#333333',
    backgroundColor: '#111111',
  },
  navButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 4,
    backgroundColor: '#333333',
    borderRadius: 8,
    alignItems: 'center',
  },
  navButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  loadingContentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingContentText: {
    marginLeft: 10,
    color: '#FFFFFF',
    fontSize: 14,
  },
});
