import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, api } from '../api';
import { time } from './bits';

export interface Suggestion {
  vehicleId: string;
  regNo: string;
  driverName: string | null;
  action: 'append_leg' | 'new_trip';
  kind: 'round_trip' | 'diversion' | 'new_trip';
  score: number;
  emptyKm: number;
  pickupAt: string;
  dropAt: string;
  socAfterPct: number | null;
  reasons: string[];
}

const KIND: Record<Suggestion['kind'], [string, string]> = {
  round_trip: ['Round trip', 'green'],
  diversion: ['Diversion', 'green'],
  new_trip: ['New trip', 'gray'],
};

/** Ranked trucks for one move, each with its reasons. The manager decides (autonomy L1/L2). */
export function Suggestions({ moveId, onDone }: { moveId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['suggestions', moveId],
    queryFn: () =>
      api<{ suggestions: Suggestion[]; rejected: { regNo: string; reason: string }[] }>(
        `/v1/dispatch/moves/${moveId}/suggestions`,
      ),
  });
  const [error, setError] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);

  if (q.isLoading) return <p className="muted">Working out the best trucks…</p>;
  if (q.error) return <div className="banner error">{(q.error as Error).message}</div>;
  const data = q.data;
  if (!data) return null;

  return (
    <div>
      {error && <div className="banner error">{error}</div>}
      {!data.suggestions.length && (
        <div className="banner warn">No truck can take this right now — see why below.</div>
      )}
      <div className="grid">
        {data.suggestions.map((s, i) => (
          <div
            key={s.vehicleId}
            className="card"
            style={{ borderColor: i === 0 ? '#b7cdbf' : undefined }}
          >
            <div className="row">
              <span className="pill orange">#{i + 1}</span>
              <b>{s.regNo}</b>
              <span className="muted">{s.driverName ?? 'no driver'}</span>
              <span className={`pill ${KIND[s.kind][1]}`}>{KIND[s.kind][0]}</span>
              <span className="spacer" />
              <span className="faint" style={{ fontSize: 12 }}>
                score {s.score} · pickup {time(s.pickupAt)} · drop {time(s.dropAt)}
              </span>
              <button
                type="button"
                className="btn small green"
                onClick={async () => {
                  setError(null);
                  try {
                    await api(`/v1/dispatch/moves/${moveId}/accept`, {
                      method: 'POST',
                      json: { vehicleId: s.vehicleId },
                    });
                    await Promise.all(
                      ['board', 'moves', 'opportunities', 'tasks'].map((k) =>
                        qc.invalidateQueries({ queryKey: [k] }),
                      ),
                    );
                    onDone();
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : 'Could not dispatch');
                  }
                }}
              >
                {s.action === 'append_leg' ? 'Add to its trip' : 'Dispatch'}
              </button>
            </div>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--ink-2)' }}>
              {s.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {!!data.rejected.length && (
        <p style={{ marginTop: 10 }}>
          <button type="button" className="link-btn" onClick={() => setShowRejected(!showRejected)}>
            {showRejected ? 'Hide' : 'Show'} {data.rejected.length} truck(s) that can't take it
          </button>
        </p>
      )}
      {showRejected && (
        <table className="table">
          <tbody>
            {data.rejected.map((r) => (
              <tr key={r.regNo}>
                <td>
                  <b>{r.regNo}</b>
                </td>
                <td className="muted">{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
