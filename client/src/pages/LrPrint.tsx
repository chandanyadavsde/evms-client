import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { dateTime } from '../components/bits';
import { inr, type LrFull } from './LrDetail';

/** Printable LR (browser "Save as PDF"). Layout per client can move to an lr_template config later. */
export function LrPrint() {
  const { id } = useParams();
  const lr = useQuery({ queryKey: ['lr', id], queryFn: () => api<LrFull>(`/v1/lrs/${id}`) });
  const d = lr.data;
  if (!d) return <p style={{ padding: 24 }}>Loading…</p>;
  const cell = {
    border: '1px solid #cfc8b8',
    padding: '6px 8px',
    fontSize: 12.5,
    textAlign: 'left' as const,
  };
  return (
    <div
      style={{
        maxWidth: 800,
        margin: '0 auto',
        padding: 28,
        background: '#fff',
        minHeight: '100vh',
      }}
    >
      <style>{'@media print { .no-print { display: none } body { background: #fff } }'}</style>
      <div className="row no-print" style={{ marginBottom: 16 }}>
        <button type="button" className="btn small" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 22 }}>{d.companyName}</h1>
          <div className="muted">Lorry Receipt (Consignment Note)</div>
        </div>
        <span className="spacer" />
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ fontSize: 18, fontWeight: 700 }}>
            {d.number}
          </div>
          <div className="muted">Issued {dateTime(d.issuedAt)}</div>
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 18 }}>
        <tbody>
          <tr>
            <th style={cell}>Consignor / Client</th>
            <td style={cell}>
              {d.clientName}
              {d.clientGstin ? ` · GSTIN ${d.clientGstin}` : ''}
            </td>
            <th style={cell}>Vehicle</th>
            <td style={cell}>{d.vehicleRegNo}</td>
          </tr>
          <tr>
            <th style={cell}>From</th>
            <td style={cell}>{d.fromName}</td>
            <th style={cell}>To</th>
            <td style={cell}>{d.toName}</td>
          </tr>
          <tr>
            <th style={cell}>Driver</th>
            <td style={cell}>{d.driverName}</td>
            <th style={cell}>Delivered</th>
            <td style={cell}>{dateTime(d.closedAt)}</td>
          </tr>
        </tbody>
      </table>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14 }}>
        <thead>
          <tr>
            <th style={cell}>#</th>
            <th style={cell}>Container</th>
            <th style={cell}>Size</th>
            <th style={cell}>Status</th>
          </tr>
        </thead>
        <tbody>
          {d.containers.map((c, i) => (
            <tr key={c.number}>
              <td style={cell}>{i + 1}</td>
              <td style={{ ...cell, fontFamily: 'monospace' }}>{c.number}</td>
              <td style={cell}>{c.size}</td>
              <td style={cell}>{c.state}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {d.charges.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14 }}>
          <thead>
            <tr>
              <th style={cell}>Charge</th>
              <th style={cell}>Qty</th>
              <th style={cell}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {d.charges.map((c, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: charge lines have no id
              <tr key={i}>
                <td style={cell}>{c.label}</td>
                <td style={cell}>
                  {c.quantity} {c.unit}
                </td>
                <td style={cell}>{inr(c.amount)}</td>
              </tr>
            ))}
            <tr>
              <th style={cell} colSpan={2}>
                Total (before GST)
              </th>
              <th style={cell}>{inr(d.total)}</th>
            </tr>
          </tbody>
        </table>
      )}
      <div className="row" style={{ marginTop: 48, justifyContent: 'space-between' }}>
        <div style={{ borderTop: '1px solid #999', width: 200, paddingTop: 6, fontSize: 12 }}>
          Received by (consignee)
        </div>
        <div style={{ borderTop: '1px solid #999', width: 200, paddingTop: 6, fontSize: 12 }}>
          For {d.companyName}
        </div>
      </div>
    </div>
  );
}
