export function isHexAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr || '');
}

export function toHex32(value: bigint): string {
  let hex = value.toString(16);
  if (hex.length % 2 !== 0) hex = '0' + hex;
  return '0'.repeat(64 - hex.length) + hex;
}

export function padAddress(addr: string): string {
  const clean = addr.replace(/^0x/, '').toLowerCase();
  return '0'.repeat(64 - clean.length) + clean;
}

export function encodeErc20Transfer(to: string, amount: bigint): string {
  // function signature keccak256("transfer(address,uint256)") -> a9059cbb
  const method = 'a9059cbb';
  const data = '0x' + method + padAddress(to) + toHex32(amount);
  return data;
}

export function parseUnits(amount: number, decimals: number): bigint {
  const [intPart, fracPart = ''] = String(amount).split('.');
  const frac = (fracPart + '0'.repeat(decimals)).slice(0, decimals);
  const normalized = `${intPart}${frac}`.replace(/^0+/, '') || '0';
  return BigInt(normalized);
}


