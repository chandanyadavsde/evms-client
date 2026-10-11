import type { Component, Screen } from '@vms/contracts';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ApiError, type FieldError, fileUrl, uploadFile } from '../api';
import { t } from '../i18n';

const Lang = createContext('en');
const useT = () => {
  const lang = useContext(Lang);
  return (k: Parameters<typeof t>[0], vars?: Record<string, string | number>) => t(k, lang, vars);
};

/**
 * Renders a server-driven Screen. The frontend knows only component types — every label, rule,
 * required flag and action comes from the backend flow config. Flutter implements the same contract.
 */
export function ScreenRenderer({
  screen,
  onAction,
  lang = 'en',
}: {
  screen: Screen;
  onAction: (actionId: string, values: Record<string, unknown>) => Promise<void>;
  /** Language for the app's own words (field labels already come translated). */
  lang?: string;
}) {
  return (
    <Lang.Provider value={lang}>
      <ScreenBody screen={screen} onAction={onAction} />
    </Lang.Provider>
  );
}

function ScreenBody({
  screen,
  onAction,
}: {
  screen: Screen;
  onAction: (actionId: string, values: Record<string, unknown>) => Promise<void>;
}) {
  const tr = useT();
  const initial = Object.fromEntries(
    screen.components.flatMap((c) =>
      'key' in c && c.value !== undefined ? [[c.key, c.value]] : [],
    ),
  );
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const distance = useDistance(screen.geoCheck);

  // A new step resets the form.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the step changes
  useEffect(() => {
    setValues(initial);
    setErrors([]);
    setMessage(null);
  }, [screen.step]);

  const set = (key: string, v: unknown) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setErrors((prev) => prev.filter((e) => e.field !== key));
  };
  const errorOf = (key: string) => errors.find((e) => e.field === key)?.message;

  async function run(actionId: string) {
    setBusy(actionId);
    setMessage(null);
    try {
      await onAction(actionId, values);
      setErrors([]);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        setMessage(err.message);
      } else setMessage(tr('tryAgain'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="screen-card">
      <h3>{screen.title}</h3>
      {screen.geoCheck && distance !== null && distance > screen.geoCheck.radiusM && (
        <div className="banner warn">
          {tr('farAway', { km: (distance / 1000).toFixed(1), m: screen.geoCheck.radiusM })}
        </div>
      )}
      {message && <div className="banner error">{message}</div>}
      {screen.components.map((c, i) => (
        <Field
          key={'key' in c ? c.key : `info-${i}`}
          c={c}
          value={'key' in c ? values[c.key] : undefined}
          error={'key' in c ? errorOf(c.key) : undefined}
          onChange={set}
        />
      ))}
      <div className="actions">
        {screen.actions.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`btn block ${a.style === 'primary' ? 'green' : 'secondary'}`}
            disabled={!!busy}
            onClick={() => run(a.id)}
          >
            {busy === a.id ? tr('saving') : a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({
  c,
  value,
  error,
  onChange,
}: {
  c: Component;
  value: unknown;
  error: string | undefined;
  onChange: (key: string, v: unknown) => void;
}) {
  const tr = useT();
  if (c.type === 'info_card') {
    return (
      <div className="info-card">
        {Object.entries(c.data).map(([k, v]) => (
          <div key={k}>
            <span>{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
    );
  }
  const label = (
    <label htmlFor={c.key}>
      <span>
        {c.label} {c.required && <span className="req">*</span>}
      </span>
      {'aiRead' in c && c.aiRead && <span className="faint">{tr('aiReads')}</span>}
      {'aiExtract' in c && c.aiExtract && <span className="faint">{tr('aiExtracts')}</span>}
    </label>
  );
  const cls = `input ${error ? 'invalid' : ''}`;
  let control: React.ReactNode;
  switch (c.type) {
    case 'text':
      control = (
        <input
          id={c.key}
          className={cls}
          value={String(value ?? '')}
          onChange={(e) => onChange(c.key, e.target.value)}
        />
      );
      break;
    case 'number':
      control = (
        <input
          id={c.key}
          className={cls}
          inputMode="decimal"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) =>
            onChange(c.key, e.target.value === '' ? undefined : Number(e.target.value))
          }
        />
      );
      break;
    case 'date':
      control = (
        <input
          id={c.key}
          type="date"
          className={cls}
          value={String(value ?? '')}
          onChange={(e) => onChange(c.key, e.target.value)}
        />
      );
      break;
    case 'select':
      control = (
        <select
          id={c.key}
          className={cls}
          value={String(value ?? '')}
          onChange={(e) => onChange(c.key, e.target.value)}
        >
          <option value="">{tr('select')}</option>
          {c.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'photo':
    case 'document':
      control = (
        <FileInput
          id={c.key}
          accept={c.type === 'photo' ? 'image/*' : 'image/*,application/pdf'}
          value={value as string | undefined}
          onChange={(k) => onChange(c.key, k)}
        />
      );
      break;
    case 'signature':
      control = (
        <SignaturePad value={value as string | undefined} onChange={(k) => onChange(c.key, k)} />
      );
      break;
  }
  return (
    <div className="field">
      {label}
      {control}
      {error && <span className="err">{error}</span>}
    </div>
  );
}

function FileInput({
  id,
  accept,
  value,
  onChange,
}: {
  id: string;
  accept: string;
  value?: string;
  onChange: (key: string) => void;
}) {
  const tr = useT();
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="upload">
      {value && /\.(jpe?g|png|webp)$/i.test(value) && <img src={fileUrl(value)} alt="" />}
      <input
        id={id}
        type="file"
        accept={accept}
        capture="environment"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setUploading(true);
          setFailed(false);
          try {
            onChange(await uploadFile(file, file.name));
          } catch {
            setFailed(true);
          } finally {
            setUploading(false);
          }
        }}
      />
      <span className="faint">
        {uploading ? tr('uploading') : failed ? tr('uploadFailed') : value ? tr('uploaded') : ''}
      </span>
    </div>
  );
}

function SignaturePad({ value, onChange }: { value?: string; onChange: (key: string) => void }) {
  const tr = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const r = canvas.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * canvas.width) / r.width,
      ((e.clientY - r.top) * canvas.height) / r.height,
    ] as const;
  };
  return (
    <div>
      <canvas
        ref={ref}
        className="sig"
        width={600}
        height={200}
        onPointerDown={(e) => {
          const ctx = e.currentTarget.getContext('2d');
          if (!ctx) return;
          drawing.current = true;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.strokeStyle = '#1f2a24';
          ctx.beginPath();
          ctx.moveTo(...point(e));
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext('2d');
          ctx?.lineTo(...point(e));
          ctx?.stroke();
          setDirty(true);
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
      />
      <div className="row" style={{ marginTop: 6 }}>
        <button
          type="button"
          className="btn small secondary"
          onClick={() => {
            const c = ref.current;
            c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
            setDirty(false);
          }}
        >
          {tr('clear')}
        </button>
        <button
          type="button"
          className="btn small"
          disabled={!dirty || saving}
          onClick={() => {
            setSaving(true);
            ref.current?.toBlob(async (blob) => {
              if (blob) onChange(await uploadFile(blob, 'signature.png'));
              setSaving(false);
              setDirty(false);
            }, 'image/png');
          }}
        >
          {saving ? tr('saving') : tr('useSignature')}
        </button>
        {value && !dirty && <span className="faint">{tr('signatureSaved')}</span>}
      </div>
    </div>
  );
}

/** Metres from the device to the step's geo-check point, when the browser shares location. */
function useDistance(geo: Screen['geoCheck']): number | null {
  const [d, setD] = useState<number | null>(null);
  useEffect(() => {
    if (!geo || !('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setD(haversine(p.coords.latitude, p.coords.longitude, geo.lat, geo.lng)),
      () => setD(null),
      { timeout: 5000 },
    );
  }, [geo]);
  return d;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
