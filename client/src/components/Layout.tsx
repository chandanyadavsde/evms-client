import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

export function Layout() {
  const { me, signOut } = useAuth();
  const exceptions = useQuery({
    queryKey: ['exceptions'],
    queryFn: () => api<unknown[]>('/v1/exceptions'),
    refetchInterval: 15000,
  });
  const tasks = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<unknown[]>('/v1/tasks'),
    refetchInterval: 10000,
  });
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <span className="brand-dot" />
          <div>
            <b>Skeiron VMS</b>
            <small>Mission Control</small>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/" end>
            Mission Control
          </NavLink>
          <NavLink to="/tasks">
            Needs attention
            {!!((tasks.data?.length ?? 0) + (exceptions.data?.length ?? 0)) && (
              <span className="count">
                {(tasks.data?.length ?? 0) + (exceptions.data?.length ?? 0)}
              </span>
            )}
          </NavLink>
          <NavLink to="/map">Live map</NavLink>
          <NavLink to="/port-status">Port status</NavLink>
          <NavLink to="/intake">Intake</NavLink>
          <NavLink to="/moves">Moves</NavLink>
          <NavLink to="/plan">Plan trip</NavLink>
          <NavLink to="/lrs" end>
            LRs
          </NavLink>
          <NavLink to="/billing">Billing</NavLink>
          <NavLink to="/dashboard">Fleet economics</NavLink>
          <NavLink to="/flows">Flows</NavLink>
          {me?.roles.includes('admin') && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <div className="side-foot">
          <b>{me?.name}</b>
          {me?.email}
          <div>
            <button type="button" className="link-btn" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
