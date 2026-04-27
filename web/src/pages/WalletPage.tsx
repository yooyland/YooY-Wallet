import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@web/auth/AuthProvider';
import { subscribeInternalYoyBalance } from '@web/lib/yoyBalance';
import { getDepositAddress } from '@web/lib/webWalletLocal';
import { listRecentSends } from '@web/lib/webWalletLocal';

export default function WalletPage() {
  const { user } = useAuth();
  const [yoy, setYoy] = useState(0);
  const uid = user?.uid || '';

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeInternalYoyBalance(uid, setYoy);
    return () => unsub();
  }, [uid]);

  const deposit = uid ? getDepositAddress(uid) : '';
  const recent = uid ? listRecentSends(uid) : [];

  return (
    <div>
      <h1 className="yy-title">지갑</h1>
      <div className="yy-card">
        <div style={{ fontSize: 13, color: 'var(--yy-muted)' }}>내부 YOY 잔액 (Firestore)</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--yy-gold)', marginTop: 6 }}>{yoy.toLocaleString('ko-KR')} YOY</div>
        <p className="yy-muted" style={{ marginTop: 12 }}>
          온체인 자산·거래 내역 전체는 모바일 앱과 동일 계정으로 확인하세요. Web은 정보 표시와 송금 준비(주소 복사 등)에 초점을 둡니다.
        </p>
      </div>
      <div className="yy-card">
        <div style={{ fontWeight: 600, marginBottom: 8 }}>수신에 사용할 주소 (Web 로컬 저장)</div>
        {deposit ? (
          <code style={{ wordBreak: 'break-all', fontSize: 12 }}>{deposit}</code>
        ) : (
          <span className="yy-muted">Receive 화면에서 주소를 저장하면 여기에 표시됩니다.</span>
        )}
        <div style={{ marginTop: 14 }}>
          <Link className="yy-btn yy-btn-primary" to="receive" style={{ display: 'inline-flex', textDecoration: 'none' }}>
            Receive / QR
          </Link>
          <Link className="yy-btn" to="send" style={{ display: 'inline-flex', marginLeft: 8, textDecoration: 'none' }}>
            Send
          </Link>
        </div>
      </div>
      <div className="yy-card">
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Web에서 기록한 최근 송금 메모</div>
        {recent.length === 0 ? (
          <p className="yy-muted">항목이 없습니다. Send 화면에서 메모만 저장할 수 있습니다(온체인 전송 미실행).</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {recent.slice(0, 10).map((r, i) => (
              <li key={i} style={{ marginBottom: 8 }}>
                <span className="yy-muted">{new Date(r.at).toLocaleString('ko-KR')}</span> — {r.amount} →{' '}
                <code style={{ fontSize: 12 }}>{r.to.slice(0, 18)}…</code>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
