import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Screen } from '@vms/contracts';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { dateTime, Soc, StepTracker } from '../components/bits';
import { ScreenRenderer } from '../components/ScreenRenderer';
import type { BoardLeg, ExceptionRow } from '../types';

interface Task {
  tripId: string;
  task: string;
  leg: BoardLeg;
}

const SEVERITY: Record<string, string> = { critical: 'red', warning: 'amber', info: 'gray' };

/**
 * "Manager by exception": problems the system detected (with a proposed action) and steps that
 * need a person. Everything else runs without the manager.
 */
export function Tasks() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const tasks = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<Task[]>('/v1/tasks'),
    refetchInterval: 8000,
  });
  const exceptions = useQuery({
    queryKey: ['exceptions'],
    queryFn: () => api<ExceptionRow[]>('/v1/exceptions'),
    refetchInterval: 15000,
  });
  const refresh = () =>
    Promise.all(
      ['exceptions', 'tasks', 'board'].map((k) => qc.invalidateQueries({ queryKey: [k] })),
    );

  async function close(id: string, outcome: 'resolve' | 'dismiss') {
    await api(`/v1/exceptions/${id}/${outcome}`, { method: 'POST', json: {} });
    await refresh();
  }

  function act(e: ExceptionRow) {
    const p = e.proposal;
    if (p.action === 'call_driver' && typeof p.phone === 'string')
      window.location.href = `tel:${p.phone}`;
    else if (p.action === 'plan_trip') navigate(`/plan?move=${p.moveId ?? ''}`);
    else if (p.action === 'renew_document') navigate('/admin?tab=documents');
    else navigate('/');
  }

  const nothing =
    !tasks.isLoading && !exceptions.isLoading && !tasks.data?.length && !exceptions.data?.length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Needs attention</h1>
          <p>
            Problems the system spotted, and steps waiting on a manager. Everything else runs on its
            own.
          </p>
        </div>
        <button
          type="button"
          className="btn secondary small"
          onClick={async () => {
            await api('/v1/exceptions/run', { method: 'POST', json: {} });
            await refresh();
          }}
        >
          Check now
        </button>
      </div>
      {nothing && <div className="card muted">Nothing needs you right now.</div>}

      {!!exceptions.data?.length && (
        <div className="grid" style={{ marginBottom: 18 }}>
          {exceptions.data.map((e) => (
            <div key={e.id} className="card row">
              <span className={`pill ${SEVERITY[e.severity]}`}>{e.severity}</span>
              <div style={{ flex: 1, minWidth: 240 }}>
                <b>{e.message}</b>
                <div className="faint" style={{ fontSize: 12 }}>
                  {e.type.replace(/_/g, ' ')} · since {dateTime(e.created_at)}
                </div>
              </div>
              {typeof e.proposal.label === 'string' && (
                <button type="button" className="btn small green" onClick={() => act(e)}>
                  {e.proposal.label}
                </button>
              )}
              <button
                type="button"
                className="btn small secondary"
                onClick={() => close(e.id, 'resolve')}
              >
                Done
              </button>
              <button
                type="button"
                className="btn small secondary"
                onClick={() => close(e.id, 'dismiss')}
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid">
        {(tasks.data ?? []).map((t) => (
          <TaskCard key={t.leg.id} t={t} />
        ))}
      </div>
    </>
  );
}

function TaskCard({ t }: { t: Task }) {
  const qc = useQueryClient();
  const screen = useQuery({
    queryKey: ['screen', t.leg.id],
    queryFn: () => api<{ screen: Screen | null }>(`/v1/legs/${t.leg.id}/screen`),
  });
  return (
    <div className="trip">
      <div className="trip-head">
        <span className="reg">{t.leg.vehicle.regNo}</span>
        <Soc value={t.leg.vehicle.soc} />
        <span className="muted">
          {t.leg.from.name} → {t.leg.to.name}
        </span>
        <span className="spacer" />
        <span className="pill orange">{t.task}</span>
      </div>
      <div className="leg-meta" style={{ marginBottom: 10 }}>
        {t.leg.containers.map((c) => (
          <span key={c.number} className="mono">
            {c.number} · {c.size} · {c.client}
          </span>
        ))}
        {t.leg.lrs.map((lr) => (
          <span key={lr.id} className="pill gray">
            {lr.number ?? 'Pre-LR'}
          </span>
        ))}
      </div>
      <StepTracker leg={t.leg} />
      <div style={{ marginTop: 12 }}>
        {screen.data?.screen && (
          <ScreenRenderer
            screen={screen.data.screen}
            onAction={async (action, values) => {
              await api(`/v1/legs/${t.leg.id}/actions/${action}`, {
                method: 'POST',
                json: { values },
              });
              await Promise.all(
                ['tasks', 'board', 'lrs', 'screen'].map((k) =>
                  qc.invalidateQueries({ queryKey: [k] }),
                ),
              );
            }}
          />
        )}
      </div>
    </div>
  );
}
