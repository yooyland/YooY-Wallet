import { useState } from 'react';
import { useAuth } from '@web/auth/AuthProvider';
import { pushRecentSend } from '@web/lib/webWalletLocal';

export default function SendPage() {
  const { user } = useAuth();
  const uid = user?.uid || '';
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [done, setDone] = useState(false);

  return (
    <div>
      <h1 className="yy-title">Send (YOY)</h1>
      <div className="yy-card">
        <p className="yy-muted">
          <strong>Web 브라우저에서는 개인키에 접근할 수 없어 온체인 전송을 실행하지 않습니다.</strong> 수신인 주소와 금액을 메모로만 저장하며, 실제 전송은
          Android/iOS 앱에서 진행해 주세요.
        </p>
        <label className="yy-muted">수신 주소 (0x…)</label>
        <input className="yy-input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" />
        <label className="yy-muted" style={{ display: 'block', marginTop: 12 }}>
          금액 (표시용)
        </label>
        <input className="yy-input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="예: 10" />
        <label className="yy-muted" style={{ display: 'block', marginTop: 12 }}>
          메모
        </label>
        <input className="yy-input" value={memo} onChange={(e) => setMemo(e.target.value)} />
        <button
          type="button"
          className="yy-btn yy-btn-primary"
          style={{ marginTop: 16 }}
          disabled={!uid || !to.trim() || !amount.trim()}
          onClick={() => {
            pushRecentSend(uid, { at: Date.now(), to: to.trim(), amount: amount.trim(), memo: memo.trim() || undefined });
            setDone(true);
            setTo('');
            setAmount('');
            setMemo('');
          }}
        >
          메모로 저장
        </button>
        {done ? <p style={{ marginTop: 12, color: 'var(--yy-gold)' }}>저장되었습니다. 지갑 화면에서 목록을 확인하세요.</p> : null}
      </div>
    </div>
  );
}
