import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Screen } from '@vms/contracts';
import { useState } from 'react';
import { ApiError, api } from '../api';
import { isStaff, useAuth } from '../auth';
import { dateTime, StatusPill } from '../components/bits';
import { ScreenRenderer } from '../components/ScreenRenderer';
import type { Master, WorkflowRow } from '../types';

interface PreviewStep {
  key: string;
  actor: string;
  required: string[];
  sla: { maxMinutes: number } | null;
  automations: { type: string }[];
  screen: Screen;
}

/**
 * Flow admin: a new client flow or a changed step is a new version here — never new code.
 * Validate → preview every screen for a sample container → publish.
 */
export function Flows() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['workflows'],
    queryFn: () => api<WorkflowRow[]>('/v1/config/workflows'),
  });
  const master = useQuery({ queryKey: ['master'], queryFn: () => api<Master>('/v1/master') });
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [check, setCheck] = useState<{
    ok: boolean;
    schemaErrors: string[];
    lintErrors: string[];
  } | null>(null);
  const [preview, setPreview] = useState<PreviewStep[] | null>(null);
  const [sample, setSample] = useState({ cargoSize: '20ft', clientCode: '', lang: 'en' });
  const [clientId, setClientId] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const isAdmin = !!me?.roles.includes('admin');

  const parsed = (() => {
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return undefined;
    }
  })();

  async function open(id: string) {
    const row = await api<{ body: unknown }>(`/v1/config/workflows/${id}`);
    setSelected(id);
    setText(JSON.stringify(row.body, null, 2));
    setCheck(null);
    setPreview(null);
    setMessage(null);
  }

  async function validate() {
    const r = await api<{ ok: boolean; schemaErrors: string[]; lintErrors: string[] }>(
      '/v1/config/workflows/validate',
      {
        method: 'POST',
        json: { flow: parsed },
      },
    );
    setCheck(r);
    return r.ok;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Flows</h1>
          <p>
            Each client's process as configuration. Change it here, preview it, publish a new
            version — no development.
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(260px, 340px) 1fr',
          gap: 14,
          alignItems: 'start',
        }}
      >
        <table className="table">
          <thead>
            <tr>
              <th>Flow</th>
              <th>Scope</th>
              <th>v</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((w) => (
              <tr
                key={w.id}
                className="clickable"
                onClick={() => open(w.id)}
                style={{ background: selected === w.id ? '#fbfaf7' : undefined }}
              >
                <td>
                  <b>{w.name}</b>
                  <div className="faint" style={{ fontSize: 12 }}>
                    {w.key} · {w.steps} steps · {dateTime(w.publishedAt)}
                  </div>
                </td>
                <td>{w.scope}</td>
                <td>
                  {w.version}{' '}
                  <StatusPill status={w.status === 'published' ? 'completed' : 'cancelled'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="card">
          {!text ? (
            <p className="muted">Pick a flow to view or change it.</p>
          ) : (
            <>
              {message && <div className={`banner ${message.kind}`}>{message.text}</div>}
              <div className="field">
                <label htmlFor="flow-json">
                  <span>Flow definition (JSON)</span>
                  {parsed === undefined && <span className="err">Not valid JSON</span>}
                </label>
                <textarea
                  id="flow-json"
                  className="input mono"
                  style={{ height: 360 }}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setCheck(null);
                  }}
                  readOnly={!isStaff(me)}
                  spellCheck={false}
                />
              </div>

              <div className="row" style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={!parsed}
                  onClick={validate}
                >
                  Check
                </button>
                <select
                  className="input"
                  style={{ width: 110 }}
                  value={sample.cargoSize}
                  onChange={(e) => setSample({ ...sample, cargoSize: e.target.value })}
                >
                  <option>20ft</option>
                  <option>40ft</option>
                </select>
                <select
                  className="input"
                  style={{ width: 150 }}
                  value={sample.clientCode}
                  onChange={(e) => setSample({ ...sample, clientCode: e.target.value })}
                >
                  <option value="">Any client</option>
                  {(master.data?.clients ?? []).map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  className="input"
                  style={{ width: 110 }}
                  value={sample.lang}
                  onChange={(e) => setSample({ ...sample, lang: e.target.value })}
                >
                  <option value="en">English</option>
                  <option value="hi">हिन्दी</option>
                </select>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={!parsed}
                  onClick={async () => {
                    if (!(await validate())) return;
                    setPreview(
                      await api<PreviewStep[]>('/v1/config/workflows/preview', {
                        method: 'POST',
                        json: {
                          flow: parsed,
                          lang: sample.lang,
                          sample: { cargoSize: sample.cargoSize, clientCode: sample.clientCode },
                        },
                      }),
                    );
                  }}
                >
                  Preview screens
                </button>
              </div>

              {check && (
                <div className={`banner ${check.ok ? 'ok' : 'error'}`}>
                  {check.ok
                    ? 'Flow is valid.'
                    : [...check.schemaErrors, ...check.lintErrors].map((e) => (
                        <div key={e}>{e}</div>
                      ))}
                </div>
              )}

              {isAdmin && (
                <div className="row" style={{ marginBottom: 6 }}>
                  <select
                    className="input"
                    style={{ width: 220 }}
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
                    disabled={!parsed}
                    onClick={async () => {
                      setMessage(null);
                      if (!(await validate())) return;
                      try {
                        await api('/v1/config/workflows', {
                          method: 'POST',
                          json: { flow: parsed, ...(clientId ? { clientId } : {}) },
                        });
                        setMessage({
                          kind: 'ok',
                          text: `Published ${parsed.key} v${parsed.version}. New legs use it; running legs keep their version.`,
                        });
                        await qc.invalidateQueries({ queryKey: ['workflows'] });
                      } catch (err) {
                        setMessage({
                          kind: 'error',
                          text: err instanceof ApiError ? err.message : 'Publish failed',
                        });
                      }
                    }}
                  >
                    Publish as v{parsed?.version ?? '?'}
                  </button>
                  <span className="faint" style={{ fontSize: 12 }}>
                    Raise "version" in the JSON to publish a change.
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {preview && (
        <>
          <h2 style={{ fontSize: 18, margin: '22px 0 10px' }}>Preview · what each person sees</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 14,
            }}
          >
            {preview.map((p, i) => (
              <div key={p.key}>
                <div className="row" style={{ marginBottom: 6, fontSize: 12.5 }}>
                  <b>
                    {String(i + 1).padStart(2, '0')} · {p.actor}
                  </b>
                  {p.sla && <span className="pill amber">SLA {p.sla.maxMinutes} min</span>}
                  {p.automations.map((a) => (
                    <span key={a.type} className="pill gray">
                      {a.type}
                    </span>
                  ))}
                </div>
                <ScreenRenderer screen={p.screen} onAction={async () => {}} />
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
