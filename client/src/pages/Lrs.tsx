import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { dateTime, StatusPill } from '../components/bits';
import type { LrRow } from '../types';
import { inr } from './LrDetail';

export function Lrs() {
  const navigate = useNavigate();
  const lrs = useQuery({
    queryKey: ['lrs'],
    queryFn: () => api<LrRow[]>('/v1/lrs'),
    refetchInterval: 10000,
  });
  return (
    <>
      <div className="page-head">
        <div>
          <h1>LRs</h1>
          <p>
            One LR per client per leg. Created as Pre-LR at planning, issued at the step set in the
            client's flow.
          </p>
        </div>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>LR number</th>
            <th>Client</th>
            <th>Vehicle</th>
            <th>Leg</th>
            <th>Issued</th>
            <th>Closed</th>
            <th>Total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {(lrs.data ?? []).map((lr) => (
            <tr key={lr.id} className="clickable" onClick={() => navigate(`/lrs/${lr.id}`)}>
              <td className="mono">{lr.number ?? <span className="faint">Pre-LR</span>}</td>
              <td>{lr.clientName}</td>
              <td>{lr.vehicleRegNo}</td>
              <td className="muted">L{lr.legSeq}</td>
              <td className="muted">{dateTime(lr.issuedAt)}</td>
              <td className="muted">{dateTime(lr.closedAt)}</td>
              <td>{lr.total === null ? '—' : inr(Number(lr.total))}</td>
              <td>
                <StatusPill status={lr.status} />
              </td>
            </tr>
          ))}
          {!lrs.isLoading && !lrs.data?.length && (
            <tr>
              <td colSpan={8} className="muted">
                No LRs yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
