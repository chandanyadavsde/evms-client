import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, isStaff, useAuth } from './auth';
import { Layout } from './components/Layout';
import { Admin } from './pages/Admin';
import { Billing } from './pages/Billing';
import { Dashboard } from './pages/Dashboard';
import { DriverHome } from './pages/DriverHome';
import { Flows } from './pages/Flows';
import { Intake } from './pages/Intake';
import { LiveMap } from './pages/LiveMap';
import { LiveTrip } from './pages/LiveTrip';
import { Login } from './pages/Login';
import { LrDetail } from './pages/LrDetail';
import { LrPrint } from './pages/LrPrint';
import { Lrs } from './pages/Lrs';
import { MissionControl } from './pages/MissionControl';
import { Moves } from './pages/Moves';
import { PlanTrip } from './pages/PlanTrip';
import { PortStatus } from './pages/PortStatus';
import { Tasks } from './pages/Tasks';
import './styles.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 5000, retry: 1 } } });

function Gate({ staff, children }: { staff?: boolean; children: React.ReactNode }) {
  const { me, loading } = useAuth();
  if (loading)
    return (
      <p className="muted" style={{ padding: 24 }}>
        Loading…
      </p>
    );
  if (!me) return <Navigate to="/login" replace />;
  if (staff && !isStaff(me)) return <Navigate to="/driver" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/lrs/:id/print"
        element={
          <Gate staff>
            <LrPrint />
          </Gate>
        }
      />
      <Route
        path="/driver"
        element={
          <Gate>
            <DriverHome />
          </Gate>
        }
      />
      <Route
        element={
          <Gate staff>
            <Layout />
          </Gate>
        }
      >
        <Route index element={<MissionControl />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="map" element={<LiveMap />} />
        <Route path="trips/:id" element={<LiveTrip />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="intake" element={<Intake />} />
        <Route path="moves" element={<Moves />} />
        <Route path="port-status" element={<PortStatus />} />
        <Route path="plan" element={<PlanTrip />} />
        <Route path="lrs" element={<Lrs />} />
        <Route path="lrs/:id" element={<LrDetail />} />
        <Route path="billing" element={<Billing />} />
        <Route path="flows" element={<Flows />} />
        <Route path="admin" element={<Admin />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}
