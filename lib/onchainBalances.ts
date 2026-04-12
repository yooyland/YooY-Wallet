/**
 * 온체인 실제 잔액: 네이티브(ETH 등) + 레지스트리 ERC20 + 앱 설정 YOY 컨트랙트.
 */
import { ethers } from 'ethers';
import { getYoyContractAddress } from '@/lib/config';
import { Erc20Registry } from '@/lib/erc20Registry';
import { getActiveChain } from '@/src/wallet/chains';

const ERC20_MIN_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

export type YoyEthOnchain = { yoy: number; eth: number };

export type YoyOnchainTrace = {
  yoyContractAddress: string | null;
  yoyRawBalance: string;
  yoyDecimals: number;
  yoyFormattedOnchain: number;
};

function humanFromRaw(balance: bigint, decimals: number): number {
  const s = ethers.formatUnits(balance, decimals);
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function chainIdToHex(chainIdDec: number): string {
  return `0x${chainIdDec.toString(16)}`;
}

/** 활성 체인이 이더리움 L1(메인넷/세폴리아)일 때 네이티브 심볼은 ETH */
function nativeSymbolForChain(_chainIdDec: number): string {
  return 'ETH';
}

type Erc20Task = { symbol: string; address: string; decimals: number };

/**
 * 지갑 주소 기준 온체인 스냅샷: 네이티브 + 레지스트리 토큰 + YOY(설정).
 * 심볼별 하드코딩 분기 없이 레지스트리/설정만 확장하면 됨.
 */
export async function fetchOnchainAssets(walletAddress: string): Promise<Record<string, number>> {
  const raw = String(walletAddress || '').trim();
  const out: Record<string, number> = {};

  if (!/^0x[a-fA-F0-9]{40}$/i.test(raw)) {
    return out;
  }

  const checksummed = ethers.getAddress(raw);
  const active = getActiveChain();
  const provider = new ethers.JsonRpcProvider(active.rpcUrl, active.chainIdDec);
  const chainHex = chainIdToHex(active.chainIdDec).toLowerCase();

  const nativeSym = nativeSymbolForChain(active.chainIdDec);
  try {
    const wei = await provider.getBalance(checksummed);
    const nat = parseFloat(ethers.formatUnits(wei, 18));
    if (Number.isFinite(nat) && nat > 0) {
      out[nativeSym] = nat;
    }
  } catch {}

  const tasks: Erc20Task[] = [];
  const seen = new Set<string>();

  const reg = (Erc20Registry as Record<string, Record<string, { address: string; decimals: number }>>)[chainHex];
  if (reg) {
    for (const [sym, meta] of Object.entries(reg)) {
      const symbol = sym.toUpperCase().trim();
      if (!symbol || seen.has(symbol)) continue;
      seen.add(symbol);
      tasks.push({
        symbol,
        address: meta.address,
        decimals: meta.decimals,
      });
    }
  }

  try {
    const tokenAddr = await getYoyContractAddress();
    if (tokenAddr && /^0x[a-fA-F0-9]{40}$/i.test(tokenAddr)) {
      const yoySym = 'YOY';
      if (!seen.has(yoySym)) {
        seen.add(yoySym);
        tasks.push({
          symbol: yoySym,
          address: ethers.getAddress(tokenAddr),
          decimals: 18,
        });
      }
    }
  } catch {}

  await Promise.all(
    tasks.map(async t => {
      try {
        const c = new ethers.Contract(t.address, ERC20_MIN_ABI, provider);
        const bal = await c.balanceOf(checksummed);
        let decimals = t.decimals;
        try {
          const d = await c.decimals();
          const n = Number(d);
          if (Number.isFinite(n) && n >= 0 && n <= 36) decimals = n;
        } catch {
          /* use registry default */
        }
        const amt = humanFromRaw(bal, decimals);
        if (Number.isFinite(amt) && amt > 0) {
          const sym = t.symbol.toUpperCase().trim();
          out[sym] = (out[sym] || 0) + amt;
        }
      } catch {
        /* per-token 실패는 무시 */
      }
    }),
  );

  return out;
}

export async function fetchYoyEthBalancesOnchain(
  walletAddress: string,
): Promise<YoyEthOnchain & { trace: YoyOnchainTrace }> {
  const snap = await fetchOnchainAssets(walletAddress);
  const yoy = Number(snap.YOY ?? 0);
  const eth = Number(snap.ETH ?? 0);

  const emptyTrace: YoyOnchainTrace = {
    yoyContractAddress: null,
    yoyRawBalance: '0',
    yoyDecimals: 18,
    yoyFormattedOnchain: yoy,
  };

  try {
    const raw = String(walletAddress || '').trim();
    if (!/^0x[a-fA-F0-9]{40}$/i.test(raw)) {
      return { yoy, eth, trace: emptyTrace };
    }
    const checksummed = ethers.getAddress(raw);
    const active = getActiveChain();
    const provider = new ethers.JsonRpcProvider(active.rpcUrl, active.chainIdDec);
    const tokenAddr = await getYoyContractAddress();
    const yoyContractAddress =
      tokenAddr && /^0x[a-fA-F0-9]{40}$/i.test(tokenAddr) ? ethers.getAddress(tokenAddr) : null;
    if (!yoyContractAddress) {
      return { yoy, eth, trace: { ...emptyTrace, yoyFormattedOnchain: yoy } };
    }
    const c = new ethers.Contract(yoyContractAddress, ERC20_MIN_ABI, provider);
    const bal = await c.balanceOf(checksummed);
    let yoyDecimals = 18;
    try {
      const d = await c.decimals();
      const n = Number(d);
      if (Number.isFinite(n) && n >= 0 && n <= 36) yoyDecimals = n;
    } catch {}
    const yoyFormattedOnchain = humanFromRaw(bal, yoyDecimals);
    const trace: YoyOnchainTrace = {
      yoyContractAddress,
      yoyRawBalance: bal.toString(),
      yoyDecimals,
      yoyFormattedOnchain,
    };
    if (typeof __DEV__ !== 'undefined' && __DEV__) logYoyRegression(checksummed, trace, null);
    return { yoy: snap.YOY ?? yoyFormattedOnchain, eth, trace };
  } catch (e: any) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      logYoyRegression(
        walletAddress,
        { ...emptyTrace, yoyContractAddress: null },
        e,
      );
    }
    return { yoy, eth, trace: emptyTrace };
  }
}

function logYoyRegression(walletAddress: string, trace: YoyOnchainTrace, err: unknown | null) {
  try {
    console.log('[YOY_REGRESSION] walletAddress =', walletAddress);
    console.log('[YOY_REGRESSION] contract =', trace.yoyContractAddress);
    console.log('[YOY_REGRESSION] rawBalance =', trace.yoyRawBalance);
    console.log('[YOY_REGRESSION] decimals =', trace.yoyDecimals);
    console.log('[YOY_REGRESSION] formattedOnchain =', trace.yoyFormattedOnchain);
    if (err) console.log('[YOY_REGRESSION] balanceOfError =', String((err as any)?.message ?? err));
  } catch {}
}
