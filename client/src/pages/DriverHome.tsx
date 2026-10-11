import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Screen } from '@vms/contracts';
import { api } from '../api';
import { useAuth } from '../auth';
import { Soc, StepTracker } from '../components/bits';
import { ScreenRenderer } from '../components/ScreenRenderer';
import { Shift } from '../components/Shift';
import { t } from '../i18n';
import type { BoardTrip } from '../types';

/**
 * Driver view in the browser — a reference for the Flutter app. It renders exactly the same
 * Screen JSON the mobile app will render.
 */
export function DriverHome() {
  const { me, signOut } = useAuth();
  const lang = me?.language ?? 'en';
  const qc = useQueryClient();
  const trips = useQuery({
    queryKey: ['driver-trips'],
    queryFn: () => api<BoardTrip[]>('/v1/driver/trips'),
    refetchInterval: 10000,
  });
  const trip = trips.data?.[0];
  const leg = trip?.legs.find((l) => l.status === 'active');
  const screen = useQuery({
    queryKey: ['screen', leg?.id],
    queryFn: () => api<{ legStatus: string; screen: Screen | null }>(`/v1/legs/${leg?.id}/screen`),
    enabled: !!leg,
  });
  const myTurn = leg && leg.steps.find((s) => s.key === leg.currentStep)?.actor === 'driver';

  return (
    <div className="driver">
      <div className="driver-top">
        <div>
          <span className="eyebrow">
            <span className="live-dot" />
            {t('onDuty', lang)}
          </span>
          <h2 style={{ fontSize: 22 }}>{me?.name}</h2>
        </div>
        <button type="button" className="btn small secondary" onClick={signOut}>
          {t('signOut', lang)}
        </button>
      </div>

      <Shift lang={lang} />

      {!trips.isLoading && !trip && <div className="card muted">{t('noTrip', lang)}</div>}

      {trip && leg && (
        <>
          <div className="trip" style={{ marginBottom: 12 }}>
            <div className="trip-head">
              <span className="reg">{leg.vehicle.regNo}</span>
              <Soc value={leg.vehicle.soc} />
              <span className="spacer" />
              <span className="faint">{t('legOf', lang, { a: leg.seq, b: trip.legs.length })}</span>
            </div>
            <div className="leg-route">
              {leg.from.name} <span className="arrow">→</span> {leg.to.name}
            </div>
            <div className="step-now">
              <span>
                {leg.position}/{leg.steps.length}
              </span>
              {leg.steps.find((s) => s.key === leg.currentStep)?.title}
            </div>
            <StepTracker leg={leg} />
          </div>

          {myTurn && screen.data?.screen ? (
            <ScreenRenderer
              lang={lang}
              screen={screen.data.screen}
              onAction={async (action, values) => {
                await api(`/v1/legs/${leg.id}/actions/${action}`, {
                  method: 'POST',
                  json: { values },
                });
                await Promise.all(
                  ['driver-trips', 'screen'].map((k) => qc.invalidateQueries({ queryKey: [k] })),
                );
              }}
            />
          ) : (
            <div className="card muted">{t('waitingManager', lang)}</div>
          )}
        </>
      )}
    </div>
  );
}
