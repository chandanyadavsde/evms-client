import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { inr } from './LrDetail';

interface Fleet {
  days: number;
  totalKm: number;
  emptyKm: number;
  emptyKmPct: number | null;
  completedTrips: number;
  roundTripPct: number | null;
  trucks: { regNo: string; trips: number; km: number; revenue: number; lrs: number }[];
  turnaround: { name: string; minutes: number; n: number }[];
  shadow: {
    decisions: number;
    topPickRate: number | null;
    top3Rate: number | null;
    notSuggested: number;
  };
}

/**
 * Fleet economics. Stat tiles for the headline numbers; one single-colour bar list per measure
 * (different units never share an axis). Values are printed beside every bar, so the list doubles
 * as the table view.
 */
export function Dashboard() {
  const [days, setDays] = useState(7);
  const q = useQuery({
    queryKey: ['dashboard', days],
    queryFn: () => api<Fleet>(`/v1/dashboard/fleet?days=${days}`),
    refetchInterval: 60000,
  });
  const d = q.data;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Fleet economics</h1>
          <p>
            How efficiently the fleet runs — and how often the system's suggestions match the
            manager's choices.
          </p>
        </div>
        <fieldset
          className="row"
          aria-label="Time range"
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          {[1, 7, 30].map((n) => (
            <button
              key={n}
              type="button"
              className={`btn small ${days === n ? '' : 'secondary'}`}
              onClick={() => setDays(n)}
            >
              {n === 1 ? 'Today' : `${n} days`}
            </button>
          ))}
        </fieldset>
      </div>
      {!d ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="kpis">
            <Tile
              label="Empty km"
              value={d.emptyKmPct === null ? '—' : `${d.emptyKmPct}%`}
              note={`${d.emptyKm} of ${d.totalKm} km ran empty`}
              lowerIsBetter
            />
            <Tile
              label="Round trips"
              value={d.roundTripPct === null ? '—' : `${d.roundTripPct}%`}
              note="of trips carried cargo both ways"
            />
            <Tile
              label="Completed trips"
              value={String(d.completedTrips)}
              note={`last ${d.days === 1 ? 'day' : `${d.days} days`}`}
            />
            <Tile
              label="Top suggestion taken"
              value={d.shadow.topPickRate === null ? '—' : `${d.shadow.topPickRate}%`}
              note={
                d.shadow.decisions
                  ? `${d.shadow.decisions} decisions · in top 3: ${d.shadow.top3Rate}%`
                  : 'no decisions yet'
              }
            />
          </div>
          {!d.trucks.length && (
            <div className="card muted">No completed trips in this period yet.</div>
          )}
          {!!d.trucks.length && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 14,
                marginBottom: 14,
              }}
            >
              <BarList
                title="Trips per truck"
                rows={d.trucks.map((t) => ({
                  label: t.regNo,
                  value: t.trips,
                  text: String(t.trips),
                }))}
              />
              <BarList
                title="Kilometres per truck"
                rows={d.trucks.map((t) => ({ label: t.regNo, value: t.km, text: `${t.km} km` }))}
              />
              <BarList
                title="Billed per truck (LR totals)"
                rows={d.trucks.map((t) => ({
                  label: t.regNo,
                  value: t.revenue,
                  text: inr(t.revenue),
                }))}
              />
            </div>
          )}
          {!!d.turnaround.length && (
            <BarList
              title="Average port turnaround (gate-in → gate-out)"
              rows={d.turnaround.map((t) => ({
                label: t.name,
                value: t.minutes,
                text: `${t.minutes} min · ${t.n} visit${t.n > 1 ? 's' : ''}`,
              }))}
            />
          )}
        </>
      )}
    </>
  );
}

function Tile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
  lowerIsBetter?: boolean;
}) {
  return (
    <div className="kpi">
      <small>{label}</small>
      <b>{value}</b>
      <div className="faint" style={{ fontSize: 12 }}>
        {note}
      </div>
    </div>
  );
}

/** Horizontal bars, one colour, sorted largest first, value printed at the end of each bar. */
function BarList({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number; text: string }[];
}) {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...sorted.map((r) => r.value));
  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 12 }}>{title}</h3>
      <ul className="barlist">
        {sorted.map((r) => (
          <li key={r.label} className="barrow" title={`${r.label}: ${r.text}`}>
            <span className="barlabel">{r.label}</span>
            <span className="bartrack">
              <span
                className="barfill"
                style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
              />
            </span>
            <span className="barvalue">{r.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
