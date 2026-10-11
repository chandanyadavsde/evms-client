import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../api';
import { dateTime, StatusPill } from '../components/bits';
import type { Master, MoveRow } from '../types';

export function Moves() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const moves = useQuery({
    queryKey: ['moves', status],
    queryFn: () => api<MoveRow[]>(`/v1/moves${status ? `?status=${status}` : ''}`),
  });
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Moves</h1>
          <p>Each move is one container that has to go from A to B for a client.</p>
        </div>
        <div className="row">
          <select
            className="input"
            style={{ width: 170 }}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="planned">Planned</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
          </select>
          <Link className="btn secondary" to="/intake">
            Paste a message
          </Link>
          <button type="button" className="btn" onClick={() => setCreating(true)}>
            New move
          </button>
        </div>
      </div>

      {creating && (
        <NewMove
          onDone={async () => {
            setCreating(false);
            await qc.invalidateQueries({ queryKey: ['moves'] });
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      <table className="table">
        <thead>
          <tr>
            <th>Container</th>
            <th>Size</th>
            <th>Client</th>
            <th>Job</th>
            <th>From → To</th>
            <th>Port status</th>
            <th>Cut-off</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(moves.data ?? []).map((m) => (
            <tr key={m.id}>
              <td className="mono">
                {m.containerNumber ?? (
                  <span className="faint" style={{ fontFamily: 'inherit' }}>
                    pending{' '}
                    {m.status !== 'cancelled' && m.status !== 'completed' && (
                      <button
                        type="button"
                        className="btn small secondary"
                        onClick={async () => {
                          const n = window.prompt('Container number (e.g. CSQU3054383)');
                          if (!n) return;
                          try {
                            await api(`/v1/moves/${m.id}/container`, {
                              method: 'POST',
                              json: { containerNumber: n.trim().toUpperCase() },
                            });
                            await qc.invalidateQueries({ queryKey: ['moves'] });
                          } catch (err) {
                            window.alert(err instanceof ApiError ? err.message : 'Could not save');
                          }
                        }}
                      >
                        Add no.
                      </button>
                    )}
                  </span>
                )}
              </td>
              <td>{m.size}</td>
              <td>{m.clientName}</td>
              <td className="muted">{m.jobTypeName}</td>
              <td>
                {m.fromName} → {m.toName}
              </td>
              <td>
                {m.portal?.status ? (
                  <span
                    title={`Checked ${dateTime(m.portal.checkedAt)}`}
                    className={`pill ${/hold/i.test(m.portal.status) ? 'red' : /ready|clear/i.test(m.portal.status) ? 'green' : 'gray'}`}
                  >
                    {m.portal.status}
                  </span>
                ) : (
                  <span className="faint">—</span>
                )}
              </td>
              <td className="muted">{dateTime(m.cutoffAt)}</td>
              <td>
                <StatusPill status={m.status} />
              </td>
              <td>
                {m.status === 'pending' && (
                  <button
                    type="button"
                    className="btn small secondary"
                    onClick={async () => {
                      if (
                        !window.confirm(`Cancel move ${m.containerNumber ?? '(number pending)'}?`)
                      )
                        return;
                      await api(`/v1/moves/${m.id}/cancel`, { method: 'POST', json: {} });
                      await qc.invalidateQueries({ queryKey: ['moves'] });
                    }}
                  >
                    Cancel
                  </button>
                )}
              </td>
            </tr>
          ))}
          {!moves.isLoading && !moves.data?.length && (
            <tr>
              <td colSpan={9} className="muted">
                No moves yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

function NewMove({ onDone, onCancel }: { onDone: () => Promise<void>; onCancel: () => void }) {
  const master = useQuery({ queryKey: ['master'], queryFn: () => api<Master>('/v1/master') });
  const [form, setForm] = useState({
    clientId: '',
    jobTypeId: '',
    containerNumber: '',
    cargoTypeId: '',
    fromLocationId: '',
    toLocationId: '',
    cutoffAt: '',
  });
  const [error, setError] = useState<ApiError | null>(null);
  const m = master.data;
  const job = m?.jobTypes.find((j) => j.id === form.jobTypeId);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const fieldError = (f: string) => error?.fieldErrors.find((e) => e.field === f)?.message;

  return (
    <form
      className="card"
      style={{ marginBottom: 16 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await api('/v1/moves', {
            method: 'POST',
            json: {
              ...form,
              containerNumber: form.containerNumber.trim() || undefined,
              cutoffAt: form.cutoffAt ? new Date(form.cutoffAt).toISOString() : undefined,
            },
          });
          await onDone();
        } catch (err) {
          if (err instanceof ApiError) setError(err);
        }
      }}
    >
      <h3 style={{ fontSize: 16, marginBottom: 12 }}>New move</h3>
      {error && (
        <div className="banner error">
          {error.message}
          {error.status === 404 && ' — the page may be out of date; refresh it (F5) and try again.'}
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '0 14px',
        }}
      >
        <Select
          label="Client"
          value={form.clientId}
          onChange={(v) => set('clientId', v)}
          options={(m?.clients ?? []).map((c) => [c.id, c.name])}
        />
        <Select
          label="Job type"
          value={form.jobTypeId}
          onChange={(v) => {
            setForm((f) => ({ ...f, jobTypeId: v, fromLocationId: '', toLocationId: '' }));
          }}
          options={(m?.jobTypes ?? []).filter((j) => j.active).map((j) => [j.id, j.name])}
        />
        <div className="field">
          <label htmlFor="cn">
            <span>Container number (optional — can be added later)</span>
          </label>
          <input
            id="cn"
            className={`input mono ${fieldError('containerNumber') || (error && /container/i.test(error.message)) ? 'invalid' : ''}`}
            placeholder="CSQU3054383"
            value={form.containerNumber}
            onChange={(e) => set('containerNumber', e.target.value.toUpperCase())}
          />
          {(fieldError('containerNumber') || (error && /container/i.test(error.message))) && (
            <span className="err">{error?.message}</span>
          )}
        </div>
        <Select
          label="Size"
          value={form.cargoTypeId}
          onChange={(v) => set('cargoTypeId', v)}
          options={(m?.cargoTypes ?? []).map((c) => [c.id, c.name])}
        />
        <Select
          label="Pickup"
          value={form.fromLocationId}
          onChange={(v) => set('fromLocationId', v)}
          options={(m?.locations ?? [])
            .filter((l) => !job || l.type === job.fromType)
            .map((l) => [l.id, l.name])}
        />
        <Select
          label="Drop"
          value={form.toLocationId}
          onChange={(v) => set('toLocationId', v)}
          options={(m?.locations ?? [])
            .filter((l) => !job || l.type === job.toType)
            .map((l) => [l.id, l.name])}
        />
        <div className="field">
          <label htmlFor="cut">Cut-off (optional)</label>
          <input
            id="cut"
            type="datetime-local"
            className="input"
            value={form.cutoffAt}
            onChange={(e) => set('cutoffAt', e.target.value)}
          />
        </div>
      </div>
      <div className="row">
        <button className="btn green" type="submit">
          Create move
        </button>
        <button className="btn secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  const id = label.toLowerCase().replace(/\s/g, '-');
  return (
    <div className="field">
      <label htmlFor={id}>
        <span>
          {label} <span className="req">*</span>
        </span>
      </label>
      <select
        id={id}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      >
        <option value="">Select…</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
