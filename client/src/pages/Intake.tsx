import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DraftMove, FieldStatus, IntakeDraft } from '@vms/contracts';
import {
  type ClipboardEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api, fileUrl, uploadFile } from '../api';
import { dateTime } from '../components/bits';
import type { Master } from '../types';

/**
 * Smart intake: paste a WhatsApp message, an email or portal screenshots → the reasoning layer
 * drafts moves → the manager fixes what is unsure or missing → Confirm creates the moves.
 */

interface IntakeStatus {
  reader: string;
  readsImages: boolean;
  testDataOnly: boolean;
  spentUsd: number | null;
}
interface ReadResult {
  id: string;
  provider: string;
  draft: IntakeDraft;
}
interface IntakeRow {
  id: string;
  status: string;
  provider: string | null;
  preview: string;
  files: number;
  summary: string;
  drafts: number;
  moves: number;
  createdBy: string | null;
  createdAt: string;
  source: { kind: string; url?: string; title?: string };
}
interface IntakeDetail {
  id: string;
  status: string;
  provider: string | null;
  text: string | null;
  fileKeys: string[];
  draft: IntakeDraft | null;
}

const host = (url?: string) => {
  try {
    return url ? new URL(url).host : '';
  } catch {
    return '';
  }
};

type Key =
  | 'client'
  | 'jobType'
  | 'size'
  | 'containerNumber'
  | 'from'
  | 'to'
  | 'readyAt'
  | 'cutoffAt';
const REQUIRED: Key[] = ['client', 'jobType', 'size', 'from', 'to'];

/** One editable row; status turns "edited" once the manager touches a field. */
interface Row {
  values: Record<Key, string>;
  status: Record<Key, FieldStatus | 'edited'>;
  notes: Partial<Record<Key, string>>;
  read: Partial<Record<Key, string>>;
  duplicateOf?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** ISO instant → value for <input type="datetime-local"> in the browser's time zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toRow(m: DraftMove): Row {
  const keys = Object.keys(m).filter((k) => k !== 'duplicateOf') as Key[];
  const row: Row = {
    values: {} as Row['values'],
    status: {} as Row['status'],
    notes: {},
    read: {},
  };
  for (const k of keys) {
    const f = m[k];
    row.values[k] = k === 'readyAt' || k === 'cutoffAt' ? toLocalInput(f.value) : (f.value ?? '');
    row.status[k] = f.status;
    if (f.note) row.notes[k] = f.note;
    if (f.text) row.read[k] = f.text;
  }
  if (m.duplicateOf) row.duplicateOf = m.duplicateOf;
  return row;
}

const blank = (r: Row, k: Key) => !r.values[k];

export function Intake() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ['intake-status'],
    queryFn: () => api<IntakeStatus>('/v1/intake/status'),
  });
  const master = useQuery({ queryKey: ['master'], queryFn: () => api<Master>('/v1/master') });
  const recent = useQuery({ queryKey: ['intakes'], queryFn: () => api<IntakeRow[]>('/v1/intake') });

  const [text, setText] = useState('');
  const [images, setImages] = useState<{ file: File; url: string }[]>([]);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<ReadResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [done, setDone] = useState<{ count: number } | null>(null);
  /** Screenshots of an intake opened by link (e.g. "Review in VMS" from the plugin). */
  const [savedImages, setSavedImages] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [params, setParams] = useSearchParams();
  const openId = params.get('id');

  // /intake?id=… opens an intake that was read elsewhere (the plugin) for review.
  useEffect(() => {
    if (!openId) return;
    setParams({}, { replace: true });
    api<IntakeDetail>(`/v1/intake/${openId}`)
      .then((d) => {
        if (d.status !== 'read' || !d.draft) {
          setError(new ApiError(0, `This intake is already ${d.status}.`));
          return;
        }
        setText((d.text ?? '').replace(/^Text on the page inside the copied area:\n/, ''));
        setSavedImages(d.fileKeys.map(fileUrl));
        setResult({ id: d.id, provider: d.provider ?? '', draft: d.draft });
        setRows(d.draft.moves.map(toRow));
      })
      .catch((err) => setError(err instanceof ApiError ? err : new ApiError(0, 'Not found')));
  }, [openId, setParams]);

  const addFiles = useCallback((files: File[]) => {
    const imgs = files.filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type));
    if (!imgs.length) return;
    setDone(null);
    setImages((cur) =>
      [...cur, ...imgs.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, 6),
    );
  }, []);

  // Ctrl+V anywhere on the page adds a pasted screenshot (e.g. from Win+Shift+S).
  useEffect(() => {
    if (result) return;
    const onPaste = (e: globalThis.ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) {
        e.preventDefault();
        addFiles(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [result, addFiles]);

  async function read() {
    setReading(true);
    setError(null);
    setDone(null);
    try {
      const fileKeys: string[] = [];
      for (const [i, img] of images.entries()) {
        fileKeys.push(await uploadFile(img.file, img.file.name || `paste-${i + 1}.png`));
      }
      const res = await api<ReadResult>('/v1/intake/read', {
        method: 'POST',
        json: { text, fileKeys },
      });
      setResult(res);
      setRows(res.draft.moves.map(toRow));
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'Could not read — try again'));
    } finally {
      setReading(false);
      await qc.invalidateQueries({ queryKey: ['intakes'] });
      await qc.invalidateQueries({ queryKey: ['intake-status'] });
    }
  }

  function reset() {
    for (const img of images) URL.revokeObjectURL(img.url);
    setImages([]);
    setSavedImages([]);
    setText('');
    setResult(null);
    setRows([]);
    setError(null);
  }

  async function confirm() {
    if (!result) return;
    setError(null);
    const iso = (v: string) => (v ? new Date(v).toISOString() : undefined);
    try {
      const res = await api<{ moveIds: string[] }>(`/v1/intake/${result.id}/confirm`, {
        method: 'POST',
        json: {
          moves: rows.map((r) => ({
            clientId: r.values.client,
            jobTypeId: r.values.jobType,
            cargoTypeId: r.values.size,
            fromLocationId: r.values.from,
            toLocationId: r.values.to,
            ...(r.values.containerNumber ? { containerNumber: r.values.containerNumber } : {}),
            ...(r.values.readyAt ? { readyAt: iso(r.values.readyAt) } : {}),
            ...(r.values.cutoffAt ? { cutoffAt: iso(r.values.cutoffAt) } : {}),
          })),
        },
      });
      reset();
      setDone({ count: res.moveIds.length });
      await qc.invalidateQueries({ queryKey: ['moves'] });
      await qc.invalidateQueries({ queryKey: ['intakes'] });
    } catch (err) {
      if (err instanceof ApiError) setError(err);
    }
  }

  async function discard() {
    if (result) {
      await api(`/v1/intake/${result.id}/discard`, { method: 'POST', json: {} }).catch(() => {});
      await qc.invalidateQueries({ queryKey: ['intakes'] });
    }
    reset();
  }

  // A message usually means one client, route and size for all its containers: a value chosen on
  // one row also fills that field on rows where it is still blank (never overwrites a value).
  const update = (i: number, k: Key, v: string) =>
    setRows((rs) =>
      rs.map((r, j) => {
        if (j !== i && !(v && k !== 'containerNumber' && blank(r, k))) return r;
        const next = {
          ...r,
          values: { ...r.values, [k]: v },
          status: { ...r.status, [k]: 'edited' as const },
        };
        // Changing the job type clears places of the wrong type.
        if (k === 'jobType') {
          const jt = master.data?.jobTypes.find((x) => x.id === v);
          const typeOf = (id: string) => master.data?.locations.find((l) => l.id === id)?.type;
          if (jt && next.values.from && typeOf(next.values.from) !== jt.fromType)
            next.values.from = '';
          if (jt && next.values.to && typeOf(next.values.to) !== jt.toType) next.values.to = '';
        }
        return next;
      }),
    );
  const incomplete = rows.filter((r) => REQUIRED.some((k) => blank(r, k))).length;
  const fieldError = (i: number, k: Key) =>
    error?.fieldErrors.find((e) => e.field === `moves.${i}.${k}`)?.message;

  const s = status.data;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Intake</h1>
          <p>
            Paste a customer message or a portal screenshot. The system drafts the moves; you check
            and confirm.
          </p>
        </div>
        {s && (
          <span className="pill gray" title="Which reader turns your input into moves">
            Reader: {s.reader}
            {s.spentUsd !== null && ` · spent $${s.spentUsd.toFixed(4)} since restart`}
          </span>
        )}
      </div>

      {s?.testDataOnly && (
        <div className="banner warn">
          Free Gemini key: Google may use what you send. Use test screenshots, or blur phone and
          licence numbers.
        </div>
      )}
      {done && (
        <div className="banner ok">
          {done.count} move{done.count === 1 ? '' : 's'} created. <Link to="/moves">See moves</Link>{' '}
          · <Link to="/plan">Plan a trip</Link>
        </div>
      )}
      {error && <div className="banner error">{error.message}</div>}

      {!result ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: drop zone; the paste box and buttons are the accessible way in
        <div
          className="card intake-drop"
          onDragOver={(e: DragEvent) => e.preventDefault()}
          onDrop={(e: DragEvent) => {
            e.preventDefault();
            addFiles([...e.dataTransfer.files]);
          }}
        >
          <textarea
            className="input"
            rows={7}
            placeholder={
              'Paste the WhatsApp message or email here…\n\nor press Ctrl+V to paste a screenshot (Win+Shift+S to snip), or drop image files.'
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e: ClipboardEvent) => {
              if (e.clipboardData.files.length) {
                e.preventDefault();
                e.stopPropagation();
                addFiles([...e.clipboardData.files]);
              }
            }}
          />
          {images.length > 0 && (
            <div className="intake-thumbs">
              {images.map((img, i) => (
                <div key={img.url} className="intake-thumb">
                  <img src={img.url} alt={`Screenshot ${i + 1}`} />
                  <button
                    type="button"
                    aria-label="Remove screenshot"
                    onClick={() => {
                      URL.revokeObjectURL(img.url);
                      setImages((cur) => cur.filter((x) => x !== img));
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {images.length > 0 && s && !s.readsImages && (
            <div className="banner warn">
              This server reads text only — paste the message text, or turn on an AI reader.
            </div>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn green"
              disabled={reading || (!text.trim() && !images.length)}
              onClick={read}
            >
              {reading ? 'Reading… (a few seconds)' : 'Read'}
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => fileInput.current?.click()}
            >
              Add screenshot
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              hidden
              onChange={(e) => {
                addFiles([...(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
            {(text || images.length > 0) && (
              <button type="button" className="btn secondary" onClick={reset}>
                Clear
              </button>
            )}
          </div>
        </div>
      ) : (
        <Review
          result={result}
          rows={rows}
          text={text}
          images={[...images.map((i) => i.url), ...savedImages]}
          master={master.data}
          update={update}
          remove={(i) => setRows((rs) => rs.filter((_, j) => j !== i))}
          copy={(i) =>
            setRows((rs) => [
              ...rs.slice(0, i + 1),
              structuredClone(rs[i] as Row),
              ...rs.slice(i + 1),
            ])
          }
          fieldError={fieldError}
          incomplete={incomplete}
          onConfirm={confirm}
          onDiscard={discard}
        />
      )}

      <h2 style={{ fontSize: 16, margin: '26px 0 10px' }}>Recent intake</h2>
      <table className="table">
        <thead>
          <tr>
            <th>When</th>
            <th>By</th>
            <th>Input</th>
            <th>What it found</th>
            <th>Reader</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {(recent.data ?? []).map((r) => (
            <tr key={r.id}>
              <td className="muted">{dateTime(r.createdAt)}</td>
              <td>{r.createdBy ?? '—'}</td>
              <td className="muted">
                {r.source?.kind === 'plugin' && (
                  <span className="pill gray" title={r.source.title}>
                    Plugin · {host(r.source.url)}
                  </span>
                )}{' '}
                {r.preview.slice(0, 90) || (r.files ? '' : '—')}
                {r.files > 0 && ` ${r.files} screenshot${r.files === 1 ? '' : 's'}`}
              </td>
              <td>
                {r.summary || '—'}
                {r.status === 'read' && r.drafts > 0 && !result && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="btn small secondary"
                      onClick={() => setParams({ id: r.id })}
                    >
                      Review
                    </button>
                  </>
                )}
              </td>
              <td className="muted">{r.provider}</td>
              <td>
                <span
                  className={`pill ${r.status === 'confirmed' ? 'green' : r.status === 'failed' ? 'red' : r.status === 'read' ? 'amber' : 'gray'}`}
                >
                  {r.status === 'confirmed' ? `${r.moves} moves created` : r.status}
                </span>
              </td>
            </tr>
          ))}
          {!recent.isLoading && !recent.data?.length && (
            <tr>
              <td colSpan={6} className="muted">
                Nothing read yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

const STATUS_TEXT: Record<FieldStatus | 'edited', string> = {
  found: 'Found',
  unsure: 'Please check',
  missing: 'Missing',
  edited: 'Set by you',
};

function Review(props: {
  result: ReadResult;
  rows: Row[];
  text: string;
  images: string[];
  master: Master | undefined;
  update: (i: number, k: Key, v: string) => void;
  remove: (i: number) => void;
  copy: (i: number) => void;
  fieldError: (i: number, k: Key) => string | undefined;
  incomplete: number;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const { result, rows, master: m, update } = props;
  const d = result.draft;

  /** Wraps a cell: coloured by status, with what was read and why it is unsure. */
  const cell = (i: number, k: Key, input: React.ReactNode) => {
    const r = rows[i] as Row;
    const st = r.status[k];
    const empty = blank(r, k);
    const cls = empty
      ? REQUIRED.includes(k)
        ? 'st-missing'
        : 'st-optional'
      : st === 'found' || st === 'edited'
        ? 'st-found'
        : 'st-unsure';
    const err = props.fieldError(i, k);
    const tip = [
      empty && REQUIRED.includes(k) ? 'Required' : STATUS_TEXT[st],
      r.read[k] ? `Read as “${r.read[k]}”` : '',
      r.notes[k] ?? '',
      err ?? '',
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <td className={`intake-cell ${cls}`} title={tip}>
        {input}
        {(err || (st === 'unsure' && r.notes[k])) && (
          <span className="intake-note">{err ?? r.notes[k]}</span>
        )}
      </td>
    );
  };

  const select = (i: number, k: Key, options: { id: string; name: string }[]) =>
    cell(
      i,
      k,
      <select
        className="input"
        value={(rows[i] as Row).values[k]}
        onChange={(e) => update(i, k, e.target.value)}
      >
        <option value="">
          {(rows[i] as Row).read[k] ? `? ${(rows[i] as Row).read[k]}` : 'Choose…'}
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>,
    );

  return (
    <div>
      <div className="intake-review">
        <div className="card intake-source">
          <h3>What you pasted</h3>
          {props.text && <pre>{props.text}</pre>}
          {props.images.map((u, i) => (
            <a key={u} href={u} target="_blank" rel="noreferrer">
              <img src={u} alt={`Screenshot ${i + 1}`} />
            </a>
          ))}
        </div>

        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h3 style={{ fontSize: 16 }}>{d.detectedAs || 'Read'}</h3>
            <span className="muted" style={{ fontSize: 12 }}>
              {result.provider}
            </span>
          </div>
          {d.summary && <p style={{ margin: '6px 0 0' }}>{d.summary}</p>}
          {d.notes && (
            <p className="muted" style={{ margin: '6px 0 0' }}>
              {d.notes}
            </p>
          )}
          {d.pendency.length > 0 && (
            <table className="table" style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Size</th>
                  <th>Allocated</th>
                  <th>Done</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {d.pendency.map((p) => (
                  <tr key={`${p.group}-${p.size}`}>
                    <td className="mono">{p.group || '—'}</td>
                    <td>{p.size}</td>
                    <td>{p.allocated ?? '—'}</td>
                    <td>{p.done ?? '—'}</td>
                    <td>
                      <b>{p.balance ?? '—'}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {d.questions.length > 0 && (
            <ul className="intake-questions">
              {d.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="card" style={{ overflowX: 'auto' }}>
          <div className="intake-legend">
            <span className="st-found">Found</span>
            <span className="st-unsure">Please check</span>
            <span className="st-missing">Missing</span>
            <span className="muted">Hover a field to see what was read.</span>
          </div>
          <table className="table intake-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Client</th>
                <th>Job</th>
                <th>Size</th>
                <th>Container no.</th>
                <th>Pickup</th>
                <th>Drop</th>
                <th>Ready</th>
                <th>Cut-off</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const jt = m?.jobTypes.find((j) => j.id === r.values.jobType);
                const places = (type?: string) =>
                  (m?.locations ?? []).filter((l) => !type || l.type === type);
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: rows have no id until created
                  <tr key={i}>
                    <td className="muted">
                      {i + 1}
                      {r.duplicateOf && (
                        <span
                          className="pill red"
                          title="An open move already has this container number"
                        >
                          dup
                        </span>
                      )}
                    </td>
                    {select(i, 'client', m?.clients ?? [])}
                    {select(
                      i,
                      'jobType',
                      (m?.jobTypes ?? []).filter((j) => j.active),
                    )}
                    {select(i, 'size', m?.cargoTypes ?? [])}
                    {cell(
                      i,
                      'containerNumber',
                      <input
                        className="input mono"
                        placeholder="later"
                        value={r.values.containerNumber}
                        onChange={(e) => update(i, 'containerNumber', e.target.value.toUpperCase())}
                      />,
                    )}
                    {select(i, 'from', places(jt?.fromType))}
                    {select(i, 'to', places(jt?.toType))}
                    {cell(
                      i,
                      'readyAt',
                      <input
                        type="datetime-local"
                        className="input"
                        value={r.values.readyAt}
                        onChange={(e) => update(i, 'readyAt', e.target.value)}
                      />,
                    )}
                    {cell(
                      i,
                      'cutoffAt',
                      <input
                        type="datetime-local"
                        className="input"
                        value={r.values.cutoffAt}
                        onChange={(e) => update(i, 'cutoffAt', e.target.value)}
                      />,
                    )}
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn small secondary"
                        title="Copy this row"
                        onClick={() => props.copy(i)}
                      >
                        +
                      </button>{' '}
                      <button
                        type="button"
                        className="btn small secondary"
                        title="Remove this row"
                        onClick={() => props.remove(i)}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card muted">No moves to create from this input.</div>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        {rows.length > 0 && (
          <button
            type="button"
            className="btn green"
            disabled={props.incomplete > 0}
            onClick={props.onConfirm}
          >
            Confirm {rows.length} move{rows.length === 1 ? '' : 's'}
          </button>
        )}
        <button type="button" className="btn secondary" onClick={props.onDiscard}>
          {rows.length ? 'Discard' : 'Done'}
        </button>
        {props.incomplete > 0 && (
          <span className="muted">
            {props.incomplete} move{props.incomplete === 1 ? '' : 's'} still need client, job, size,
            pickup and drop.
          </span>
        )}
      </div>
    </div>
  );
}
