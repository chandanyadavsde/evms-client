import type { BoardLeg } from '../../types';

/**
 * Turns a leg's real workflow position into where the truck is in the virtual world.
 * Generic: driven by each step's configured place (`at`) and actor, not by step names,
 * so any client's flow animates correctly.
 */
export type Stage =
  | 'queued' // planned, not started
  | 'arriving' // driving up to the pickup gate
  | 'loading' // inside the pickup place, cargo being loaded
  | 'leaving' // at the pickup gate on the way out
  | 'on_road' // between the two places
  | 'unloading' // inside the drop place
  | 'review' // parked, waiting for the manager
  | 'delivered';

export function stageOf(leg: BoardLeg): Stage {
  if (leg.status === 'planned') return 'queued';
  if (leg.status === 'completed' || leg.status === 'cancelled') return 'delivered';
  const i = leg.steps.findIndex((s) => s.key === leg.currentStep);
  if (i < 0) return 'queued';
  const step = leg.steps[i];
  const arrival = leg.steps.findIndex((s) => s.at === 'to');
  if (arrival === -1 || i === arrival) return 'on_road';
  if (i < arrival) {
    if (step?.at === 'from') return 'arriving';
    return i === arrival - 1 && i > 0 ? 'leaving' : 'loading';
  }
  return step?.actor === 'manager' ? 'review' : 'unloading';
}

export const STAGE_LABEL: Record<Stage, [string, string]> = {
  queued: ['Planned', 'gray'],
  arriving: ['At gate', 'amber'],
  loading: ['Loading', 'amber'],
  leaving: ['Gate-out', 'orange'],
  on_road: ['On road', 'orange'],
  unloading: ['Unloading', 'amber'],
  review: ['Manager review', 'green'],
  delivered: ['Delivered', 'green'],
};

/** Truck front x position (scene units) for each stage; on_road is interpolated. */
export const X = {
  offscreen: -140,
  originYard: 120,
  originGate: 352,
  roadStart: 420,
  roadEnd: 790,
  destGate: 858,
  destYard: 1068,
};

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const r = (x: number) => (x * Math.PI) / 180;
  const h =
    Math.sin(r(b.lat - a.lat) / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Road km (straight line × 1.35) and expected minutes at 25 km/h — same defaults as dispatch. */
export function routeEstimate(leg: BoardLeg) {
  const { from, to } = leg;
  if (from.lat == null || from.lng == null || to.lat == null || to.lng == null)
    return { km: null, minutes: null };
  const km = haversineKm({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }) * 1.35;
  return { km, minutes: (km / 25) * 60 };
}

/** 0..1 progress along the road while on_road, from time in the step vs expected travel time. */
export function roadProgress(leg: BoardLeg, now: number): number {
  const { minutes } = routeEstimate(leg);
  if (!leg.stepEnteredAt || !minutes) return 0.5;
  const elapsed = (now - new Date(leg.stepEnteredAt).getTime()) / 60000;
  return Math.max(0.03, Math.min(0.95, elapsed / minutes));
}

export function targetX(stage: Stage, leg: BoardLeg, now: number): number {
  switch (stage) {
    case 'queued':
      return X.roadStart + 120; // parked on the road, ready to go in
    case 'arriving':
      return X.originGate + 24; // waiting on the road just outside the gate, facing in
    case 'loading':
      return X.originYard;
    case 'leaving':
      return X.originGate + 30;
    case 'on_road':
      return X.roadStart + (X.roadEnd - X.roadStart) * roadProgress(leg, now);
    case 'unloading':
    case 'review':
    case 'delivered':
      return X.destYard;
  }
}

/** Stable colour per client (label always printed on the container too — never colour alone). */
const CLIENT_COLORS = ['#2F6FB2', '#B4472F', '#1B6B4A', '#8A6A1C', '#6B4FA0', '#3F7F86'];
export function clientColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CLIENT_COLORS[h % CLIENT_COLORS.length] as string;
}
