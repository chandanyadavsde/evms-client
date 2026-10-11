import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, api, fileUrl, uploadFile } from '../api';
import { dateTime } from '../components/bits';

interface Field {
  value: string | number | null;
  confidence: number;
  check?: { ok: boolean; message: string };
}
interface Extraction {
  id: string;
  status: 'pending' | 'done' | 'failed' | 'confirmed' | 'rejected';
  template_key: string;
  file_key: string;
  error: string | null;
  model: string | null;
  created_at: string;
  result: {
    detectedAs: string;
    notes: string;
    records: Record<string, Field>[];
    matches?: Record<string, { moveId: string; status: string }[]>;
  } | null;
}
interface Template {
  key: string;
  name: string;
  kind: string;
  fields: { key: string; label: string }[];
}

const tone = (c: number) => (c >= 0.85 ? 'green' : c >= 0.6 ? 'amber' : 'red');

/**
 * One place for port status: drop portal screenshots, AI reads every container on them, you
 * check and confirm, and matching moves are updated. Replaces opening five portals.
 */
export function PortStatus() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api<{ enabled: boolean; model: string | null }>('/v1/ai/status'),
  });
  const templates = useQuery({
    queryKey: ['ai-templates'],
    queryFn: () => api<Template[]>('/v1/ai/templates'),
  });
  const history = useQuery({
    queryKey: ['extractions'],
    queryFn: () => api<Extraction[]>('/v1/ai/extractions'),
  });
  const [templateKey, setTemplateKey] = useState('portal_container_status');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Extraction | null>(null);

  async function read(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      let last: Extraction | null = null;
      for (const file of Array.from(files)) {
        const fileKey = await uploadFile(file, file.name);
        last = await api<Extraction>('/v1/ai/extractions', {
          method: 'POST',
          json: { fileKey, templateKey },
        });
      }
      setCurrent(last);
      await qc.invalidateQueries({ queryKey: ['extractions'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Port status</h1>
          <p>
            Drop screenshots from any port portal. AI reads every container; you check and confirm;
            matching moves update.
          </p>
        </div>
        <span className={`pill ${status.data?.enabled ? 'green' : 'amber'}`}>
          {status.data?.enabled ? `AI on · ${status.data.model}` : 'AI off — manual entry'}
        </span>
      </div>

      <div className="card row" style={{ marginBottom: 16 }}>
        <select
          className="input"
          style={{ width: 260 }}
          value={templateKey}
          onChange={(e) => setTemplateKey(e.target.value)}
        >
          {(templates.data ?? []).map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </select>
        <label className="btn green" style={{ cursor: 'pointer' }}>
          {busy ? 'Reading…' : 'Upload screenshots / PDFs'}
          <input
            type="file"
            accept="image/*,application/pdf"
            multiple
            hidden
            disabled={busy}
            onChange={(e) => read(e.target.files)}
          />
        </label>
        <span className="faint" style={{ fontSize: 12.5 }}>
          Each file takes a few seconds. Nothing changes until you confirm.
        </span>
      </div>
      {error && <div className="banner error">{error}</div>}

      {current && (
        <Review
          ex={current}
          template={templates.data?.find((t) => t.key === current.template_key)}
          onDone={async () => {
            setCurrent(null);
            await Promise.all(
              ['extractions', 'moves'].map((k) => qc.invalidateQueries({ queryKey: [k] })),
            );
          }}
        />
      )}

      <h3 style={{ fontSize: 15, margin: '20px 0 8px' }}>Recent reads</h3>
      <table className="table">
        <thead>
          <tr>
            <th>When</th>
            <th>Template</th>
            <th>Read as</th>
            <th>Containers</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {(history.data ?? []).map((e) => (
            <tr key={e.id} className="clickable" onClick={() => setCurrent(e)}>
              <td className="muted">{dateTime(e.created_at)}</td>
              <td>{e.template_key.replace(/_/g, ' ')}</td>
              <td>{e.result?.detectedAs ?? e.error ?? '—'}</td>
              <td>{e.result?.records.length ?? 0}</td>
              <td>
                <span
                  className={`pill ${e.status === 'confirmed' ? 'green' : e.status === 'failed' || e.status === 'rejected' ? 'red' : 'amber'}`}
                >
                  {e.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Review({
  ex,
  template,
  onDone,
}: {
  ex: Extraction;
  template?: Template;
  onDone: () => Promise<void>;
}) {
  const fields = template?.fields ?? [];
  const [rows, setRows] = useState<Record<string, string>[]>(
    (ex.result?.records ?? []).map((r) =>
      Object.fromEntries(
        fields.map((f) => [
          f.key,
          r[f.key]?.value === null || r[f.key]?.value === undefined ? '' : String(r[f.key]?.value),
        ]),
      ),
    ),
  );
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const editable = ex.status === 'done' || ex.status === 'failed';
  const blank = Object.fromEntries(fields.map((f) => [f.key, '']));

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="row" style={{ marginBottom: 10, alignItems: 'flex-start' }}>
        <a href={fileUrl(ex.file_key)} target="_blank" rel="noreferrer">
          {/\.pdf$/i.test(ex.file_key) ? (
            'Open PDF'
          ) : (
            <img
              src={fileUrl(ex.file_key)}
              alt="uploaded"
              style={{
                width: 180,
                maxHeight: 130,
                objectFit: 'cover',
                borderRadius: 10,
                border: '1px solid var(--line)',
              }}
            />
          )}
        </a>
        <div style={{ flex: 1 }}>
          <b>{ex.result?.detectedAs ?? 'Not read'}</b>
          {ex.error && <div className="err">{ex.error}</div>}
          {ex.result?.notes && <div className="muted">{ex.result.notes}</div>}
          <div className="faint" style={{ fontSize: 12 }}>
            {ex.model ? `Read by ${ex.model}` : ''} · coloured values show AI confidence; check the
            amber and red ones.
          </div>
        </div>
      </div>
      {msg && <div className={`banner ${msg.kind}`}>{msg.text}</div>}
      <div style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              {fields.map((f) => (
                <th key={f.key}>{f.label}</th>
              ))}
              {ex.result?.matches && <th>Move</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const raw = ex.result?.records[i];
              const number = row.container_number;
              const match = number ? ex.result?.matches?.[number] : undefined;
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows have no id until confirmed
                <tr key={i}>
                  {fields.map((f) => {
                    const r = raw?.[f.key];
                    return (
                      <td key={f.key} style={{ minWidth: 120 }}>
                        <input
                          className="input"
                          style={{
                            height: 34,
                            borderColor:
                              r && r.value !== null
                                ? `var(--${tone(r.confidence) === 'green' ? 'line-strong' : tone(r.confidence) === 'amber' ? 'amber' : 'red'})`
                                : undefined,
                          }}
                          value={row[f.key] ?? ''}
                          disabled={!editable}
                          onChange={(e) =>
                            setRows(
                              rows.map((x, j) => (j === i ? { ...x, [f.key]: e.target.value } : x)),
                            )
                          }
                        />
                        {r && r.value !== null && (
                          <span
                            className={`pill ${tone(r.confidence)}`}
                            style={{ marginTop: 4, height: 18, fontSize: 10.5 }}
                          >
                            {Math.round(r.confidence * 100)}%
                          </span>
                        )}
                        {r?.check && !r.check.ok && (
                          <div className="err" style={{ fontSize: 11 }}>
                            {r.check.message}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  {ex.result?.matches && (
                    <td>
                      {match ? (
                        <span className="pill green">{match.length} move</span>
                      ) : (
                        <span className="pill gray">no move</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="row" style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn small secondary"
            onClick={() => setRows([...rows, { ...blank }])}
          >
            Add row
          </button>
          <span className="spacer" />
          <button
            type="button"
            className="btn small secondary"
            onClick={async () => {
              await api(`/v1/ai/extractions/${ex.id}/reject`, { method: 'POST', json: {} });
              await onDone();
            }}
          >
            Reject
          </button>
          <button
            type="button"
            className="btn green"
            onClick={async () => {
              try {
                const r = await api<{ updatedMoves: string[] }>(
                  `/v1/ai/extractions/${ex.id}/confirm`,
                  {
                    method: 'POST',
                    json: {
                      records: rows.map((x) =>
                        Object.fromEntries(
                          Object.entries(x).map(([k, v]) => [k, v === '' ? null : v]),
                        ),
                      ),
                    },
                  },
                );
                setMsg({
                  kind: 'ok',
                  text: `Confirmed. ${r.updatedMoves.length} move(s) updated.`,
                });
                setTimeout(onDone, 900);
              } catch (err) {
                setMsg({
                  kind: 'error',
                  text: err instanceof ApiError ? err.message : 'Could not confirm',
                });
              }
            }}
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}
