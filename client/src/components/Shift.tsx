import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../api';
import { t } from '../i18n';

interface Truck {
  id: string;
  regNo: string;
  odometer: number | null;
  soc: number | null;
  assigned: boolean;
}

/**
 * Shift start/end with readings (the handover record), and phone GPS while on duty.
 * The Flutter app implements the same calls; this is the working reference.
 */
export function Shift({ lang }: { lang: string }) {
  const qc = useQueryClient();
  const shift = useQuery({
    queryKey: ['shift'],
    queryFn: () => api<{ id: string; reg_no: string | null } | null>('/v1/driver/shift'),
  });
  const trucks = useQuery({
    queryKey: ['driver-trucks'],
    queryFn: () => api<Truck[]>('/v1/driver/trucks'),
    enabled: shift.data === null,
  });
  const [truckId, setTruckId] = useState('');
  const [odometer, setOdometer] = useState('');
  const [soc, setSoc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const onDuty = !!shift.data;
  useGpsWhile(onDuty);

  useEffect(() => {
    const only = trucks.data?.length === 1 ? trucks.data[0] : undefined;
    if (only) setTruckId(only.id);
  }, [trucks.data]);

  if (shift.isLoading) return null;
  const truck = trucks.data?.find((x) => x.id === truckId);

  async function submit(path: 'start' | 'end') {
    setError(null);
    try {
      await api(`/v1/driver/shift/${path}`, {
        method: 'POST',
        json: {
          ...(path === 'start' ? { vehicleId: truckId } : {}),
          odometer: Number(odometer),
          soc: Number(soc),
        },
      });
      setOdometer('');
      setSoc('');
      await Promise.all(
        ['shift', 'driver-trips', 'driver-trucks'].map((k) =>
          qc.invalidateQueries({ queryKey: [k] }),
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('tryAgain', lang));
    }
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row" style={{ marginBottom: 8 }}>
        <b>
          {onDuty ? `${t('shiftOn', lang)} · ${shift.data?.reg_no ?? ''}` : t('startShift', lang)}
        </b>
        <span className="spacer" />
        {onDuty && <span className="pill green">GPS</span>}
      </div>
      {error && <div className="banner error">{error}</div>}
      {!onDuty && (
        <div className="field">
          <select className="input" value={truckId} onChange={(e) => setTruckId(e.target.value)}>
            <option value="">{t('select', lang)}</option>
            {(trucks.data ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.regNo}
                {x.assigned ? ' ★' : ''}
              </option>
            ))}
          </select>
          {truck?.odometer != null && (
            <span className="faint" style={{ fontSize: 12 }}>
              {t('lastReading', lang)}: {truck.odometer} km
            </span>
          )}
        </div>
      )}
      <div className="row">
        <input
          className="input"
          style={{ flex: 1 }}
          inputMode="decimal"
          placeholder={t('odometerKm', lang)}
          value={odometer}
          onChange={(e) => setOdometer(e.target.value)}
        />
        <input
          className="input"
          style={{ width: 110 }}
          inputMode="decimal"
          placeholder={t('batteryPct', lang)}
          value={soc}
          onChange={(e) => setSoc(e.target.value)}
        />
      </div>
      <button
        type="button"
        className={`btn block ${onDuty ? 'secondary' : 'green'}`}
        style={{ marginTop: 10 }}
        disabled={!odometer || !soc || (!onDuty && !truckId)}
        onClick={() => submit(onDuty ? 'end' : 'start')}
      >
        {onDuty ? t('endShift', lang) : t('startShift', lang)}
      </button>
    </div>
  );
}

/** Sends the phone's position at most once a minute while on duty. */
function useGpsWhile(active: boolean) {
  const last = useRef(0);
  useEffect(() => {
    if (!active || !('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (Date.now() - last.current < 60_000) return;
        last.current = Date.now();
        api('/v1/driver/location', {
          method: 'POST',
          json: {
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            speedKmh: p.coords.speed ? p.coords.speed * 3.6 : undefined,
          },
        }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active]);
}
