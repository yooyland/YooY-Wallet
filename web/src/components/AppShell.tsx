import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@web/auth/AuthProvider';

const nav = [
  { to: '.', label: 'Home', end: true },
  { to: 'wallet', label: 'Wallet' },
  { to: 'send', label: 'Send' },
  { to: 'receive', label: 'Receive' },
  { to: 'chat', label: 'Chat' },
  { to: 'friends', label: 'Friends' },
  { to: 'todo', label: 'ToDo' },
  { to: 'profile', label: 'Profile' },
  { to: 'coin-info', label: 'Coin Info' },
] as const;

export default function AppShell() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="yy-shell">
      <aside className="yy-sidebar">
        <div className="yy-brand">YOOY LAND · WEB</div>
        <nav className="yy-nav">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'yy-active' : '')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="yy-sidebar-foot">
          <div className="yy-muted" style={{ marginBottom: 8 }}>
            {user?.email || user?.uid?.slice(0, 8)}
          </div>
          <button
            type="button"
            className="yy-btn"
            onClick={async () => {
              await signOut();
              navigate('/login', { replace: true });
            }}
          >
            로그아웃
          </button>
        </div>
      </aside>
      <main className="yy-main">
        <Outlet />
      </main>
    </div>
  );
}
