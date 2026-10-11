import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Screen } from '@vms/contracts';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../api';
import { dateTime, Soc, StatusPill, StepTracker, time } from '../components/bits';
import { ScreenRenderer } from '../components/ScreenRenderer';
import type { BoardLeg, BoardTrip, Master, MoveRow, TripEvent } from '../types';

export function MissionControl() {
  const board = useQuery({
    queryKey: ['board'],
    queryFn: () => api<BoardTrip[]>('/v1/trips?status=active'),
    refetchInterval: 8000,
  });
  const moves = useQuery({
    queryKey: ['moves', 'pending'],
    queryFn: () => api<MoveRow[]>('/v1/moves?status=pending'),
  });
  const [open, setOpen] = useState<{ trip: BoardTrip; leg: BoardLeg } | null>(null);

  const trips = board.data ?? [];
  const legs = trips.flatMap((t) => t.legs);
  const activeLegs = legs.filter((l) => l.status === 'active');
  const waitingManager = activeLegs.filter(
    (l) => l.steps.find((s) => s.key === l.currentStep)?.actor === 'manager',
  );
  const emptyLegs = legs.filter((l) => l.kind === 'empty').length;
  const roundTrips = trips.filter(
    (t) => t.legs.filter((l) => l.kind === 'loaded').length > 1,
  ).length;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">
            <span className="live-dot" />
            Live · refreshes every few seconds
          </span>
          <h1>Mission Control</h1>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Trucks on trips" value={trips.length} />
        <Kpi label="Active legs" value={activeLegs.length} />
        <Kpi label="Waiting on manager" value={waitingManager.length} />
        <Kpi label="Moves to plan" value={moves.data?.length ?? '—'} />
        <Kpi label="Round trips" value={roundTrips} />
        <Kpi label="Empty legs" value={emptyLegs} />
      </div>

      <Opportunities />

      {board.isLoading && <p className="muted">Loading…</p>}
      {!board.isLoading && !trips.length && (
        <div className="card muted">
          No active trips. Create moves, then plan a trip to see it here live.
        </div>
      )}

      <div className="grid">
        {trips.map((trip) => {
          const head = trip.legs.find((l) => l.status === 'active') ?? trip.legs.at(-1);
          if (!head) return null;
          return (
            <div key={trip.id} className="trip">
              <div className="trip-head">
                <span className="reg">{head.vehicle.regNo}</span>
                <Soc value={head.vehicle.soc} />
                <span className="muted">{head.driver.name}</span>
                <span className="spacer" />
                <span className="faint">
                  {trip.legs.length} leg{trip.legs.length > 1 ? 's' : ''} · started{' '}
                  {time(trip.createdAt)}
                </span>
                <Link
                  to={`/trips/${trip.id}`}
                  className="btn small green"
                  style={{ textDecoration: 'none' }}
                >
                  Live view
                </Link>
              </div>
              {trip.legs.map((leg) => (
                <LegCard key={leg.id} leg={leg} onOpen={() => setOpen({ trip, leg })} />
              ))}
            </div>
          );
        })}
      </div>

      {open && (
        <LegDrawer tripId={open.trip.id} legId={open.leg.id} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="kpi">
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}

function LegCard({ leg, onOpen }: { leg: BoardLeg; onOpen: () => void }) {
  const step = leg.steps.find((s) => s.key === leg.currentStep);
  return (
    // biome-ignore lint/a11y/useSemanticElements: the card holds block content (tracker), which a <button> cannot
    <div
      className={`leg ${leg.status === 'active' ? 'active' : ''} ${leg.status === 'completed' ? 'done' : ''}`}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      role="button"
      tabIndex={0}
    >
      <div className="leg-route">
        <span className="faint">L{leg.seq}</span>
        {leg.from.name}
        <span className="arrow">→</span>
        {leg.to.name}
        <span className="spacer" />
        {leg.kind === 'empty' ? <span className="pill gray">Empty</span> : null}
        <StatusPill status={leg.status} />
      </div>
      <div className="leg-meta">
        {leg.containers.map((c) => (
          <span key={c.number} className="mono">
            {c.number} · {c.size} · {c.client}
          </span>
        ))}
        {leg.lrs.map((lr) => (
          <span key={lr.id} className="pill gray">
            {lr.number ?? 'Pre-LR'} · {lr.client}
          </span>
        ))}
        {leg.status === 'active' && step && (
          <span className={`pill ${step.actor === 'manager' ? 'orange' : 'amber'}`}>
            {step.actor === 'manager' ? 'Manager: ' : 'Driver: '}
            {step.title}
          </span>
        )}
      </div>
      <StepTracker leg={leg} />
    </div>
  );
}

function LegDrawer({
  tripId,
  legId,
  onClose,
}: {
  tripId: string;
  legId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const trip = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => api<BoardTrip>(`/v1/trips/${tripId}`),
    refetchInterval: 8000,
  });
  const screen = useQuery({
    queryKey: ['screen', legId],
    queryFn: () => api<{ legStatus: string; screen: Screen | null }>(`/v1/legs/${legId}/screen`),
  });
  const events = useQuery({
    queryKey: ['events', tripId],
    queryFn: () => api<TripEvent[]>(`/v1/trips/${tripId}/events`),
  });
  const [onBehalf, setOnBehalf] = useState(false);

  const leg = trip.data?.legs.find((l) => l.id === legId);
  const step = leg?.steps.find((s) => s.key === leg.currentStep);
  const refresh = () =>
    Promise.all(
      ['board', 'trip', 'screen', 'events', 'tasks', 'moves', 'lrs'].map((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      ),
    );

  return (
    <>
      <button type="button" className="drawer-bg" aria-label="Close" onClick={onClose} />
      <aside className="drawer">
        <div className="row" style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: 20 }}>
            Leg {leg?.seq} · {leg?.from.name} → {leg?.to.name}
          </h2>
          <span className="spacer" />
          <button type="button" className="btn small secondary" onClick={onClose}>
            Close
          </button>
        </div>
        {leg && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="row">
              <b>{leg.vehicle.regNo}</b>
              <Soc value={leg.vehicle.soc} />
              <span className="muted">{leg.driver.name}</span>
              <span className="spacer" />
              <StatusPill status={leg.status} />
            </div>
            <p className="faint" style={{ margin: '6px 0 0', fontSize: 12.5 }}>
              Flow: {leg.flow?.name} (v{leg.flow?.version}) · odometer {leg.vehicle.odometer ?? '—'}{' '}
              km
            </p>
            <StepTracker leg={leg} />
          </div>
        )}

        {screen.data?.screen && step && (step.actor === 'manager' || onBehalf) ? (
          <ScreenRenderer
            screen={screen.data.screen}
            onAction={async (action, values) => {
              await api(`/v1/legs/${legId}/actions/${action}`, {
                method: 'POST',
                json: { values },
              });
              setOnBehalf(false);
              await refresh();
            }}
          />
        ) : screen.data?.screen ? (
          <div className="card row">
            <span>
              Waiting on driver: <b>{screen.data.screen.title}</b>
            </span>
            <span className="spacer" />
            <button type="button" className="btn small secondary" onClick={() => setOnBehalf(true)}>
              Complete on driver's behalf
            </button>
          </div>
        ) : null}

        {trip.data?.status === 'active' && leg && leg.seq === trip.data.legs.length && (
          <AddLeg tripId={tripId} fromId={leg.to.id} fromName={leg.to.name} onDone={refresh} />
        )}

        <h3 style={{ fontSize: 15, margin: '22px 0 6px' }}>Activity</h3>
        <div className="timeline">
          {(events.data ?? []).map((e) => (
            <div key={e.id} className="ev">
              <time>{dateTime(e.at)}</time>
              <span>
                <b>{e.type.replace(/[._]/g, ' ')}</b>
                {typeof e.payload?.step === 'string' && (
                  <span className="muted"> · {e.payload.step}</span>
                )}
                {typeof e.payload?.number === 'string' && (
                  <span className="muted"> · {e.payload.number}</span>
                )}
                {e.actor && <span className="faint"> · {e.actor}</span>}
              </span>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}

/** Append a leg: how a one-way trip becomes a round trip, even mid-way. */
function AddLeg({
  tripId,
  fromId,
  fromName,
  onDone,
}: {
  tripId: string;
  fromId: string;
  fromName: string;
  onDone: () => Promise<unknown>;
}) {
  const master = useQuery({ queryKey: ['master'], queryFn: () => api<Master>('/v1/master') });
  const moves = useQuery({
    queryKey: ['moves', 'pending'],
    queryFn: () => api<MoveRow[]>('/v1/moves?status=pending'),
  });
  const [toId, setToId] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const candidates = (moves.data ?? []).filter((m) => m.fromId === fromId);
  const destinations = [...new Map(candidates.map((m) => [m.toId, m.toName])).entries()];

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>Add next leg from {fromName}</h3>
      <p className="muted" style={{ margin: '0 0 12px', fontSize: 12.5 }}>
        {candidates.length
          ? `${candidates.length} pending move(s) start here — pick to make this a round trip.`
          : 'No pending moves start here. You can add an empty leg.'}
      </p>
      {error && <div className="banner error">{error}</div>}
      <div className="field">
        <label htmlFor="to">Next destination</label>
        <select
          id="to"
          className="input"
          value={toId}
          onChange={(e) => {
            setToId(e.target.value);
            setPicked([]);
          }}
        >
          <option value="">Select…</option>
          {destinations.map(([id, name]) => (
            <option key={id} value={id}>
              {name} (has cargo)
            </option>
          ))}
          {(master.data?.locations ?? [])
            .filter((l) => l.id !== fromId && !destinations.some(([id]) => id === l.id))
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} (empty run)
              </option>
            ))}
        </select>
      </div>
      {candidates
        .filter((m) => m.toId === toId)
        .map((m) => (
          <label key={m.id} className="row" style={{ marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={picked.includes(m.id)}
              onChange={(e) =>
                setPicked(e.target.checked ? [...picked, m.id] : picked.filter((x) => x !== m.id))
              }
            />
            <span className="mono">{m.containerNumber ?? 'no. pending'}</span> {m.size} ·{' '}
            {m.clientName}
          </label>
        ))}
      <button
        type="button"
        className="btn"
        disabled={!toId}
        onClick={async () => {
          setError(null);
          try {
            await api(`/v1/trips/${tripId}/legs`, {
              method: 'POST',
              json: { fromLocationId: fromId, toLocationId: toId, moveIds: picked },
            });
            setToId('');
            setPicked([]);
            await onDone();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not add the leg');
          }
        }}
      >
        {picked.length ? `Add leg with ${picked.length} container(s)` : 'Add empty leg'}
      </button>
    </div>
  );
}

interface Opportunity {
  moveId: string;
  container: string;
  vehicleId: string;
  regNo: string;
  kind: string;
  score: number;
  reasons: string[];
}

/** The system spotting round trips: a truck finishing where a container is waiting. */
function Opportunities() {
  const qc = useQueryClient();
  const opp = useQuery({
    queryKey: ['opportunities'],
    queryFn: () => api<Opportunity[]>('/v1/dispatch/opportunities'),
    refetchInterval: 20000,
  });
  const [error, setError] = useState<string | null>(null);
  if (!opp.data?.length) return null;
  return (
    <div
      className="card"
      style={{ marginBottom: 16, borderColor: '#b7cdbf', background: '#fbfdfb' }}
    >
      <div className="row" style={{ marginBottom: 8 }}>
        <span className="eyebrow">
          <span className="live-dot" />
          Suggested round trips
        </span>
      </div>
      {error && <div className="banner error">{error}</div>}
      {opp.data.map((o) => (
        <div
          key={o.moveId}
          className="row"
          style={{ padding: '6px 0', borderTop: '1px dashed var(--line)' }}
        >
          <b>{o.regNo}</b>
          <span>
            can take <span className="mono">{o.container}</span>
          </span>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {o.reasons.slice(0, 3).join(' · ')}
          </span>
          <span className="spacer" />
          <button
            type="button"
            className="btn small green"
            onClick={async () => {
              setError(null);
              try {
                await api(`/v1/dispatch/moves/${o.moveId}/accept`, {
                  method: 'POST',
                  json: { vehicleId: o.vehicleId },
                });
                await Promise.all(
                  ['board', 'opportunities', 'moves'].map((k) =>
                    qc.invalidateQueries({ queryKey: [k] }),
                  ),
                );
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Could not add the leg');
              }
            }}
          >
            Make it a round trip
          </button>
        </div>
      ))}
    </div>
  );
}
