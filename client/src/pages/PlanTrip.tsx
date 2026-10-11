import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../api';
import { dateTime, Soc } from '../components/bits';
import { Suggestions } from '../components/Suggestions';
import type { BoardTrip, Master, MoveRow } from '../types';

/**
 * Manual planning (Phase 1). Every plan made here is logged as an event — the training data
 * the Phase 3 suggestion engine learns from.
 */
export function PlanTrip() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const master = useQuery({ queryKey: ['master'], queryFn: () => api<Master>('/v1/master') });
  const moves = useQuery({
    queryKey: ['moves', 'pending'],
    queryFn: () => api<MoveRow[]>('/v1/moves?status=pending'),
  });
  const board = useQuery({
    queryKey: ['board'],
    queryFn: () => api<BoardTrip[]>('/v1/trips?status=active'),
  });
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [route, setRoute] = useState('');
  const [params, setParams] = useSearchParams();
  const smartMove = params.get('move');
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const m = master.data;
  const busyVehicles = new Set(
    (board.data ?? []).flatMap((t) =>
      t.legs.filter((l) => l.status !== 'completed').map((l) => l.vehicle.id),
    ),
  );
  const busyDrivers = new Set(
    (board.data ?? []).flatMap((t) =>
      t.legs.filter((l) => l.status !== 'completed').map((l) => l.driver.id),
    ),
  );
  const vehicle = m?.vehicles.find((v) => v.id === vehicleId);

  // Pending moves grouped by route (from → to).
  const routes = new Map<
    string,
    { from: string; to: string; fromName: string; toName: string; moves: MoveRow[] }
  >();
  for (const mv of moves.data ?? []) {
    const k = `${mv.fromId}|${mv.toId}`;
    const r = routes.get(k) ?? {
      from: mv.fromId,
      to: mv.toId,
      fromName: mv.fromName,
      toName: mv.toName,
      moves: [],
    };
    r.moves.push(mv);
    routes.set(k, r);
  }
  const chosen = routes.get(route);

  // Capacity preview across every dimension the vehicle limits (server enforces the same rule).
  const usesOf = (mv: MoveRow) =>
    m?.cargoTypes.find((c) => c.code === mv.cargoTypeCode)?.uses ?? {};
  const pickedMoves = (moves.data ?? []).filter((mv) => picked.includes(mv.id));
  const capacityRows = Object.entries(vehicle?.capacity ?? {}).map(([dim, limit]) => {
    const used = pickedMoves.reduce((s, mv) => s + (usesOf(mv)[dim] ?? 0), 0);
    return { dim, used, limit };
  });
  const overCapacity = capacityRows.some((r) => r.used > r.limit);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Plan trip</h1>
          <p>
            Pick a truck, a driver and the containers for the first leg. Add more legs from Mission
            Control.
          </p>
        </div>
      </div>
      {error && <div className="banner error">{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Smart dispatch</h3>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
          Pick a container and the system ranks the trucks — including ones already heading to that
          place — with the reasons.
        </p>
        <div className="row" style={{ marginBottom: 12 }}>
          <select
            className="input"
            style={{ maxWidth: 520 }}
            value={smartMove ?? ''}
            onChange={(e) => setParams(e.target.value ? { move: e.target.value } : {})}
          >
            <option value="">Choose a pending container…</option>
            {(moves.data ?? []).map((mv) => (
              <option key={mv.id} value={mv.id}>
                {mv.containerNumber ?? 'no. pending'} · {mv.size} · {mv.clientName} · {mv.fromName}{' '}
                → {mv.toName}
                {mv.cutoffAt ? ` · cut-off ${dateTime(mv.cutoffAt)}` : ''}
              </option>
            ))}
          </select>
        </div>
        {smartMove && (
          <Suggestions
            moveId={smartMove}
            onDone={() => {
              setParams({});
              navigate('/');
            }}
          />
        )}
      </div>

      <h3 style={{ fontSize: 15, margin: '0 0 10px' }}>Or plan by hand</h3>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 14,
        }}
      >
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>1 · Truck</h3>
          <table className="table">
            <tbody>
              {(m?.vehicles ?? []).map((v) => {
                const busy = busyVehicles.has(v.id) || v.status !== 'active';
                return (
                  <tr
                    key={v.id}
                    className={busy ? '' : 'clickable'}
                    onClick={() => !busy && setVehicleId(v.id)}
                    style={{ opacity: busy ? 0.5 : 1 }}
                  >
                    <td>
                      <input type="radio" checked={vehicleId === v.id} disabled={busy} readOnly />
                    </td>
                    <td>
                      <b>{v.regNo}</b>
                      <div className="faint" style={{ fontSize: 12 }}>
                        {v.category}
                      </div>
                    </td>
                    <td>
                      <Soc value={v.soc} />
                    </td>
                    <td className="faint">{busy ? 'On trip' : 'Free'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h3 style={{ fontSize: 15, margin: '16px 0 10px' }}>2 · Driver</h3>
          <select className="input" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
            <option value="">Select driver…</option>
            {(m?.drivers ?? []).map((d) => (
              <option
                key={d.id}
                value={d.id}
                disabled={busyDrivers.has(d.id) || d.status !== 'active'}
              >
                {d.name} {busyDrivers.has(d.id) ? '(on trip)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>3 · First leg</h3>
          {!routes.size && <p className="muted">No pending moves. Create moves first.</p>}
          <div className="field">
            <label htmlFor="route">Route</label>
            <select
              id="route"
              className="input"
              value={route}
              onChange={(e) => {
                setRoute(e.target.value);
                setPicked([]);
              }}
            >
              <option value="">Select route…</option>
              {[...routes.entries()].map(([k, r]) => (
                <option key={k} value={k}>
                  {r.fromName} → {r.toName} ({r.moves.length})
                </option>
              ))}
            </select>
          </div>
          {chosen?.moves.map((mv) => (
            <label key={mv.id} className="row" style={{ marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={picked.includes(mv.id)}
                onChange={(e) =>
                  setPicked(
                    e.target.checked ? [...picked, mv.id] : picked.filter((x) => x !== mv.id),
                  )
                }
              />
              <span className="mono">{mv.containerNumber ?? 'no. pending'}</span>
              <span>{mv.size}</span>
              <span className="muted">{mv.clientName}</span>
            </label>
          ))}

          {vehicle && picked.length > 0 && (
            <div className={`banner ${overCapacity ? 'error' : 'ok'}`}>
              {capacityRows.map((r) => (
                <div key={r.dim}>
                  Capacity {r.dim}: {r.used} of {r.limit}{' '}
                  {r.used > r.limit ? '— does not fit' : r.used < r.limit ? '— room for more' : ''}
                </div>
              ))}
              <div>
                LRs to be created: {new Set(pickedMoves.map((mv) => mv.clientName)).size} (one per
                client)
              </div>
            </div>
          )}

          <button
            type="button"
            className="btn green"
            disabled={!vehicleId || !driverId || !chosen || !picked.length || overCapacity}
            onClick={async () => {
              if (!chosen) return;
              setError(null);
              try {
                await api('/v1/trips', {
                  method: 'POST',
                  json: {
                    vehicleId,
                    driverId,
                    legs: [
                      { fromLocationId: chosen.from, toLocationId: chosen.to, moveIds: picked },
                    ],
                  },
                });
                await Promise.all(
                  ['board', 'moves', 'tasks'].map((k) => qc.invalidateQueries({ queryKey: [k] })),
                );
                navigate('/');
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Could not create the trip');
              }
            }}
          >
            Dispatch trip
          </button>
        </div>
      </div>
    </>
  );
}
