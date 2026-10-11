import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { dateTime, StatusPill, StepTracker, time } from '../components/bits';
import { LiveScene } from '../components/scene/LiveScene';
import { routeEstimate, STAGE_LABEL, stageOf } from '../components/scene/stage';
import type { BoardLeg, BoardTrip, TripEvent } from '../types';

/**
 * Live trip: the real trip shown as a virtual world — the actual places, the truck where its
 * workflow says it is, the evidence as it is captured. Refreshes every few seconds.
 */
export function LiveTrip() {
  const { id } = useParams();
  const trip = useQuery({
    queryKey: ['trip', id],
    queryFn: () => api<BoardTrip>(`/v1/trips/${id}`),
    refetchInterval: 4000,
  });
  const events = useQuery({
    queryKey: ['events', id],
    queryFn: () => api<TripEvent[]>(`/v1/trips/${id}/events`),
    refetchInterval: 6000,
  });
  const [legId, setLegId] = useState<string | null>(null);
  const legs = trip.data?.legs ?? [];
  const leg =
    legs.find((l) => l.id === legId) ?? legs.find((l) => l.status === 'active') ?? legs.at(-1);

  if (trip.isLoading) return <p className="muted">Loading…</p>;
  if (!trip.data || !leg) return <p className="muted">Trip not found.</p>;
  const stage = stageOf(leg);
  const [label, tone] = STAGE_LABEL[stage];

  return (
    <>
      <div className="page-head">
        <div>
          <p style={{ margin: 0 }}>
            <Link to="/">← Mission Control</Link>
          </p>
          <span className="eyebrow">
            <span className="live-dot" />
            Live · leg {leg.seq} of {legs.length} · {leg.flow?.name}
          </span>
          <h1>
            {leg.vehicle.regNo}{' '}
            <span className="muted" style={{ fontWeight: 600, fontSize: 18 }}>
              · {leg.driver.name}
            </span>
          </h1>
        </div>
        <div className="row">
          <span className={`pill ${tone}`}>{label}</span>
          <StatusPill status={trip.data.status} />
        </div>
      </div>

      {legs.length > 1 && (
        <div className="row" style={{ marginBottom: 12 }}>
          {legs.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`btn small ${l.id === leg.id ? '' : 'secondary'}`}
              onClick={() => setLegId(l.id)}
            >
              L{l.seq} · {short(l.from.name)} → {short(l.to.name)}{' '}
              {l.kind === 'empty' ? '(empty)' : ''}
            </button>
          ))}
        </div>
      )}

      <div className="scene-card">
        <LiveScene leg={leg} />
        <Hud leg={leg} />
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <StepTracker leg={leg} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 14,
          marginTop: 14,
        }}
      >
        <Checklist leg={leg} />
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>Cargo and LRs</h3>
          {!leg.containers.length && (
            <p className="muted">Empty leg — positioning or return run.</p>
          )}
          {leg.containers.map((c) => (
            <div key={c.number} className="row" style={{ marginBottom: 6 }}>
              <span className="mono">{c.number}</span> {c.size} · {c.client}
            </div>
          ))}
          <div className="row" style={{ marginTop: 6 }}>
            {leg.lrs.map((lr) => (
              <Link
                key={lr.id}
                to={`/lrs/${lr.id}`}
                className="pill gray"
                style={{ textDecoration: 'none' }}
              >
                {lr.number ?? 'Pre-LR'} · {lr.client} · {lr.status}
              </Link>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>Activity</h3>
          <div className="timeline">
            {(events.data ?? []).slice(0, 8).map((e) => (
              <div key={e.id} className="ev">
                <time>{dateTime(e.at)}</time>
                <span>
                  <b>{e.type.replace(/[._]/g, ' ')}</b>
                  {typeof e.payload?.step === 'string' && (
                    <span className="muted"> · {e.payload.step.replace(/_/g, ' ')}</span>
                  )}
                  {e.actor && <span className="faint"> · {e.actor}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

const short = (s: string) => s.split(/[,(]/)[0]?.trim() ?? s;

/** Live panel over the scene — the "HUD" from the login concept, with real numbers. */
function Hud({ leg }: { leg: BoardLeg }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const step = leg.steps.find((s) => s.key === leg.currentStep);
  const inStepMin =
    leg.stepEnteredAt && leg.status === 'active'
      ? (now - new Date(leg.stepEnteredAt).getTime()) / 60000
      : null;
  const sla = step?.slaMinutes ?? null;
  const { km, minutes } = routeEstimate(leg);
  const stage = stageOf(leg);
  const eta =
    stage === 'on_road' && minutes && leg.stepEnteredAt
      ? new Date(new Date(leg.stepEnteredAt).getTime() + minutes * 60000)
      : null;
  const soc = leg.vehicle.soc;
  const gpsAgo = leg.lastSeenAt
    ? Math.round((now - new Date(leg.lastSeenAt).getTime()) / 60000)
    : null;
  const mmss = (m: number) =>
    `${Math.floor(m)}:${String(Math.floor((m % 1) * 60)).padStart(2, '0')}`;

  return (
    <section
      className={`hud ${['unloading', 'review', 'delivered'].includes(stage) ? 'hud-left' : ''}`}
      aria-label="Live readings"
    >
      <div className="hud-head">
        <span className="hud-title">{leg.vehicle.regNo}</span>
        <span className="hud-rec">
          <i />
          LIVE
        </span>
      </div>
      <div className="hud-row">
        <span>Battery</span>
        <b>
          {soc ?? '—'}
          <small>%</small>
        </b>
      </div>
      <div className="hud-bar">
        <span
          style={{
            width: `${Math.max(0, Math.min(100, soc ?? 0))}%`,
            background: (soc ?? 100) < 25 ? 'var(--orange)' : undefined,
          }}
        />
      </div>
      <div className="hud-row">
        <span>Odometer</span>
        <b>
          {leg.vehicle.odometer?.toLocaleString('en-IN') ?? '—'}
          <small>km</small>
        </b>
      </div>
      <div className="hud-row">
        <span>Route</span>
        <b>
          {km ? km.toFixed(1) : '—'}
          <small>km</small>
        </b>
      </div>
      {inStepMin !== null && (
        <div className="hud-row">
          <span>In this step</span>
          <b style={{ color: sla && inStepMin > sla ? 'var(--red)' : undefined }}>
            {mmss(inStepMin)}
            {sla && <small> / {sla} min</small>}
          </b>
        </div>
      )}
      {eta && (
        <div className="hud-row">
          <span>ETA drop</span>
          <b>{time(eta.toISOString())}</b>
        </div>
      )}
      <div className="hud-row">
        <span>GPS</span>
        <b style={{ fontSize: 11.5 }}>
          {gpsAgo === null ? 'no phone fix' : gpsAgo < 1 ? 'live' : `${gpsAgo} min ago`}
        </b>
      </div>
      <div className="hud-sep" />
      <div className="hud-step">
        {step?.title ?? (leg.status === 'completed' ? 'Leg complete' : 'Not started')}
      </div>
      {step?.evidence.map((e) => (
        <div key={e.key} className={`check ${e.done ? 'on' : ''}`}>
          <span className="box">
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path
                d="M1.5 5.2 L4 7.5 L8.5 2.5"
                fill="none"
                stroke="#fff"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          {e.label}
        </div>
      ))}
    </section>
  );
}

/** All evidence of the leg, step by step, ticking as the driver captures it. */
function Checklist({ leg }: { leg: BoardLeg }) {
  return (
    <div className="card">
      <h3 style={{ fontSize: 15, marginBottom: 8 }}>Evidence checklist</h3>
      {leg.steps
        .filter((s) => s.evidence.length)
        .map((s) => (
          <div key={s.key} style={{ marginBottom: 8 }}>
            <div
              className="faint"
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {s.title}
            </div>
            {s.evidence.map((e) => (
              <div key={e.key} className={`check ${e.done ? 'on' : ''}`}>
                <span className="box">
                  <svg viewBox="0 0 10 10" aria-hidden="true">
                    <path
                      d="M1.5 5.2 L4 7.5 L8.5 2.5"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                {e.label}
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
