import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { useAuth } from './context/AppContext.jsx';
import { Spinner } from './components/ui.jsx';

import Login from './pages/Login.jsx';
import { Register, Forgot, Reset } from './pages/AuthPages.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Profiles from './pages/Profiles.jsx';
import ProfileView from './pages/ProfileView.jsx';
import ProfileForm from './pages/ProfileForm.jsx';
import Shekor from './pages/Shekor.jsx';
import CallerId from './pages/CallerId.jsx';
import SearchPage from './pages/SearchPage.jsx';
import Settings from './pages/Settings.jsx';
import NotFound from './pages/NotFound.jsx';

// The admin area is code-split so regular members never download it.
const AdminShell = lazy(() => import('./pages/admin/AdminShell.jsx'));

const Center = () => <div className="flex min-h-dvh items-center justify-center text-muted"><Spinner className="h-7 w-7" /></div>;

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Center />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return children;
}
function RequireAdmin({ children }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/" replace />;
}
function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Center />;
  return user ? <Navigate to="/" replace /> : children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route path="/forgot-password" element={<PublicOnly><Forgot /></PublicOnly>} />
      <Route path="/reset-password" element={<Reset />} />

      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="profiles" element={<Profiles />} />
        <Route path="profiles/new" element={<ProfileForm />} />
        <Route path="profiles/:id" element={<ProfileView />} />
        <Route path="profiles/:id/edit" element={<ProfileForm />} />
        <Route path="shekor" element={<Shekor />} />
        <Route path="shekor/:id" element={<Shekor />} />
        <Route path="caller-id" element={<CallerId />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="settings" element={<Settings />} />
        <Route path="admin/*" element={<RequireAdmin><Suspense fallback={<Center />}><AdminShell /></Suspense></RequireAdmin>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
