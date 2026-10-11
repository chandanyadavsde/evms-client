import { useQuery } from '@tanstack/react-query';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { CircleMarker, MapContainer, Marker, TileLayer, Tooltip } from 'react-leaflet';
import { api } from '../api';
import { Soc, time } from '../components/bits';

interface Vehicle {
  vehicleId: string;
  regNo: string;
  soc: number | null;
  position: { lat: number; lng: number } | null;
  positionSource: 'gps' | 'leg' | 'last_place' | 'none';
  driverName: string | null;
  tripId: string | null;
  freeAt: string;
  freeAt_place: { name: string } | null;
  blockers: string[];
  activeLeg: { from: string; to: string; step: string | null; progress: number } | null;
}
interface Place {
  id: string;
  name: string;
  code: string;
  lat: number | null;
  lng: number | null;
  type: string;
  charging: { available?: boolean; chargers?: number };
}

const truckIcon = (busy: boolean, warn: boolean) =>
  L.divIcon({
    className: '',
    html: `<div class="truck-pin ${busy ? 'busy' : ''} ${warn ? 'warn' : ''}">EV</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

/** The "mini world" on a map: every truck, where it is, what it's doing; every place and charger. */
export function LiveMap() {
  const q = useQuery({
    queryKey: ['fleet-live'],
    queryFn: () => api<{ fleet: Vehicle[]; places: Place[]; at: string }>('/v1/fleet/live'),
    refetchInterval: 15000,
  });
  const places = (q.data?.places ?? []).filter((p) => p.lat !== null && p.lng !== null);
  const fleet = q.data?.fleet ?? [];
  const center: [number, number] = places[0]
    ? [places[0].lat as number, places[0].lng as number]
    : [18.92, 72.95];
  // Trucks at the same place are fanned out slightly so each stays clickable.
  const seen = new Map<string, number>();
  const spread = (p: { lat: number; lng: number }): [number, number] => {
    const k = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return [p.lat + 0.0012 * Math.sin(n * 2.1), p.lng + 0.0012 * Math.cos(n * 2.1)];
  };

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">
            <span className="live-dot" />
            Live · {q.data ? `updated ${time(q.data.at)}` : 'loading'}
          </span>
          <h1>Live map</h1>
          <p>
            Trucks from phone GPS where available, otherwise from their trip progress. Green rings =
            charging hubs.
          </p>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 14 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden', height: 560 }}>
          <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {places.map((p) => (
              <CircleMarker
                key={p.id}
                center={[p.lat as number, p.lng as number]}
                radius={p.charging.available ? 11 : 8}
                pathOptions={{
                  color: p.charging.available ? '#1B6B4A' : '#6B756F',
                  weight: 2,
                  fillColor: '#ffffff',
                  fillOpacity: 0.9,
                }}
              >
                <Tooltip direction="top">
                  <b>{p.name}</b>
                  {p.charging.available ? ` · ${p.charging.chargers ?? '?'} chargers` : ''}
                </Tooltip>
              </CircleMarker>
            ))}
            {fleet
              .filter((v) => v.position)
              .map((v) => (
                <Marker
                  key={v.vehicleId}
                  position={spread(v.position as { lat: number; lng: number })}
                  icon={truckIcon(!!v.tripId, !!v.blockers.length || (v.soc ?? 100) < 25)}
                >
                  <Tooltip direction="top">
                    <b>{v.regNo}</b> · {v.soc ?? '—'}%<br />
                    {v.activeLeg
                      ? `${v.activeLeg.from} → ${v.activeLeg.to} (${v.activeLeg.progress}%)`
                      : 'Idle'}
                    <br />
                    <span style={{ color: '#6B756F' }}>position: {v.positionSource}</span>
                  </Tooltip>
                </Marker>
              ))}
          </MapContainer>
        </div>
        <div className="grid" style={{ alignContent: 'start' }}>
          {fleet.map((v) => (
            <div key={v.vehicleId} className="card" style={{ padding: '10px 12px' }}>
              <div className="row">
                <b>{v.regNo}</b>
                <Soc value={v.soc} />
                <span className="spacer" />
                <span className={`pill ${v.tripId ? 'orange' : 'green'}`}>
                  {v.tripId ? 'On trip' : 'Free'}
                </span>
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>
                {v.activeLeg
                  ? `${v.activeLeg.from} → ${v.activeLeg.to} · ${v.activeLeg.step?.replace(/_/g, ' ')}`
                  : (v.driverName ?? 'No free driver')}
                {v.tripId && v.freeAt_place
                  ? ` · free at ${v.freeAt_place.name} ~${time(v.freeAt)}`
                  : ''}
              </div>
              {!!v.blockers.length && (
                <div className="err" style={{ fontSize: 12 }}>
                  {v.blockers.join('; ')}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
