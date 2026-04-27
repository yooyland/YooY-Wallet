import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@web/auth/AuthProvider';
import AppShell from '@web/components/AppShell';
import RequireAuth from '@web/components/RequireAuth';
import LoginPage from '@web/pages/LoginPage';
import HomePage from '@web/pages/HomePage';
import WalletPage from '@web/pages/WalletPage';
import SendPage from '@web/pages/SendPage';
import ReceivePage from '@web/pages/ReceivePage';
import ChatPage from '@web/pages/ChatPage';
import FriendsPage from '@web/pages/FriendsPage';
import TodoPage from '@web/pages/TodoPage';
import ProfilePage from '@web/pages/ProfilePage';
import CoinInfoPage from '@web/pages/CoinInfoPage';

export default function App() {
  return (
    <div className="yooy-web-app">
      <BrowserRouter basename="/web">
        <AuthProvider>
          <Routes>
            <Route path="login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route index element={<HomePage />} />
                <Route path="wallet" element={<WalletPage />} />
                <Route path="send" element={<SendPage />} />
                <Route path="receive" element={<ReceivePage />} />
                <Route path="chat" element={<ChatPage />} />
                <Route path="friends" element={<FriendsPage />} />
                <Route path="todo" element={<TodoPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="coin-info" element={<CoinInfoPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
