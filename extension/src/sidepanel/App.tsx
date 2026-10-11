import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  confirmIntake,
  intakeStatus,
  type PasteSource,
  pasteSources,
  readyToCreate,
  requestCode,
  verifyCode,
} from '../lib/api';
import {
  type DraftMove,
  getSettings,
  getSnips,
  removeSnip,
  type Settings,
  type Snip,
  STORAGE_KEYS,
  saveSettings,
  updateSnip,
} from '../lib/store';

/** Keeps settings, snips and the snip status in sync with chrome.storage. */
function usePluginState() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [snips, setSnips] = useState<Snip[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    const load = async () => {
      setSettings(await getSettings());
      setSnips(await getSnips());
      const s = await chrome.storage.session.get('vms.status');
      setStatus((s['vms.status'] as string | null) ?? null);
    };
    void load();
    const onChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes[STORAGE_KEYS.SETTINGS] || changes[STORAGE_KEYS.SNIPS] || changes['vms.status']) {
        void load();
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);
  return { settings, snips, status };
}

export function App() {
  const { settings, snips, status } = usePluginState();
  if (!settings) return null;
  if (!settings.token) return <SignIn settings={settings} />;
  return <Main settings={settings} snips={snips} status={status} />;
}

function SignIn({ settings }: { settings: Settings }) {
  const [apiBase, setApiBase] = useState(settings.apiBase);
  const [webBase, setWebBase] = useState(settings.webBase);
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'who' | 'code'>('who');
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pad">
      <h1>VMS Assist</h1>
      <p className="muted">Copy any area of a portal, WhatsApp Web or email into VMS.</p>
      {error && <div className="banner error">{error}</div>}
      {step === 'who' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await saveSettings({ apiBase: apiBase.trim(), webBase: webBase.trim() });
              const r = await requestCode(identifier.trim());
              setHint(r.devHint ? `${r.devHint} (123456)` : null);
              setStep('code');
            });
          }}
        >
          <label>
            Work email
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="manager@sorigin.co"
              required
            />
          </label>
          <details>
            <summary>Server</summary>
            <label>
              VMS API
              <input value={apiBase} onChange={(e) => setApiBase(e.target.value)} />
            </label>
            <label>
              VMS web app
              <input value={webBase} onChange={(e) => setWebBase(e.target.value)} />
            </label>
          </details>
          <button className="btn" disabled={busy} type="submit">
            Send code
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await verifyCode(identifier.trim(), code.trim());
            });
          }}
        >
          <p className="muted">Code sent to {identifier}.</p>
          {hint && <p className="muted">{hint}</p>}
          <label>
            6-digit code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              required
            />
          </label>
          <button className="btn" disabled={busy || code.length !== 6} type="submit">
            Sign in
          </button>
          <button className="link" type="button" onClick={() => setStep('who')}>
            Change email
          </button>
        </form>
      )}
    </div>
  );
}

function Main({
  settings,
  snips,
  status,
}: {
  settings: Settings;
  snips: Snip[];
  status: string | null;
}) {
  const [reader, setReader] = useState<Awaited<ReturnType<typeof intakeStatus>> | null>(null);
  const [readerError, setReaderError] = useState<string | null>(null);
  const done = snips.filter((s) => s.status !== 'reading').length;
  // Refresh the reader name and spend after every finished read.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `done` is the refresh trigger
  useEffect(() => {
    intakeStatus()
      .then((r) => {
        setReader(r);
        setReaderError(null);
      })
      .catch((err) => setReaderError(err instanceof Error ? err.message : 'VMS not reachable'));
  }, [done]);

  const busy = status === 'selecting' || status === 'reading';
  return (
    <div>
      <header className="top">
        <div>
          <b>VMS Assist</b>
          <div className="muted small">
            {settings.user?.name} ·{' '}
            <button
              className="link"
              type="button"
              onClick={() => saveSettings({ token: null, user: null })}
            >
              Sign out
            </button>
          </div>
        </div>
        {reader && (
          <div className="muted small right">
            {reader.reader}
            {reader.spentUsd !== null && <div>spent ${reader.spentUsd.toFixed(4)}</div>}
          </div>
        )}
      </header>

      <div className="pad">
        {readerError && <div className="banner error">{readerError}</div>}
        {reader?.testDataOnly && (
          <div className="banner warn">Free AI key: use test data only.</div>
        )}
        <button
          className="btn big"
          type="button"
          disabled={busy}
          onClick={() => chrome.runtime.sendMessage({ type: 'vms:start-snip' })}
        >
          {status === 'selecting'
            ? 'Drag a box on the page…'
            : status === 'reading'
              ? 'Reading…'
              : 'Copy an area  (Alt+S)'}
        </button>
        {status && !busy && <div className="banner warn">{status}</div>}

        <PastePanel snips={snips} busy={busy} />

        <div className="row between">
          <h2>Clipboard</h2>
          {snips.length > 0 && (
            <button className="link" type="button" onClick={() => removeSnip('all')}>
              Clear all
            </button>
          )}
        </div>
        {snips.length === 0 && (
          <p className="muted">
            Nothing copied yet. Open a portal page or a WhatsApp Web chat, click the button and drag
            around the order or the pendency box.
          </p>
        )}
        {snips.map((s) => (
          <SnipCard key={s.id} snip={s} webBase={settings.webBase} />
        ))}
      </div>
    </div>
  );
}

const host = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const dot = (s: DraftMove[keyof DraftMove]) =>
  typeof s === 'object'
    ? s.status === 'found'
      ? 'ok'
      : s.status === 'unsure'
        ? 'check'
        : 'miss'
    : '';

function moveLine(m: DraftMove) {
  const v = (f: DraftMove['client'], empty: string) => f.label ?? f.text ?? empty;
  return (
    <>
      <span className={dot(m.client)}>{v(m.client, 'client?')}</span> ·{' '}
      <span className={dot(m.size)}>{v(m.size, 'size?')}</span> ·{' '}
      <span className={dot(m.from)}>{v(m.from, 'pickup?')}</span> →{' '}
      <span className={dot(m.to)}>{v(m.to, 'drop?')}</span>
      {m.containerNumber.value && <span className="mono"> · {m.containerNumber.value}</span>}
    </>
  );
}

function SnipCard({ snip, webBase }: { snip: Snip; webBase: string }) {
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const d = snip.draft;
  const review = () =>
    chrome.tabs.create({ url: `${webBase.replace(/\/$/, '')}/intake?id=${snip.intakeId}` });
  const copyText = () => {
    const lines = [
      d?.summary,
      ...(d?.moves ?? []).map(
        (m, i) =>
          `${i + 1}. ${[m.client, m.size, m.containerNumber, m.from, m.to]
            .map((f) => f.label ?? f.text ?? '?')
            .join(' · ')}`,
      ),
    ].filter(Boolean);
    void navigator.clipboard.writeText(lines.join('\n') || snip.text);
  };

  return (
    <div className="card">
      <div className="row between">
        <span className="muted small" title={snip.url}>
          {host(snip.url)} ·{' '}
          {new Date(snip.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <button className="link small" type="button" onClick={() => removeSnip(snip.id)}>
          ×
        </button>
      </div>
      <img className="shot" src={snip.image} alt="Copied area" />
      {snip.status === 'reading' && <p className="muted">Reading…</p>}
      {snip.status === 'failed' && <div className="banner error">{snip.error}</div>}
      {d && (
        <>
          <p>
            <b>{d.detectedAs || 'Read'}</b>
            {d.summary && <> — {d.summary}</>}
          </p>
          {d.pendency.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Size</th>
                  <th>Alloc.</th>
                  <th>Done</th>
                  <th>Bal.</th>
                </tr>
              </thead>
              <tbody>
                {d.pendency.map((p) => (
                  <tr key={`${p.group}${p.size}`}>
                    <td>{p.group}</td>
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
          {d.moves.length > 0 && (
            <ol className="moves">
              {d.moves.map((m, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: drafts have no id
                <li key={i}>{moveLine(m)}</li>
              ))}
            </ol>
          )}
          {d.questions.length > 0 && (
            <ul className="questions">
              {d.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          )}
          {error && <div className="banner error">{error}</div>}
          {snip.status === 'created' ? (
            <div className="banner ok">{snip.createdMoves} moves created in VMS.</div>
          ) : (
            <div className="row">
              {d.moves.length > 0 && readyToCreate(d) && (
                <button
                  className="btn"
                  type="button"
                  disabled={creating}
                  onClick={async () => {
                    setCreating(true);
                    setError(null);
                    try {
                      const r = await confirmIntake(snip.intakeId as string, d);
                      await updateSnip(snip.id, {
                        status: 'created',
                        createdMoves: r.moveIds.length,
                      });
                    } catch (err) {
                      setError(err instanceof ApiError ? err.message : 'Could not create');
                    } finally {
                      setCreating(false);
                    }
                  }}
                >
                  Create {d.moves.length} move{d.moves.length === 1 ? '' : 's'}
                </button>
              )}
              {d.moves.length > 0 && (
                <button className="btn secondary" type="button" onClick={review}>
                  {readyToCreate(d) ? 'Review in VMS' : 'Complete in VMS'}
                </button>
              )}
              <button className="btn secondary" type="button" onClick={copyText}>
                Copy text
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** A copied snip can be pasted too: its first draft move becomes the data. */
function snipSource(s: Snip): PasteSource | null {
  const moves = s.draft?.moves ?? [];
  const m = moves[0];
  if (!m) return null;
  const text = (f: DraftMove['client']) => f.label ?? f.text ?? '';
  const numbers = moves.map((x) => x.containerNumber.value).filter(Boolean) as string[];
  return {
    id: `snip:${s.id}`,
    label: `Copied · ${s.draft?.summary || text(m.client) || 'snip'}`,
    data: {
      client: text(m.client),
      container_size: text(m.size).replace(/\D/g, ''),
      container_count: String(moves.length),
      container_numbers: numbers.join(', '),
      pickup: text(m.from),
      drop: text(m.to),
      job_type: text(m.jobType),
    },
  };
}

function PastePanel({ snips, busy }: { snips: Snip[]; busy: boolean }) {
  const [jobs, setJobs] = useState<PasteSource[]>([]);
  const [chosen, setChosen] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () =>
      pasteSources()
        .then((j) => {
          setJobs(j);
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not load jobs')),
    [],
  );
  useEffect(() => {
    void load();
    chrome.storage.session.get('vms.pasteSource').then((s) => {
      setChosen((s['vms.pasteSource'] as PasteSource | undefined)?.id ?? '');
    });
  }, [load]);
  const sources = [...jobs, ...snips.map(snipSource).filter((s): s is PasteSource => !!s)];
  const current = sources.find((s) => s.id === chosen);
  const choose = async (id: string) => {
    setChosen(id);
    const s = sources.find((x) => x.id === id) ?? null;
    await chrome.storage.session.set({ 'vms.pasteSource': s });
  };

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row between" style={{ marginTop: 0 }}>
        <b>Fill a portal form</b>
        <button className="link small" type="button" onClick={() => void load()}>
          Refresh jobs
        </button>
      </div>
      {error && <div className="banner error">{error}</div>}
      <label>
        Fill from
        <select className="select" value={chosen} onChange={(e) => void choose(e.target.value)}>
          <option value="">Choose a job…</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      {!sources.length && (
        <p className="muted small">No planned jobs. Plan a trip in VMS, or copy an order first.</p>
      )}
      {current && (
        <p className="muted small">
          {Object.entries(current.data)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
            .join(' · ')}
        </p>
      )}
      <button
        className="btn"
        type="button"
        disabled={busy || !current}
        onClick={() => chrome.runtime.sendMessage({ type: 'vms:start-paste' })}
      >
        Fill a form (Alt+P)
      </button>
      <p className="muted small">
        Drag around the form; check the preview; press Fill. VMS never presses the portal's submit
        button.
      </p>
    </div>
  );
}
