import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../api';
import { useAuth } from '../auth';
import { dateTime } from '../components/bits';
import type { Master } from '../types';
import { inr } from './LrDetail';

interface OutboxItem {
  id: string;
  status: string;
  attempts: number;
  last_error: string | null;
  external_ref: string | null;
  created_at: string;
  sent_at: string | null;
  lrId: string | null;
  lrNumber: string | null;
  total: number | null;
  clientName: string | null;
}

/** NetSuite sync queue and rate cards (prices as configuration). */
export function Billing() {
  const qc = useQueryClient();
  const outbox = useQuery({
    queryKey: ['outbox'],
    queryFn: () => api<{ mode: string; items: OutboxItem[] }>('/v1/billing/outbox'),
    refetchInterval: 10000,
  });
  const failed = outbox.data?.items.filter((i) => i.status === 'failed').length ?? 0;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Billing</h1>
          <p>
            Approved LRs go to NetSuite automatically. Failures stay here with the reason until they
            are sent.
          </p>
        </div>
        <div className="row">
          <span className={`pill ${outbox.data?.mode === 'restlet' ? 'green' : 'amber'}`}>
            NetSuite:{' '}
            {outbox.data?.mode === 'restlet'
              ? 'live'
              : outbox.data?.mode === 'mock'
                ? 'mock (development)'
                : 'off'}
          </span>
          <button
            type="button"
            className="btn small secondary"
            onClick={async () => {
              await api('/v1/billing/outbox/process', { method: 'POST', json: {} });
              await qc.invalidateQueries({ queryKey: ['outbox'] });
            }}
          >
            Send now
          </button>
        </div>
      </div>
      {failed > 0 && (
        <div className="banner error">
          {failed} LR(s) failed to send — see the reason below and retry.
        </div>
      )}
      <table className="table" style={{ marginBottom: 26 }}>
        <thead>
          <tr>
            <th>LR</th>
            <th>Client</th>
            <th>Total</th>
            <th>Status</th>
            <th>NetSuite ref</th>
            <th>Queued</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(outbox.data?.items ?? []).map((i) => (
            <tr key={i.id}>
              <td className="mono">
                {i.lrId ? <Link to={`/lrs/${i.lrId}`}>{i.lrNumber}</Link> : '—'}
              </td>
              <td>{i.clientName}</td>
              <td>{inr(i.total)}</td>
              <td>
                <span
                  className={`pill ${i.status === 'sent' ? 'green' : i.status === 'failed' ? 'red' : 'amber'}`}
                >
                  {i.status}
                </span>
                {i.last_error && (
                  <div className="err" style={{ fontSize: 11.5 }}>
                    {i.last_error} (try {i.attempts})
                  </div>
                )}
              </td>
              <td className="mono">{i.external_ref ?? '—'}</td>
              <td className="muted">{dateTime(i.created_at)}</td>
              <td>
                {i.status !== 'sent' && (
                  <button
                    type="button"
                    className="btn small secondary"
                    onClick={async () => {
                      await api(`/v1/billing/outbox/${i.id}/retry`, { method: 'POST', json: {} });
                      await qc.invalidateQueries({ queryKey: ['outbox'] });
                    }}
                  >
                    Retry
                  </button>
                )}
              </td>
            </tr>
          ))}
          {!outbox.data?.items.length && (
            <tr>
              <td colSpan={7} className="muted">
                Nothing queued. Approve a closed LR to send it.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <RateCards />
    </>
  );
}

function RateCards() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const cards = useQuery({
    queryKey: ['rate-cards'],
    queryFn: () =>
      api<
        {
          id: string;
          key: string;
          version: number;
          name: string;
          scope: string;
          publishedAt: string;
          body: unknown;
        }[]
      >('/v1/config/rate-cards'),
  });
  const master = useQuery({ queryKey: ['master'], queryFn: () => api<Master>('/v1/master') });
  const [text, setText] = useState('');
  const [sample, setSample] = useState({
    sizes: '20ft,20ft',
    from: 'NSICT',
    to: 'CFS-A',
    jobType: 'IMPORT_PORT_CFS',
    portMinutes: '300',
  });
  const [quote, setQuote] = useState<{
    total: number;
    lines: { label: string; amount: number; basis: string }[];
    unpriced: string[];
  } | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [clientId, setClientId] = useState('');

  return (
    <>
      <h2 style={{ fontSize: 18, marginBottom: 10 }}>Rate cards</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(240px, 320px) 1fr',
          gap: 14,
          alignItems: 'start',
        }}
      >
        <table className="table">
          <tbody>
            {(cards.data ?? []).map((c) => (
              <tr
                key={c.id}
                className="clickable"
                onClick={() => setText(JSON.stringify(c.body, null, 2))}
              >
                <td>
                  <b>{c.name}</b>
                  <div className="faint" style={{ fontSize: 12 }}>
                    {c.key} v{c.version} · {c.scope}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="card">
          {!text ? (
            <p className="muted">Pick a rate card to view, try or change it.</p>
          ) : (
            <>
              {msg && <div className={`banner ${msg.kind}`}>{msg.text}</div>}
              <textarea
                className="input mono"
                style={{ height: 280 }}
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
              />
              <div className="row" style={{ marginTop: 10 }}>
                <input
                  className="input"
                  style={{ width: 120 }}
                  value={sample.sizes}
                  onChange={(e) => setSample({ ...sample, sizes: e.target.value })}
                  title="Container sizes, comma separated"
                />
                <input
                  className="input"
                  style={{ width: 90 }}
                  value={sample.from}
                  onChange={(e) => setSample({ ...sample, from: e.target.value })}
                  title="From place code"
                />
                <input
                  className="input"
                  style={{ width: 90 }}
                  value={sample.to}
                  onChange={(e) => setSample({ ...sample, to: e.target.value })}
                  title="To place code"
                />
                <input
                  className="input"
                  style={{ width: 100 }}
                  value={sample.portMinutes}
                  onChange={(e) => setSample({ ...sample, portMinutes: e.target.value })}
                  title="Minutes at port"
                />
                <button
                  type="button"
                  className="btn secondary"
                  onClick={async () => {
                    setMsg(null);
                    try {
                      setQuote(
                        await api('/v1/config/rate-cards/quote', {
                          method: 'POST',
                          json: {
                            rateCard: JSON.parse(text),
                            sample: {
                              jobType: sample.jobType,
                              from: sample.from,
                              to: sample.to,
                              sizes: sample.sizes.split(',').map((s) => s.trim()),
                              portMinutes: Number(sample.portMinutes) || 0,
                            },
                          },
                        }),
                      );
                    } catch (err) {
                      setMsg({
                        kind: 'error',
                        text:
                          err instanceof ApiError
                            ? `${err.message} ${JSON.stringify(err.details ?? '')}`
                            : 'Not valid JSON',
                      });
                    }
                  }}
                >
                  Try price
                </button>
              </div>
              {quote && (
                <div className="banner ok" style={{ marginTop: 10 }}>
                  {quote.lines.map((l) => (
                    <div key={l.label}>
                      {l.label}: {inr(l.amount)} <span className="faint">({l.basis})</span>
                    </div>
                  ))}
                  <b>Total {inr(quote.total)}</b>
                  {!!quote.unpriced.length && (
                    <div className="err">No rate for: {quote.unpriced.join(', ')}</div>
                  )}
                </div>
              )}
              {me?.roles.includes('admin') && (
                <div className="row" style={{ marginTop: 10 }}>
                  <select
                    className="input"
                    style={{ width: 230 }}
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                  >
                    <option value="">All clients (company default)</option>
                    {(master.data?.clients ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        Only for {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn green"
                    onClick={async () => {
                      setMsg(null);
                      try {
                        await api('/v1/config/rate-cards', {
                          method: 'POST',
                          json: { rateCard: JSON.parse(text), ...(clientId ? { clientId } : {}) },
                        });
                        setMsg({ kind: 'ok', text: 'Published. LRs closed from now on use it.' });
                        await qc.invalidateQueries({ queryKey: ['rate-cards'] });
                      } catch (err) {
                        setMsg({
                          kind: 'error',
                          text: err instanceof ApiError ? err.message : 'Not valid JSON',
                        });
                      }
                    }}
                  >
                    Publish
                  </button>
                  <span className="faint" style={{ fontSize: 12 }}>
                    Raise "version" to publish a change.
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
