import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@web/auth/AuthProvider';

export default function LoginPage() {
  const { user, loading, signInEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }} className="yy-muted">
        로딩 중…
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;

  return (
    <div style={{ maxWidth: 400, margin: '48px auto' }} className="yy-card">
      <h1 className="yy-title">YooY Land Web</h1>
      <p className="yy-muted" style={{ marginBottom: 18 }}>
        기존 Firebase 계정(이메일/비밀번호)으로 로그인합니다. Web에서는 거래·주문·스왑 기능을 제공하지 않습니다.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setErr('');
          setBusy(true);
          try {
            await signInEmail(email, password);
            navigate('/', { replace: true });
          } catch (ex: unknown) {
            setErr(String((ex as Error)?.message || ex));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="yy-muted">이메일</label>
        <input className="yy-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        <label className="yy-muted" style={{ display: 'block', marginTop: 12 }}>
          비밀번호
        </label>
        <input
          className="yy-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        {err ? (
          <p style={{ color: '#c96', marginTop: 10, fontSize: 13 }} role="alert">
            {err}
          </p>
        ) : null}
        <button type="submit" className="yy-btn yy-btn-primary" style={{ marginTop: 18, width: '100%' }} disabled={busy}>
          {busy ? '처리 중…' : '로그인'}
        </button>
      </form>
    </div>
  );
}
