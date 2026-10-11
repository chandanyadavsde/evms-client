/** Response shapes of the API (kept by hand until OpenAPI types are generated). */

export interface Me {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  language: string;
  roles: ('admin' | 'manager' | 'driver')[];
  driverId: string | null;
}

export interface Master {
  clients: { id: string; code: string; name: string; aliases: string[] }[];
  locations: {
    id: string;
    code: string;
    name: string;
    type: string;
    typeName: string;
    lat: number | null;
    lng: number | null;
    charging: { available?: boolean; chargers?: number };
    aliases: string[];
  }[];
  jobTypes: {
    id: string;
    code: string;
    name: string;
    fromType: string;
    toType: string;
    /** Switched-off trip types are hidden when planning. */
    active: boolean;
  }[];
  cargoTypes: {
    id: string;
    code: string;
    name: string;
    uses: Record<string, number>;
    attributes: { size?: string };
  }[];
  vehicles: {
    id: string;
    regNo: string;
    status: string;
    category: string;
    capacity: Record<string, number>;
    soc: number | null;
    odometer: number | null;
  }[];
  drivers: { id: string; name: string; phone: string; status: string }[];
}

export interface MoveRow {
  id: string;
  status: string;
  /** null until known (created from a portal pendency or a count). */
  containerNumber: string | null;
  size: string;
  cargoTypeCode: string;
  clientName: string;
  clientCode: string;
  jobTypeName: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  readyAt: string | null;
  cutoffAt: string | null;
  createdAt: string;
  portal: {
    status?: string;
    valid_till?: string;
    yard_location?: string;
    hold_reason?: string;
    checkedAt?: string;
  } | null;
}

export interface BoardLeg {
  id: string;
  seq: number;
  kind: 'loaded' | 'empty';
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  startedAt: string | null;
  endedAt: string | null;
  vehicle: { id: string; regNo: string; soc: number | null; odometer: number | null };
  driver: { id: string; name: string };
  from: Place;
  to: Place;
  stepEnteredAt: string | null;
  lastSeenAt: string | null;
  flow: { key: string; version: number; name: string } | null;
  steps: {
    key: string;
    title: string;
    actor: 'driver' | 'manager';
    at: 'from' | 'to' | null;
    slaMinutes: number | null;
    evidence: { key: string; label: string; done: boolean }[];
  }[];
  currentStep: string | null;
  position: number;
  containers: { number: string; size: string; client: string }[];
  lrs: { id: string; number: string | null; status: string; client: string }[];
}

export interface BoardTrip {
  id: string;
  status: string;
  createdAt: string;
  legs: BoardLeg[];
}

export interface LrRow {
  id: string;
  number: string | null;
  status: string;
  clientName: string;
  vehicleRegNo: string;
  tripId: string;
  legSeq: number;
  createdAt: string;
  issuedAt: string | null;
  closedAt: string | null;
  total: string | null;
  netsuiteRef: string | null;
}

export interface TripEvent {
  id: string;
  entity: string;
  type: string;
  payload: Record<string, unknown>;
  at: string;
  actor: string | null;
}

export interface ExceptionRow {
  id: string;
  entity: string;
  entity_id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  proposal: { action?: string; label?: string; phone?: string; moveId?: string; tripId?: string };
  status: string;
  created_at: string;
}

export interface WorkflowRow {
  id: string;
  key: string;
  version: number;
  status: string;
  name: string;
  steps: number;
  scope: string;
  publishedAt: string | null;
}

export interface Place {
  id: string;
  name: string;
  type: string;
  lat: number | null;
  lng: number | null;
  charging: boolean;
}
