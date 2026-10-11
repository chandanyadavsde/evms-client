import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api';
import { useAuth } from '../auth';

const SCENE_STEPS = ['At gate', 'Pickup', 'Gate-out', 'In transit', 'Drop', 'Closed'];

export function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [identifier, setIdentifier] = useState('');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ sent: boolean; devHint?: string }>('/v1/auth/otp/request', {
        method: 'POST',
        json: { identifier },
      });
      setHint(r.devHint ?? null);
      setStep(2);
      setTimeout(() => boxes.current[0]?.focus(), 50);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the code');
    } finally {
      setBusy(false);
    }
  }

  async function verify(code: string) {
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ token: string; user: { roles: string[] } }>('/v1/auth/otp/verify', {
        method: 'POST',
        json: { identifier, code },
      });
      await signIn(r.token);
      navigate(r.user.roles.includes('driver') && r.user.roles.length === 1 ? '/driver' : '/', {
        replace: true,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in');
      setDigits(['', '', '', '', '', '']);
      boxes.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  }

  function setDigit(i: number, raw: string) {
    const v = raw.replace(/\D/g, '');
    const next = [...digits];
    if (v.length > 1) {
      v.slice(0, 6 - i)
        .split('')
        .forEach((ch, j) => {
          next[i + j] = ch;
        });
    } else next[i] = v;
    setDigits(next);
    const filled = next.findIndex((d) => !d);
    if (filled === -1) void verify(next.join(''));
    else if (v && i < 5) boxes.current[Math.min(i + v.length, 5)]?.focus();
  }

  return (
    <div className="login">
      <section className="login-scene">
        <div>
          <span className="eyebrow">
            <span className="live-dot" />
            JNPA · Mumbai
          </span>
          <h1>
            Every container,
            <br />
            port to <em>CFS</em>.
          </h1>
          <p>
            Plan, dispatch and follow every EV truck, document and LR — one system for every
            client's flow.
          </p>
        </div>
        <div className="scene-tracker">
          <div
            className="tracker"
            style={{ gridTemplateColumns: `repeat(${SCENE_STEPS.length}, 1fr)` }}
          >
            {SCENE_STEPS.map((s, i) => (
              <div key={s} className={`tstep ${i < 2 ? 'done' : i === 2 ? 'active' : ''}`}>
                <div className="rail">
                  <span />
                </div>
                <div className="lbl">
                  <em>{String(i + 1).padStart(2, '0')}</em>
                  {s}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <main className="login-form">
        <div className="login-card">
          {step === 1 ? (
            <form onSubmit={requestCode}>
              <h2>Welcome back</h2>
              <p className="lead">
                Sign in with your work email, or your phone number if you are a driver. We'll send a
                one-time code.
              </p>
              <div className="field">
                <label htmlFor="id">Work email or phone</label>
                <input
                  id="id"
                  className={`input ${error ? 'invalid' : ''}`}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="name@sorigin.co or 98XXXXXXXX"
                  autoComplete="username"
                  required
                />
                {error && <span className="err">{error}</span>}
              </div>
              <button className="btn block" type="submit" disabled={busy || !identifier.trim()}>
                {busy ? 'Sending…' : 'Send code'}
              </button>
              <p className="faint" style={{ marginTop: 18, fontSize: 12.5 }}>
                Codes expire after 10 minutes and work only once.
              </p>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void verify(digits.join(''));
              }}
            >
              <h2>Enter your code</h2>
              <p className="lead">
                We sent a 6-digit code to <b>{identifier}</b>.{' '}
                <button type="button" className="link-btn" onClick={() => setStep(1)}>
                  Change
                </button>
              </p>
              <div className="otp">
                {digits.map((d, i) => (
                  <input
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed six boxes
                    key={i}
                    ref={(el) => {
                      boxes.current[i] = el;
                    }}
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    value={d}
                    aria-label={`Digit ${i + 1}`}
                    onChange={(e) => setDigit(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && !d && i > 0) boxes.current[i - 1]?.focus();
                    }}
                  />
                ))}
              </div>
              {error && <p className="err">{error}</p>}
              <button
                className="btn block"
                type="submit"
                disabled={busy || digits.some((x) => !x)}
                style={{ marginTop: 18 }}
              >
                {busy ? 'Verifying…' : 'Verify & sign in'}
              </button>
              {hint && (
                <p className="faint" style={{ marginTop: 14, fontSize: 12.5 }}>
                  {hint} <code>123456</code>
                </p>
              )}
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
