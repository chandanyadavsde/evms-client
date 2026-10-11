import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, api } from '../api';
import { AddForm, Input, useMaster } from './Admin';

/**
 * Phase 1 masters: each port's portal address and group codes, which trip types are in use, and
 * supervisors with the ports and CFSs they work on.
 */

interface PortRow {
  id: string;
  code: string;
  name: string;
  portal: { urls: string[] };
  groupCodes: { id: string; code: string; clientId: string; clientName: string }[];
}
type Draft = { url: string; code: string; clientId: string };

/** Per port: the portal address (ties plugin copies to the port) and its group codes → client. */
export function PortSettings() {
  const qc = useQueryClient();
  const master = useMaster();
  const ports = useQuery({
    queryKey: ['admin-ports'],
    queryFn: () => api<PortRow[]>('/v1/admin/ports'),
  });
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const draft = (id: string): Draft => drafts[id] ?? { url: '', code: '', clientId: '' };
  const setDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...draft(id), ...patch } }));
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['admin-ports'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save');
    }
  };

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>Port portals and group codes</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        The portal address ties a plugin copy to its port. Group codes belong to the port: ULA on
        one port can be a different client on another.
      </p>
      {error && <div className="banner error">{error}</div>}
      <table className="table">
        <thead>
          <tr>
            <th>Port</th>
            <th>Portal address</th>
            <th>Group codes</th>
          </tr>
        </thead>
        <tbody>
          {(ports.data ?? []).map((p) => (
            <tr key={p.id}>
              <td>
                <b>{p.name}</b>
                <div className="muted mono">{p.code}</div>
              </td>
              <td>
                {p.portal.urls.map((u) => (
                  <div key={u} className="row" style={{ gap: 6, margin: '2px 0' }}>
                    <span className="mono">{u}</span>
                    <button
                      type="button"
                      className="btn small secondary"
                      title="Remove"
                      onClick={() =>
                        run(() =>
                          api(`/v1/admin/ports/${p.id}/portal`, {
                            method: 'PUT',
                            json: { urls: p.portal.urls.filter((x) => x !== u) },
                          }),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <form
                  className="row"
                  style={{ gap: 6, flexWrap: 'nowrap' }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!draft(p.id).url.trim()) return;
                    void run(async () => {
                      await api(`/v1/admin/ports/${p.id}/portal`, {
                        method: 'PUT',
                        json: { urls: [...p.portal.urls, draft(p.id).url] },
                      });
                      setDraft(p.id, { url: '' });
                    });
                  }}
                >
                  <input
                    className="input"
                    style={{ height: 32, minWidth: 220 }}
                    placeholder="e.g. portal.example.com/page"
                    aria-label={`Portal address for ${p.name}`}
                    value={draft(p.id).url}
                    onChange={(e) => setDraft(p.id, { url: e.target.value })}
                  />
                  <button type="submit" className="btn small">
                    Add
                  </button>
                </form>
              </td>
              <td>
                {p.groupCodes.map((g) => (
                  <div key={g.id} className="row" style={{ gap: 6, margin: '2px 0' }}>
                    <span className="mono">{g.code}</span> → {g.clientName}
                    <button
                      type="button"
                      className="btn small secondary"
                      title="Remove"
                      onClick={() =>
                        run(() =>
                          api(`/v1/admin/ports/${p.id}/group-codes/${g.id}`, { method: 'DELETE' }),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <form
                  className="row"
                  style={{ gap: 6, flexWrap: 'nowrap' }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const d = draft(p.id);
                    if (!d.code.trim() || !d.clientId) return;
                    void run(async () => {
                      await api(`/v1/admin/ports/${p.id}/group-codes`, {
                        method: 'POST',
                        json: { code: d.code, clientId: d.clientId },
                      });
                      setDraft(p.id, { code: '', clientId: '' });
                    });
                  }}
                >
                  <input
                    className="input mono"
                    style={{ height: 32, width: 80 }}
                    placeholder="Code"
                    aria-label={`Group code for ${p.name}`}
                    value={draft(p.id).code}
                    onChange={(e) => setDraft(p.id, { code: e.target.value.toUpperCase() })}
                  />
                  <select
                    className="input"
                    style={{ height: 32, minWidth: 140 }}
                    aria-label="Client"
                    value={draft(p.id).clientId}
                    onChange={(e) => setDraft(p.id, { clientId: e.target.value })}
                  >
                    <option value="">Client…</option>
                    {(master.data?.clients ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn small">
                    Add
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface TripType {
  id: string;
  code: string;
  name: string;
  active: boolean;
  fromType: string;
  toType: string;
}

export function TripTypes() {
  const qc = useQueryClient();
  const types = useQuery({
    queryKey: ['trip-types'],
    queryFn: () => api<TripType[]>('/v1/admin/trip-types'),
  });
  return (
    <>
      <p className="muted">Only switched-on trip types can be chosen when planning.</p>
      <table className="table">
        <thead>
          <tr>
            <th>Trip type</th>
            <th>From → To</th>
            <th>In use</th>
          </tr>
        </thead>
        <tbody>
          {(types.data ?? []).map((t) => (
            <tr key={t.id}>
              <td>
                <b>{t.name}</b>
                <div className="muted mono">{t.code}</div>
              </td>
              <td>
                {t.fromType} → {t.toType}
              </td>
              <td>
                <label className="row" style={{ gap: 8, margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={t.active}
                    onChange={async (e) => {
                      await api(`/v1/admin/trip-types/${t.id}`, {
                        method: 'PATCH',
                        json: { active: e.target.checked },
                      });
                      await qc.invalidateQueries({ queryKey: ['trip-types'] });
                      await qc.invalidateQueries({ queryKey: ['master'] });
                    }}
                  />
                  {t.active ? 'On' : 'Off'}
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

interface StaffUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  role: string;
  places: { id: string; name: string; type: string }[];
}

/** Supervisors and the ports / CFSs they work on (none assigned = all). */
export function Supervisors() {
  const qc = useQueryClient();
  const master = useMaster();
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api<StaffUser[]>('/v1/admin/users'),
  });
  const [f, setF] = useState({ name: '', email: '', phone: '', role: 'manager' });
  const [editing, setEditing] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const places = (master.data?.locations ?? []).filter(
    (l) => l.type === 'PORT_TERMINAL' || l.type === 'CFS',
  );
  const save = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save');
    }
  };

  return (
    <>
      <AddForm
        title="Add supervisor"
        onSubmit={async () => {
          await api('/v1/admin/users', {
            method: 'POST',
            json: {
              name: f.name,
              email: f.email,
              role: f.role,
              ...(f.phone ? { phone: f.phone } : {}),
            },
          });
          setF({ name: '', email: '', phone: '', role: 'manager' });
          await qc.invalidateQueries({ queryKey: ['admin-users'] });
        }}
      >
        <Input label="Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} required />
        <Input
          label="Work email (sign-in)"
          value={f.email}
          onChange={(v) => setF({ ...f, email: v })}
          type="email"
          required
        />
        <Input
          label="Mobile (optional)"
          value={f.phone}
          onChange={(v) => setF({ ...f, phone: v.replace(/\D/g, '').slice(0, 10) })}
          inputMode="numeric"
        />
        <div className="field">
          <label htmlFor="urole">Role</label>
          <select
            id="urole"
            className="input"
            value={f.role}
            onChange={(e) => setF({ ...f, role: e.target.value })}
          >
            <option value="manager">Supervisor</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </AddForm>
      {error && <div className="banner error">{error}</div>}
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Sign-in</th>
            <th>Role</th>
            <th>Ports and CFSs</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          {(users.data ?? []).map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td className="muted">{u.email ?? u.phone}</td>
              <td>{u.role === 'admin' ? 'Admin' : 'Supervisor'}</td>
              <td>
                {u.role === 'admin' ? (
                  <span className="muted">All (admin)</span>
                ) : editing === u.id ? (
                  <div>
                    {places.map((p) => (
                      <label key={p.id} className="row" style={{ gap: 6, margin: '2px 0' }}>
                        <input
                          type="checkbox"
                          checked={picked.includes(p.id)}
                          onChange={(e) =>
                            setPicked((cur) =>
                              e.target.checked ? [...cur, p.id] : cur.filter((x) => x !== p.id),
                            )
                          }
                        />
                        {p.name}{' '}
                        <span className="muted">({p.type === 'CFS' ? 'CFS' : 'Port'})</span>
                      </label>
                    ))}
                    <div className="row" style={{ gap: 6 }}>
                      <button
                        type="button"
                        className="btn small green"
                        onClick={() =>
                          save(async () => {
                            await api(`/v1/admin/users/${u.id}/places`, {
                              method: 'PUT',
                              json: { locationIds: picked },
                            });
                            setEditing(null);
                          })
                        }
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn small secondary"
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <span>
                    {u.places.length ? (
                      u.places.map((p) => p.name).join(', ')
                    ) : (
                      <span className="muted">All (none assigned)</span>
                    )}{' '}
                    <button
                      type="button"
                      className="btn small secondary"
                      onClick={() => {
                        setPicked(u.places.map((p) => p.id));
                        setEditing(u.id);
                      }}
                    >
                      Assign
                    </button>
                  </span>
                )}
              </td>
              <td>
                <input
                  type="checkbox"
                  aria-label={`${u.name} active`}
                  checked={u.active}
                  onChange={(e) =>
                    save(() =>
                      api(`/v1/admin/users/${u.id}`, {
                        method: 'PATCH',
                        json: { active: e.target.checked },
                      }),
                    )
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
