import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PageProvider } from './context/PageContext';
import { NotificationProvider } from './context/NotificationContext';
import { Layout } from './components/Layout/Layout';

// Pages
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { Inbox } from './pages/Inbox';
import { Messenger } from './pages/Messenger';
import { Comments } from './pages/Comments';
import { Posts } from './pages/Posts';
import { Customers } from './pages/Customers';
import { Ads } from './pages/Ads';
import { Analytics } from './pages/Analytics';
import { Staff } from './pages/Staff';
import { Settings } from './pages/Settings';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500">Đang khởi tạo ZEN CRM...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PageProvider>
          <NotificationProvider>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* Protected App Routes */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="inbox" element={<Inbox />} />
                <Route path="messenger" element={<Messenger />} />
                <Route path="comments" element={<Comments />} />
                <Route path="posts" element={<Posts />} />
                <Route path="customers" element={<Customers />} />
                <Route path="ads" element={<Ads />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="staff" element={<Staff />} />
                <Route path="settings" element={<Settings />} />
              </Route>

              {/* Catch-all redirect */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </NotificationProvider>
        </PageProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
