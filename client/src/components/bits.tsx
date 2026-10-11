import type { BoardLeg } from '../types';

/** Step tracker: done / active / pending — built from the leg's configured flow. */
export function StepTracker({ leg }: { leg: BoardLeg }) {
  const done = leg.status === 'completed';
  return (
    <div
      className="tracker"
      style={{ gridTemplateColumns: `repeat(${Math.max(leg.steps.length, 1)}, minmax(0, 1fr))` }}
    >
      {leg.steps.map((s, i) => {
        const n = i + 1;
        const state =
          done || n < leg.position
            ? 'done'
            : n === leg.position && leg.status === 'active'
              ? 'active'
              : '';
        return (
          <div
            key={s.key}
            className={`tstep ${state} ${s.actor === 'manager' ? 'manager' : ''}`}
            title={s.title}
          >
            <div className="rail">
              <span />
            </div>
            <div className="lbl">
              <em>{String(n).padStart(2, '0')}</em>
              {s.title}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Soc({ value }: { value: number | null }) {
  if (value === null) return <span className="soc faint">SOC —</span>;
  return (
    <span className={`soc ${value < 30 ? 'low' : ''}`} title="Battery state of charge">
      <span className="bar">
        <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </span>
      {Math.round(value)}%
    </span>
  );
}

const STATUS: Record<string, [string, string]> = {
  pending: ['Pending', 'gray'],
  planned: ['Planned', 'amber'],
  in_progress: ['In progress', 'orange'],
  active: ['Active', 'orange'],
  completed: ['Completed', 'green'],
  cancelled: ['Cancelled', 'red'],
  pre_lr: ['Pre-LR', 'gray'],
  issued: ['Issued', 'amber'],
  closed: ['Closed', 'green'],
  billable: ['Billable', 'green'],
  pushed: ['Pushed', 'green'],
};

export function StatusPill({ status }: { status: string }) {
  const [label, tone] = STATUS[status] ?? [status, 'gray'];
  return <span className={`pill ${tone}`}>{label}</span>;
}

export function time(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
