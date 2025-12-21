export type ExplorerKind = 'tx' | 'block' | 'address';

export type ExplorerConfig = {
  baseUrl?: string; // if undefined → unavailable
  fallback?: keyof typeof explorers; // fallback chain key
};

// Central place to manage chain explorers
// Normalize a base URL like https://etherscan.io/address/ -> https://etherscan.io
function normalizeExplorerBase(input?: string): string | undefined {
  if (!input) return undefined;
  try {
    // strip trailing path segments like /address or /address/
    const cleaned = input.replace(/\/$/, '')
      .replace(/\/address$/i, '')
      .replace(/\/address\/$/i, '');
    const url = new URL(cleaned);
    return `${url.origin}`;
  } catch {
    return input.replace(/\/$/, '');
  }
}

const YOY_MAIN = normalizeExplorerBase(process.env.EXPO_PUBLIC_YOY_EXPLORER_BASE_MAIN || process.env.EXPO_PUBLIC_YOY_EXPLORER_BASE);
const YOY_TEST = normalizeExplorerBase(process.env.EXPO_PUBLIC_YOY_EXPLORER_BASE_TEST);

export let explorers: Record<string, ExplorerConfig> = {
  ethereum: { baseUrl: 'https://etherscan.io' },
  sepolia: { baseUrl: 'https://sepolia.etherscan.io' },
  bsc: { baseUrl: 'https://bscscan.com' },
  polygon: { baseUrl: 'https://polygonscan.com' },
  arbitrum: { baseUrl: 'https://arbiscan.io' },
  // YooyLand networks – use env if provided, fallback to public explorers
  yoy: { baseUrl: YOY_MAIN || 'https://etherscan.io' },
  'yooy-test': { baseUrl: YOY_TEST || 'https://sepolia.etherscan.io' },
};

export function resolveExplorerBase(network?: string): string | undefined {
  if (!network) return explorers.ethereum?.baseUrl; // sensible default
  const key = network.toLowerCase();
  const conf = explorers[key];
  if (!conf) return undefined;
  if (conf.baseUrl) return conf.baseUrl;
  if (conf.fallback) {
    const fb = explorers[conf.fallback];
    return fb?.baseUrl;
  }
  return undefined;
}

// Optional: hot override from remote JSON
export async function loadExplorersFromRemote(url?: string) {
  if (!url) return;
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const json = await res.json();
    if (json && typeof json === 'object') {
      explorers = { ...explorers, ...json };
    }
  } catch {}
}


