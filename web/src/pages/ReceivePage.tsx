import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '@web/auth/AuthProvider';
import { getDepositAddress, setDepositAddress } from '@web/lib/webWalletLocal';

export default function ReceivePage() {
  const { user } = useAuth();
  const uid = user?.uid || '';
  const [addr, setAddr] = useState('');
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    if (uid) setAddr(getDepositAddress(uid));
  }, [uid]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const a = addr.trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(a)) {
        setDataUrl('');
        return;
      }
      try {
        const url = await QRCode.toDataURL(a, { margin: 1, width: 220, color: { dark: '#d4af37', light: '#111111' } });
        if (!cancelled) setDataUrl(url);
      } catch {
        if (!cancelled) setDataUrl('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addr]);

  return (
    <div>
      <h1 className="yy-title">Receive · QR</h1>
      <div className="yy-card">
        <p className="yy-muted">
          모바일 앱에 저장된 지갑 주소는 이 브라우저에서 읽을 수 없습니다. <strong>Web에서 수신 QR로 사용할 EVM 주소</strong>를 직접 입력·저장하세요(이
          기기 브라우저 로컬 저장).
        </p>
        <label className="yy-muted">수신 주소</label>
        <input className="yy-input" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="0x…" />
        <button
          type="button"
          className="yy-btn yy-btn-primary"
          style={{ marginTop: 12 }}
          disabled={!uid || !/^0x[a-fA-F0-9]{40}$/i.test(addr.trim())}
          onClick={() => {
            setDepositAddress(uid, addr.trim());
          }}
        >
          이 브라우저에 저장
        </button>
        {dataUrl ? (
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <img src={dataUrl} alt="Receive QR" width={220} height={220} />
          </div>
        ) : (
          <p className="yy-muted" style={{ marginTop: 16 }}>
            유효한 0x 주소를 입력하면 QR이 표시됩니다.
          </p>
        )}
      </div>
    </div>
  );
}
