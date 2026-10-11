import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../api';
import { Soc, StatusPill } from '../components/bits';
import type { Master } from '../types';
import { PortSettings, Supervisors, TripTypes } from './AdminSetup';

const TABS = [
  ['ports', 'Ports'],
  ['cfs', 'CFS'],
  ['clients', 'Clients'],
  ['trip-types', 'Trip types'],
  ['supervisors', 'Supervisors'],
  ['places', 'All places'],
  ['trucks', 'Trucks'],
  ['drivers', 'Drivers'],
  ['documents', 'Documents'],
  ['settings', 'Policy'],
] as const;
type Tab = (typeof TABS)[number][0];

/** Master data: everything here is data the engine reads — onboarding needs no development. */
export function Admin() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) ?? 'ports';
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Admin</h1>
          <p>
            Ports, CFSs, clients, trip types, supervisors, trucks and drivers. New ones work
            immediately — no code changes.
          </p>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 16 }}>
        {TABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`btn small ${tab === k ? '' : 'secondary'}`}
            onClick={() => setParams({ tab: k })}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'ports' && (
        <>
          <PortSettings />
          <Places only="PORT_TERMINAL" title="Add port" />
        </>
      )}
      {tab === 'cfs' && <Places only="CFS" title="Add CFS" />}
      {tab === 'clients' && <Clients />}
      {tab === 'trip-types' && <TripTypes />}
      {tab === 'supervisors' && <Supervisors />}
      {tab === 'places' && <Places />}
      {tab === 'trucks' && <Trucks />}
      {tab === 'drivers' && <Drivers />}
      {tab === 'documents' && <Documents />}
      {tab === 'settings' && <Settings />}
    </>
  );
}

export function useMaster() {
  return useQuery({ queryKey: ['master'], queryFn: () => api<Master>('/v1/master') });
}

/** Small add-form wrapper: posts, shows the API error, refreshes master data. */
export function AddForm({
  title,
  onSubmit,
  children,
}: {
  title: string;
  onSubmit: () => Promise<unknown>;
  children: ReactNode;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  return (
    <form
      className="card"
      style={{ marginBottom: 14 }}
      onSubmit={async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setOk(false);
        try {
          await onSubmit();
          setOk(true);
          await qc.invalidateQueries();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Could not save');
        }
      }}
    >
      <h3 style={{ fontSize: 15, marginBottom: 10 }}>{title}</h3>
      {error && <div className="banner error">{error}</div>}
      {ok && <div className="banner ok">Saved.</div>}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '0 12px',
          alignItems: 'end',
        }}
      >
        {children}
        <div className="field">
          <button className="btn green" type="submit">
            Add
          </button>
        </div>
      </div>
    </form>
  );
}

export function Input({
  label,
  value,
  onChange,
  ...rest
}: { label: string; value: string; onChange: (v: string) => void } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
>) {
  const id = `f-${label.replace(/\W/g, '')}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
    </div>
  );
}

/** Other names smart intake should match ("DPW", "Nhava Sheva", a portal group code like "ULA"). */
function Aliases({ url, aliases }: { url: string; aliases: string[] }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(aliases.join(', '));
  const [error, setError] = useState<string | null>(null);
  if (!editing) {
    return (
      <span>
        {aliases.length ? aliases.join(', ') : <span className="faint">—</span>}{' '}
        <button
          type="button"
          className="btn small secondary"
          onClick={() => {
            setValue(aliases.join(', '));
            setEditing(true);
          }}
        >
          Edit
        </button>
      </span>
    );
  }
  const save = async () => {
    setError(null);
    try {
      await api(url, {
        method: 'PATCH',
        json: {
          aliases: value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
      await qc.invalidateQueries({ queryKey: ['master'] });
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save');
    }
  };
  return (
    <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
      <input
        className="input"
        style={{ height: 32, minWidth: 220 }}
        value={value}
        placeholder="Comma separated, e.g. DPW, Nhava Sheva"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
      <button type="button" className="btn small green" onClick={save}>
        Save
      </button>
      {error && <span className="err">{error}</span>}
    </span>
  );
}

function Clients() {
  const master = useMaster();
  const [f, setF] = useState({ code: '', name: '', lrPrefix: '', gstin: '' });
  return (
    <>
      <AddForm
        title="Add client"
        onSubmit={() =>
          api('/v1/admin/clients', {
            method: 'POST',
            json: {
              code: f.code,
              name: f.name,
              ...(f.lrPrefix ? { lrPrefix: f.lrPrefix } : {}),
              ...(f.gstin ? { gstin: f.gstin } : {}),
            },
          })
        }
      >
        <Input
          label="Code"
          value={f.code}
          onChange={(v) => setF({ ...f, code: v.toUpperCase() })}
          placeholder="MAERSK"
          required
        />
        <Input label="Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} required />
        <Input
          label="LR prefix"
          value={f.lrPrefix}
          onChange={(v) => setF({ ...f, lrPrefix: v })}
          placeholder="MSK/"
        />
        <Input label="GSTIN" value={f.gstin} onChange={(v) => setF({ ...f, gstin: v })} />
      </AddForm>
      <table className="table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th title="Names smart intake matches: short names, portal group codes">
              Also known as
            </th>
          </tr>
        </thead>
        <tbody>
          {(master.data?.clients ?? []).map((c) => (
            <tr key={c.id}>
              <td className="mono">{c.code}</td>
              <td>{c.name}</td>
              <td>
                <Aliases url={`/v1/admin/clients/${c.id}`} aliases={c.aliases ?? []} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** Places of one type (ports, CFSs) or all of them. */
function Places({ only, title = 'Add place' }: { only?: string; title?: string }) {
  const master = useMaster();
  const types = useQuery({
    queryKey: ['location-types'],
    queryFn: () => api<{ id: string; code: string; name: string }[]>('/v1/admin/location-types'),
  });
  const [f, setF] = useState({
    code: '',
    name: '',
    typeCode: only ?? '',
    lat: '',
    lng: '',
    radius: '300',
    chargers: '0',
  });
  return (
    <>
      <AddForm
        title={title}
        onSubmit={() =>
          api('/v1/admin/locations', {
            method: 'POST',
            json: {
              code: f.code,
              name: f.name,
              typeCode: f.typeCode,
              lat: Number(f.lat),
              lng: Number(f.lng),
              geofenceRadiusM: Number(f.radius),
              charging:
                Number(f.chargers) > 0
                  ? { available: true, chargers: Number(f.chargers) }
                  : { available: false },
            },
          })
        }
      >
        <Input
          label="Code"
          value={f.code}
          onChange={(v) => setF({ ...f, code: v.toUpperCase() })}
          placeholder={only === 'PORT_TERMINAL' ? 'NSFT' : 'CFS-C'}
          required
        />
        <Input label="Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} required />
        {!only && (
          <div className="field">
            <label htmlFor="ptype">Type</label>
            <select
              id="ptype"
              className="input"
              value={f.typeCode}
              onChange={(e) => setF({ ...f, typeCode: e.target.value })}
              required
            >
              <option value="">Select…</option>
              {(types.data ?? []).map((t) => (
                <option key={t.id} value={t.code}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <Input
          label="Latitude"
          value={f.lat}
          onChange={(v) => setF({ ...f, lat: v })}
          inputMode="decimal"
          required
        />
        <Input
          label="Longitude"
          value={f.lng}
          onChange={(v) => setF({ ...f, lng: v })}
          inputMode="decimal"
          required
        />
        <Input
          label="Geo-fence (m)"
          value={f.radius}
          onChange={(v) => setF({ ...f, radius: v })}
          inputMode="numeric"
        />
        <Input
          label="EV chargers"
          value={f.chargers}
          onChange={(v) => setF({ ...f, chargers: v })}
          inputMode="numeric"
        />
      </AddForm>
      <table className="table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Type</th>
            <th>Location</th>
            <th>Charging</th>
            <th title="Names smart intake matches, e.g. DPW, Nhava Sheva">Also known as</th>
          </tr>
        </thead>
        <tbody>
          {(master.data?.locations ?? [])
            .filter((l) => !only || l.type === only)
            .map((l) => (
              <tr key={l.id}>
                <td className="mono">{l.code}</td>
                <td>{l.name}</td>
                <td>{l.typeName}</td>
                <td className="muted">
                  {l.lat?.toFixed(4)}, {l.lng?.toFixed(4)}
                </td>
                <td>{l.charging.available ? `${l.charging.chargers ?? '?'} chargers` : '—'}</td>
                <td>
                  <Aliases url={`/v1/admin/locations/${l.id}`} aliases={l.aliases ?? []} />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </>
  );
}

function Trucks() {
  const qc = useQueryClient();
  const master = useMaster();
  const cats = useQuery({
    queryKey: ['vehicle-categories'],
    queryFn: () =>
      api<{ id: string; name: string; capacity: Record<string, number> }[]>(
        '/v1/admin/vehicle-categories',
      ),
  });
  const [f, setF] = useState({
    regNo: '',
    categoryId: '',
    batteryKwh: '282',
    odometer: '',
    soc: '',
  });
  return (
    <>
      <AddForm
        title="Add truck"
        onSubmit={() =>
          api('/v1/admin/vehicles', {
            method: 'POST',
            json: {
              regNo: f.regNo,
              categoryId: f.categoryId,
              batteryKwh: Number(f.batteryKwh) || undefined,
              ...(f.odometer ? { odometer: Number(f.odometer) } : {}),
              ...(f.soc ? { soc: Number(f.soc) } : {}),
            },
          })
        }
      >
        <Input
          label="Registration"
          value={f.regNo}
          onChange={(v) => setF({ ...f, regNo: v.toUpperCase() })}
          placeholder="MH46 EV 2001"
          required
        />
        <div className="field">
          <label htmlFor="cat">Category</label>
          <select
            id="cat"
            className="input"
            value={f.categoryId}
            onChange={(e) => setF({ ...f, categoryId: e.target.value })}
            required
          >
            <option value="">Select…</option>
            {(cats.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="Battery (kWh)"
          value={f.batteryKwh}
          onChange={(v) => setF({ ...f, batteryKwh: v })}
          inputMode="decimal"
        />
        <Input
          label="Odometer (km)"
          value={f.odometer}
          onChange={(v) => setF({ ...f, odometer: v })}
          inputMode="decimal"
        />
        <Input
          label="Battery now (%)"
          value={f.soc}
          onChange={(v) => setF({ ...f, soc: v })}
          inputMode="decimal"
        />
      </AddForm>
      <table className="table">
        <thead>
          <tr>
            <th>Truck</th>
            <th>Category</th>
            <th>Battery</th>
            <th>Odometer</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(master.data?.vehicles ?? []).map((v) => (
            <tr key={v.id}>
              <td>
                <b>{v.regNo}</b>
              </td>
              <td className="muted">{v.category}</td>
              <td>
                <Soc value={v.soc} />
              </td>
              <td className="muted">{v.odometer ?? '—'} km</td>
              <td>
                <StatusPill status={v.status === 'active' ? 'completed' : 'cancelled'} /> {v.status}
              </td>
              <td>
                <button
                  type="button"
                  className="btn small secondary"
                  onClick={async () => {
                    await api(`/v1/admin/vehicles/${v.id}`, {
                      method: 'PATCH',
                      json: { status: v.status === 'active' ? 'maintenance' : 'active' },
                    });
                    await qc.invalidateQueries({ queryKey: ['master'] });
                  }}
                >
                  {v.status === 'active' ? 'To maintenance' : 'Back to active'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Drivers() {
  const master = useMaster();
  const [f, setF] = useState({ name: '', phone: '', language: 'hi', licenceNo: '' });
  return (
    <>
      <AddForm
        title="Add driver (gets a phone login)"
        onSubmit={() =>
          api('/v1/admin/drivers', {
            method: 'POST',
            json: {
              name: f.name,
              phone: f.phone,
              language: f.language,
              ...(f.licenceNo ? { licenceNo: f.licenceNo } : {}),
            },
          })
        }
      >
        <Input label="Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} required />
        <Input
          label="Phone (10 digits)"
          value={f.phone}
          onChange={(v) => setF({ ...f, phone: v.replace(/\D/g, '').slice(0, 10) })}
          inputMode="numeric"
          required
        />
        <div className="field">
          <label htmlFor="lang">App language</label>
          <select
            id="lang"
            className="input"
            value={f.language}
            onChange={(e) => setF({ ...f, language: e.target.value })}
          >
            <option value="hi">Hindi</option>
            <option value="en">English</option>
            <option value="mr">Marathi</option>
          </select>
        </div>
        <Input
          label="Licence no."
          value={f.licenceNo}
          onChange={(v) => setF({ ...f, licenceNo: v })}
        />
      </AddForm>
      <table className="table">
        <thead>
          <tr>
            <th>Driver</th>
            <th>Phone</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {(master.data?.drivers ?? []).map((d) => (
            <tr key={d.id}>
              <td>{d.name}</td>
              <td className="mono">{d.phone}</td>
              <td>{d.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Documents() {
  const master = useMaster();
  const docs = useQuery({
    queryKey: ['documents'],
    queryFn: () =>
      api<
        {
          id: string;
          entity: string;
          entity_id: string;
          doc_type: string;
          number: string | null;
          expires_at: string | null;
        }[]
      >('/v1/admin/documents'),
  });
  const [f, setF] = useState({ target: '', docType: 'licence', number: '', expiresAt: '' });
  const name = (entity: string, id: string) =>
    entity === 'driver'
      ? master.data?.drivers.find((d) => d.id === id)?.name
      : master.data?.vehicles.find((v) => v.id === id)?.regNo;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <AddForm
        title="Add document (expired ones are excluded from dispatch)"
        onSubmit={() => {
          const [entity, entityId] = f.target.split(':');
          return api('/v1/admin/documents', {
            method: 'POST',
            json: {
              entity,
              entityId,
              docType: f.docType,
              ...(f.number ? { number: f.number } : {}),
              ...(f.expiresAt ? { expiresAt: f.expiresAt } : {}),
            },
          });
        }}
      >
        <div className="field">
          <label htmlFor="target">For</label>
          <select
            id="target"
            className="input"
            value={f.target}
            onChange={(e) => setF({ ...f, target: e.target.value })}
            required
          >
            <option value="">Select…</option>
            <optgroup label="Drivers">
              {(master.data?.drivers ?? []).map((d) => (
                <option key={d.id} value={`driver:${d.id}`}>
                  {d.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Trucks">
              {(master.data?.vehicles ?? []).map((v) => (
                <option key={v.id} value={`vehicle:${v.id}`}>
                  {v.regNo}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div className="field">
          <label htmlFor="dtype">Document</label>
          <select
            id="dtype"
            className="input"
            value={f.docType}
            onChange={(e) => setF({ ...f, docType: e.target.value })}
          >
            {['licence', 'port_pass', 'permit', 'fitness', 'insurance', 'puc'].map((d) => (
              <option key={d} value={d}>
                {d.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <Input label="Number" value={f.number} onChange={(v) => setF({ ...f, number: v })} />
        <Input
          label="Expires on"
          value={f.expiresAt}
          onChange={(v) => setF({ ...f, expiresAt: v })}
          type="date"
        />
      </AddForm>
      <table className="table">
        <thead>
          <tr>
            <th>For</th>
            <th>Document</th>
            <th>Number</th>
            <th>Expires</th>
          </tr>
        </thead>
        <tbody>
          {(docs.data ?? []).map((d) => {
            const exp = d.expires_at?.slice(0, 10);
            return (
              <tr key={d.id}>
                <td>{name(d.entity, d.entity_id)}</td>
                <td>{d.doc_type.replace('_', ' ')}</td>
                <td className="mono">{d.number ?? '—'}</td>
                <td>
                  {exp ? (
                    <span className={`pill ${exp < today ? 'red' : 'gray'}`}>{exp}</span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function Settings() {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<Record<string, unknown>>('/v1/admin/settings'),
  });
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  useEffect(() => {
    if (settings.data) setText(JSON.stringify(settings.data, null, 2));
  }, [settings.data]);
  return (
    <div className="card">
      <h3 style={{ fontSize: 15, marginBottom: 6 }}>Operating policy</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Overrides on top of the defaults: exception thresholds (<code>exceptions</code>), dispatch
        weights and battery reserve (<code>dispatch</code>), autonomy level per decision (
        <code>autonomy</code>: suggest / propose / auto). Leave empty to use defaults.
      </p>
      {msg && <div className={`banner ${msg.kind}`}>{msg.text}</div>}
      <textarea
        className="input mono"
        style={{ height: 260 }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      <div className="row" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="btn green"
          onClick={async () => {
            try {
              await api('/v1/admin/settings', { method: 'PUT', json: JSON.parse(text || '{}') });
              setMsg({ kind: 'ok', text: 'Saved. Takes effect on the next check.' });
              await qc.invalidateQueries({ queryKey: ['settings'] });
            } catch (err) {
              setMsg({
                kind: 'error',
                text: err instanceof ApiError ? err.message : 'Not valid JSON',
              });
            }
          }}
        >
          Save policy
        </button>
      </div>
    </div>
  );
}
