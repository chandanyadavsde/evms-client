import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api, fileUrl } from '../api';
import { dateTime, StatusPill } from '../components/bits';

export interface Charge {
  code: string;
  label: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  basis: string;
  adjustedBy?: string;
}

export interface LrFull {
  id: string;
  number: string | null;
  status: string;
  charges: Charge[];
  total: number | null;
  custom: { unpriced?: string[]; pricingError?: string | null };
  createdAt: string;
  issuedAt: string | null;
  closedAt: string | null;
  approvedAt: string | null;
  pushedAt: string | null;
  netsuiteRef: string | null;
  tripId: string;
  clientName: string;
  clientGstin: string | null;
  companyName: string;
  vehicleRegNo: string;
  driverName: string;
  fromName: string;
  toName: string;
  rateCardKey: string | null;
  rateCardVersion: number | null;
  containers: { number: string; size: string; state: string }[];
  evidence: {
    step_key: string;
    field_key: string;
    kind: string;
    doc_type: string | null;
    file_key: string | null;
    value: unknown;
    captured_at: string;
    ai_result: { status: string; issues?: string[]; result?: { detectedAs: string } } | null;
  }[];
  outbox: {
    status: string;
    attempts: number;
    lastError: string | null;
    externalRef: string | null;
  } | null;
}

export const inr = (n: number | null | undefined) =>
  n === null || n === undefined
    ? '—'
    : n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

export function LrDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const lr = useQuery({ queryKey: ['lr', id], queryFn: () => api<LrFull>(`/v1/lrs/${id}`) });
  const [lines, setLines] = useState<Charge[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (lr.data) setLines(lr.data.charges);
  }, [lr.data]);
  const d = lr.data;
  if (!d) return <p className="muted">Loading…</p>;
  const editable = d.status === 'closed';
  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const changed = JSON.stringify(lines) !== JSON.stringify(d.charges);

  return (
    <>
      <div className="page-head">
        <div>
          <p style={{ margin: 0 }}>
            <Link to="/lrs">← LRs</Link>
          </p>
          <h1 className="mono" style={{ fontSize: 24 }}>
            {d.number ?? 'Pre-LR'}
          </h1>
          <p>
            {d.clientName} · {d.fromName} → {d.toName} · {d.vehicleRegNo} · {d.driverName}
          </p>
        </div>
        <div className="row">
          <StatusPill status={d.status} />
          {d.number && (
            <Link className="btn secondary small" to={`/lrs/${d.id}/print`} target="_blank">
              Print / PDF
            </Link>
          )}
        </div>
      </div>

      {error && <div className="banner error">{error}</div>}
      {!!d.custom.unpriced?.length && (
        <div className="banner warn">
          No rate for {d.custom.unpriced.join(', ')} — add a charge line or update the rate card.
        </div>
      )}
      {d.custom.pricingError && <div className="banner warn">{d.custom.pricingError}</div>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: 14,
        }}
      >
        <div className="card">
          <div className="row" style={{ marginBottom: 10 }}>
            <h3 style={{ fontSize: 15 }}>Charges</h3>
            <span className="spacer" />
            <span className="faint" style={{ fontSize: 12 }}>
              {d.rateCardKey
                ? `Rate card ${d.rateCardKey} v${d.rateCardVersion}`
                : 'Not priced yet'}
            </span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: charge lines have no id
                <tr key={i}>
                  <td>
                    {l.label}
                    <div className="faint" style={{ fontSize: 11.5 }}>
                      {l.basis}
                      {l.adjustedBy ? ' · adjusted' : ''}
                    </div>
                  </td>
                  <td>
                    {l.quantity} {l.unit}
                  </td>
                  <td>{inr(l.rate)}</td>
                  <td style={{ width: 130 }}>
                    {editable ? (
                      <input
                        className="input"
                        style={{ height: 34 }}
                        inputMode="decimal"
                        value={l.amount}
                        onChange={(e) =>
                          setLines(
                            lines.map((x, j) =>
                              j === i ? { ...x, amount: Number(e.target.value) || 0 } : x,
                            ),
                          )
                        }
                      />
                    ) : (
                      inr(l.amount)
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={3}>
                  <b>Total</b> <span className="faint">(GST added in NetSuite)</span>
                </td>
                <td>
                  <b>{inr(editable ? total : d.total)}</b>
                </td>
              </tr>
            </tbody>
          </table>
          {editable && (
            <div className="row" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn secondary small"
                onClick={() =>
                  setLines([
                    ...lines,
                    {
                      code: 'other',
                      label: 'Other charge',
                      quantity: 1,
                      unit: 'each',
                      rate: 0,
                      amount: 0,
                      basis: 'added manually',
                    },
                  ])
                }
              >
                Add line
              </button>
              <span className="spacer" />
              <button
                type="button"
                className="btn green"
                onClick={async () => {
                  setError(null);
                  try {
                    await api(`/v1/lrs/${d.id}/approve`, {
                      method: 'POST',
                      json: changed || d.custom.unpriced?.length ? { lines } : {},
                    });
                    await Promise.all(
                      ['lr', 'lrs', 'outbox'].map((k) => qc.invalidateQueries({ queryKey: [k] })),
                    );
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : 'Approval failed');
                  }
                }}
              >
                Approve for billing
              </button>
            </div>
          )}
          {d.outbox && (
            <p className="faint" style={{ fontSize: 12.5, marginBottom: 0 }}>
              NetSuite: {d.outbox.status}
              {d.outbox.externalRef ? ` · ${d.outbox.externalRef}` : ''}
              {d.outbox.lastError ? ` · ${d.outbox.lastError}` : ''}
            </p>
          )}
        </div>

        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Containers and timeline</h3>
          {d.containers.map((c) => (
            <div key={c.number} className="row" style={{ marginBottom: 6 }}>
              <span className="mono">{c.number}</span> {c.size} · {c.state}
            </div>
          ))}
          <div className="timeline" style={{ marginTop: 10 }}>
            {[
              ['Pre-LR', d.createdAt],
              ['Issued', d.issuedAt],
              ['Closed and priced', d.closedAt],
              ['Approved', d.approvedAt],
              ['Pushed to NetSuite', d.pushedAt],
            ].map(([label, at]) => (
              <div key={label} className="ev">
                <time>{at ? dateTime(at) : '—'}</time>
                <span className={at ? '' : 'faint'}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <h3 style={{ fontSize: 15, margin: '22px 0 10px' }}>Evidence</h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 10,
        }}
      >
        {d.evidence.map((e) => (
          <div
            key={`${e.step_key}-${e.field_key}-${e.captured_at}`}
            className="card"
            style={{ padding: 10 }}
          >
            <div className="faint" style={{ fontSize: 11 }}>
              {e.step_key.replace(/_/g, ' ')}
            </div>
            <b style={{ fontSize: 12.5 }}>{e.field_key.replace(/_/g, ' ')}</b>
            {e.ai_result && (
              <div style={{ fontSize: 11 }}>
                <span
                  className={`pill ${e.ai_result.issues?.length ? 'red' : e.ai_result.status === 'done' ? 'green' : 'gray'}`}
                  style={{ height: 18 }}
                >
                  AI {e.ai_result.status}
                </span>
                {e.ai_result.issues?.map((x) => (
                  <div key={x} className="err">
                    {x}
                  </div>
                ))}
              </div>
            )}
            {e.file_key &&
            /\.(jpe?g|png|webp)$/i.test(e.file_key) &&
            !e.file_key.startsWith('x/') ? (
              <a href={fileUrl(e.file_key)} target="_blank" rel="noreferrer">
                <img
                  src={fileUrl(e.file_key)}
                  alt={e.field_key}
                  style={{
                    width: '100%',
                    height: 90,
                    objectFit: 'cover',
                    borderRadius: 8,
                    marginTop: 6,
                  }}
                />
              </a>
            ) : e.file_key ? (
              <div style={{ marginTop: 6 }}>
                <a href={fileUrl(e.file_key)} target="_blank" rel="noreferrer">
                  Open file
                </a>
              </div>
            ) : (
              <div className="mono" style={{ marginTop: 6 }}>
                {String(e.value)}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
