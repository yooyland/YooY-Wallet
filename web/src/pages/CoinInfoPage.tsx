import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@web/auth/AuthProvider';
import { ETHERSCAN_TOKEN_URL, YOY_TOKEN } from '@web/config/yoyToken';
import { fetchYoyUsdPrice } from '@web/lib/coinGecko';
import { subscribeInternalYoyBalance } from '@web/lib/yoyBalance';
import { getDepositAddress } from '@web/lib/webWalletLocal';

export default function CoinInfoPage() {
  const { user } = useAuth();
  const uid = user?.uid || '';
  const [yoy, setYoy] = useState(0);
  const [usd, setUsd] = useState<number | null>(null);

  useEffect(() => {
    if (!uid) return;
    return subscribeInternalYoyBalance(uid, setYoy);
  }, [uid]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const p = await fetchYoyUsdPrice();
      if (alive) setUsd(p);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const onchainAddr = uid ? getDepositAddress(uid) : '';

  return (
    <div>
      <h1 className="yy-title">코인 정보 (YOY)</h1>
      <div className="yy-card" style={{ maxWidth: 640 }}>
        <p className="yy-muted">정보 제공 전용 화면입니다. 투자·매매를 권유하지 않습니다.</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
          <tbody>
            <tr>
              <td className="yy-muted" style={{ padding: '6px 0' }}>
                토큰명
              </td>
              <td>{YOY_TOKEN.name}</td>
            </tr>
            <tr>
              <td className="yy-muted">심볼</td>
              <td>{YOY_TOKEN.symbol}</td>
            </tr>
            <tr>
              <td className="yy-muted">체인</td>
              <td>{YOY_TOKEN.chain}</td>
            </tr>
            <tr>
              <td className="yy-muted">컨트랙트</td>
              <td>
                <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{YOY_TOKEN.address}</code>
              </td>
            </tr>
            <tr>
              <td className="yy-muted">총 발행량(메타)</td>
              <td>{YOY_TOKEN.initialSupply}</td>
            </tr>
            <tr>
              <td className="yy-muted">소수 자릿수</td>
              <td>{YOY_TOKEN.decimals}</td>
            </tr>
            <tr>
              <td className="yy-muted">내부 원장 잔액</td>
              <td>{yoy.toLocaleString('ko-KR')} YOY</td>
            </tr>
            {onchainAddr ? (
              <tr>
                <td className="yy-muted">Web 저장 수신 주소</td>
                <td>
                  <code style={{ fontSize: 11, wordBreak: 'break-all' }}>{onchainAddr}</code>
                  <div className="yy-muted" style={{ fontSize: 12, marginTop: 6 }}>
                    온체인 보유량 조회는 이 주소의 블록 탐색기·지갑 앱에서 확인하세요.
                  </div>
                </td>
              </tr>
            ) : null}
            <tr>
              <td className="yy-muted">참고 USD (Coingecko)</td>
              <td>{usd != null ? `약 $${usd.toFixed(6)}` : '조회 실패 또는 미상장'}</td>
            </tr>
          </tbody>
        </table>
        <p style={{ marginTop: 18 }}>
          <a className="yy-link" href={ETHERSCAN_TOKEN_URL} target="_blank" rel="noreferrer">
            External market information (Etherscan)
          </a>
        </p>
        <p style={{ marginTop: 12 }}>
          <Link className="yy-link" to="/">
            홈으로
          </Link>
        </p>
      </div>
    </div>
  );
}
