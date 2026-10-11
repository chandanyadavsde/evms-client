import { useEffect, useRef, useState } from 'react';
import type { BoardLeg } from '../../types';
import { clientColor, STAGE_LABEL, type Stage, stageOf, targetX } from './stage';

/**
 * The "virtual world": the leg's two real places drawn by type (port terminal, CFS…),
 * the road between them, and the truck placed by the leg's actual workflow step.
 * Pickup on the left, drop on the right; everything animates from live data.
 */

const W = 1200;
const H = 520;
const GROUND = 440;
const ORIGIN_GATE = 350;
const DEST_GATE = 850;
const TRUCK_LEN = 205;
const CAB = 52;

type Side = 'left' | 'right';

/** Mirror helpers: drawings are authored for the left side and mirrored for the right. */
const mx = (side: Side, x: number) => (side === 'left' ? x : W - x);
const mrect = (side: Side, x: number, w: number) => (side === 'left' ? x : W - x - w);

function useClock(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return now;
}

const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function LiveScene({ leg }: { leg: BoardLeg }) {
  const motion = !reduceMotion();
  const now = useClock(motion);
  const stage = stageOf(leg);
  const facingLeft = stage === 'arriving' || stage === 'loading' || stage === 'queued';
  const target = targetX(stage, leg, now);

  // Smoothly glide the truck toward where the data says it is.
  const xRef = useRef(target);
  const last = useRef(now);
  const dt = Math.min(0.1, (now - last.current) / 1000);
  last.current = now;
  const prev = xRef.current;
  xRef.current = motion ? prev + (target - prev) * Math.min(1, dt * 1.6) : target;
  const x = xRef.current;
  const moving = Math.abs(target - x) > 0.5 || stage === 'on_road';
  const speedFactor = stage === 'on_road' ? 1 : Math.min(1, Math.abs(target - x) / 40);

  const loaded = leg.kind === 'loaded';
  const t = now / 1000;
  const cycle = (t % 6) / 6; // 6-second loading/unloading loop
  const showOnTrailer = loaded && (stage === 'leaving' || stage === 'on_road');
  const handling = loaded && (stage === 'loading' || stage === 'unloading');
  const barrierUpOrigin = stage === 'leaving' || (stage === 'arriving' && false);
  const barrierUpDest = stage === 'on_road' && x > DEST_GATE - 120;
  const [label, tone] = STAGE_LABEL[stage];

  const containers = leg.containers.length ? leg.containers : [];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="scene"
      role="img"
      aria-label={`${leg.vehicle.regNo}: ${label} — ${leg.from.name} to ${leg.to.name}`}
    >
      <defs>
        <linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#DDE7E6" />
          <stop offset="0.55" stopColor="#EEF0EA" />
          <stop offset="1" stopColor="#F3EFE6" />
        </linearGradient>
        <linearGradient id="sc-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B9D2DE" />
          <stop offset="1" stopColor="#8FB3C6" />
        </linearGradient>
        <linearGradient id="sc-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E6DCCB" />
          <stop offset="1" stopColor="#EFE8DA" />
        </linearGradient>
        <linearGradient id="sc-cab" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F58A45" />
          <stop offset="1" stopColor="#DD5C14" />
        </linearGradient>
        <linearGradient id="sc-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E7F0F2" />
          <stop offset="1" stopColor="#7F969C" />
        </linearGradient>
        <radialGradient id="sc-sun">
          <stop offset="0" stopColor="#FFF4E2" />
          <stop offset="1" stopColor="#FCE3C4" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sc-glow">
          <stop offset="0" stopColor="#7FD1A4" stopOpacity="0.9" />
          <stop offset="1" stopColor="#7FD1A4" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* sky, sun, clouds */}
      <rect width={W} height={GROUND} fill="url(#sc-sky)" />
      <circle cx="600" cy="110" r="110" fill="url(#sc-sun)" />
      <circle cx="600" cy="110" r="24" fill="#FFF7EA" opacity="0.9" />
      <Clouds t={motion ? t : 0} />

      {/* far hills */}
      <path
        d={`M0 ${GROUND - 40} C 200 ${GROUND - 70}, 380 ${GROUND - 30}, 600 ${GROUND - 55} C 820 ${GROUND - 80}, 1000 ${GROUND - 35}, 1200 ${GROUND - 60} L1200 ${GROUND} L0 ${GROUND} Z`}
        fill="#D3DED7"
      />

      {/* places */}
      <Place side="left" type={leg.from.type} name={leg.from.name} charging={leg.from.charging} />
      <Place side="right" type={leg.to.type} name={leg.to.name} charging={leg.to.charging} />

      {/* ground + road */}
      <rect y={GROUND} width={W} height={H - GROUND} fill="url(#sc-ground)" />
      <rect y={GROUND + 4} width={W} height="56" fill="#CFC6B6" />
      <line
        x1="0"
        x2={W}
        y1={GROUND + 32}
        y2={GROUND + 32}
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeDasharray="26 18"
        opacity="0.85"
        strokeDashoffset={motion && stage === 'on_road' ? -((t * 60) % 44) : 0}
      />
      <RoadSign leg={leg} />

      {/* gates (in front of the road edge) */}
      <Gate
        side="left"
        x={ORIGIN_GATE}
        name={leg.from.name}
        up={barrierUpOrigin || stage === 'loading'}
      />
      <Gate
        side="right"
        x={DEST_GATE}
        name={leg.to.name}
        up={barrierUpDest || stage === 'unloading' || stage === 'review' || stage === 'delivered'}
      />

      {/* cargo handling at the place */}
      {handling && (
        <Handling
          stage={stage}
          cycle={motion ? cycle : 0.95}
          truckX={x}
          facingLeft={facingLeft}
          placeType={stage === 'loading' ? leg.from.type : leg.to.type}
          color={clientColor(containers[0]?.client ?? '')}
          big={containers[0]?.size === '40ft'}
        />
      )}

      {/* the truck */}
      <Truck
        x={x}
        facingLeft={facingLeft}
        moving={motion && moving}
        speed={speedFactor}
        t={t}
        containers={
          showOnTrailer || (handling && stage === 'loading' && cycle >= 0.8) ? containers : []
        }
      />

      {/* status callout above the truck (like the login concept) */}
      <Callout
        x={facingLeft ? x + 60 : x - 60}
        reg={leg.vehicle.regNo}
        label={label}
        tone={tone}
        sub={sublineFor(stage, leg)}
      />

      {stage === 'review' && (
        <g transform={`translate(${x - 120} ${GROUND - 120})`}>
          <rect width="26" height="32" rx="3" fill="#fff" stroke="#9A6412" />
          <path d="M6 10h14M6 16h14M6 22h9" stroke="#9A6412" strokeWidth="2" />
        </g>
      )}
    </svg>
  );
}

function sublineFor(stage: Stage, leg: BoardLeg): string {
  const lr = leg.lrs.find((l) => l.number)?.number;
  switch (stage) {
    case 'queued':
      return 'Waiting to start';
    case 'arriving':
      return `Gate-in at ${short(leg.from.name)}`;
    case 'loading':
      return leg.kind === 'loaded' ? 'Container on hook' : 'Checking in';
    case 'leaving':
    case 'on_road':
      return lr ? `${lr} · → ${short(leg.to.name)}` : `→ ${short(leg.to.name)}`;
    case 'unloading':
      return `Unloading at ${short(leg.to.name)}`;
    case 'review':
      return 'Waiting for manager';
    case 'delivered':
      return lr ? `${lr} · delivered` : 'Delivered';
  }
}

const short = (s: string) => s.split(/[,(]/)[0]?.trim() ?? s;

function Clouds({ t }: { t: number }) {
  const drift = (speed: number, range: number) => Math.sin(t / speed) * range;
  return (
    <g fill="#FFFFFF" opacity="0.85">
      {[
        [140, 90, 1.3, 40, 30],
        [470, 150, 0.9, 30, 25],
        [860, 80, 1.1, 50, 35],
        [1040, 160, 0.7, 26, 22],
      ].map(([cx, cy, s, sp, r]) => (
        <path
          key={`${cx}`}
          transform={`translate(${(cx as number) + drift(sp as number, r as number)} ${cy}) scale(${s})`}
          d="M0 20 C 0 9, 11 3, 20 7 C 24 -3, 42 -5, 48 6 C 58 2, 70 9, 68 20 Z"
        />
      ))}
    </g>
  );
}

function RoadSign({ leg }: { leg: BoardLeg }) {
  return (
    <g transform="translate(560 368)">
      <rect x="-2" y="20" width="4" height="52" fill="#7D8682" />
      <rect
        x="-72"
        y="-6"
        width="144"
        height="34"
        rx="5"
        fill="#1B6B4A"
        stroke="#fff"
        strokeWidth="2"
      />
      <text
        x="0"
        y="16"
        textAnchor="middle"
        fill="#fff"
        fontFamily="Manrope, sans-serif"
        fontSize="12"
        fontWeight="800"
      >
        → {short(leg.to.name)}
      </text>
    </g>
  );
}

function Gate({ x, name, up, side }: { x: number; name: string; up: boolean; side: Side }) {
  const booth = side === 'left' ? x + 38 : x - 60;
  return (
    <g>
      <rect x={x - 34} y={GROUND - 74} width="6" height="78" fill="#6E7E84" />
      <rect x={x + 28} y={GROUND - 74} width="6" height="78" fill="#6E7E84" />
      <rect
        x={x - 42}
        y={GROUND - 92}
        width="84"
        height="20"
        rx="3"
        fill="#F0C35A"
        stroke="#A9832A"
      />
      <text
        x={x}
        y={GROUND - 78}
        textAnchor="middle"
        fill="#4A3708"
        fontFamily="Inter, sans-serif"
        fontSize="9"
        fontWeight="800"
        letterSpacing="0.8"
      >
        GATE · {short(name).toUpperCase().slice(0, 12)}
      </text>
      {/* booth */}
      <rect
        x={booth}
        y={GROUND - 40}
        width="22"
        height="40"
        rx="2"
        fill="#E6EAEA"
        stroke="#6E7E84"
      />
      <rect x={booth + 4} y={GROUND - 34} width="14" height="10" fill="url(#sc-glass)" />
      {/* barrier arm */}
      <g
        transform={`rotate(${up ? 72 : 0} ${x + 30} ${GROUND - 6})`}
        style={{ transition: 'transform 0.8s' }}
      >
        <rect x={x - 34} y={GROUND - 9} width="66" height="6" rx="3" fill="#fff" stroke="#C8412B" />
        <path
          d={`M${x - 26} ${GROUND - 9}v6M${x - 12} ${GROUND - 9}v6M${x + 2} ${GROUND - 9}v6M${x + 16} ${GROUND - 9}v6`}
          stroke="#C8412B"
          strokeWidth="5"
        />
      </g>
    </g>
  );
}

function Place({
  side,
  type,
  name,
  charging,
}: {
  side: Side;
  type: string;
  name: string;
  charging: boolean;
}) {
  const r = (x: number, w: number) => mrect(side, x, w);
  const isPort = type === 'PORT_TERMINAL';
  const isCfs = type === 'CFS';
  return (
    <g>
      {isPort && (
        <g>
          {/* sea and ship */}
          <rect x={r(0, 120)} y={GROUND - 110} width="120" height="110" fill="url(#sc-sea)" />
          <path
            d={`M${mx(side, 8)} ${GROUND - 52} L${mx(side, 112)} ${GROUND - 52} L${mx(side, 104)} ${GROUND - 26} L${mx(side, 16)} ${GROUND - 26} Z`}
            fill="#4A565B"
          />
          {[0, 1, 2].map((row) =>
            [0, 1, 2, 3].map((col) => (
              <rect
                key={`${row}-${col}`}
                x={r(18 + col * 22, 20)}
                y={GROUND - 66 - row * 12}
                width="20"
                height="11"
                fill={['#2F6FB2', '#B4472F', '#1B6B4A', '#8A6A1C'][(row + col) % 4]}
                opacity="0.9"
              />
            )),
          )}
          {/* quay crane (STS) */}
          <g stroke="#6E7E84" strokeWidth="3" fill="none">
            <path
              d={`M${mx(side, 230)} ${GROUND} L${mx(side, 236)} ${GROUND - 190} M${mx(side, 300)} ${GROUND} L${mx(side, 294)} ${GROUND - 190}`}
            />
            <path
              d={`M${mx(side, 233)} ${GROUND - 60} L${mx(side, 297)} ${GROUND - 60}`}
              strokeWidth="2"
            />
          </g>
          <rect
            x={r(20, 300)}
            y={GROUND - 200}
            width="300"
            height="12"
            fill="#E6EAEA"
            stroke="#6E7E84"
            strokeWidth="2"
          />
          <rect
            x={r(196, 140)}
            y={GROUND - 226}
            width="140"
            height="26"
            rx="3"
            fill="#F0C35A"
            stroke="#A9832A"
          />
          <text
            x={mx(side, 266)}
            y={GROUND - 208}
            textAnchor="middle"
            fill="#4A3708"
            fontFamily="Manrope, sans-serif"
            fontSize="11"
            fontWeight="800"
            letterSpacing="0.4"
          >
            {short(name).toUpperCase().slice(0, 18)}
          </text>
          {/* container stacks in the yard */}
          {[0, 1].map((row) => (
            <rect
              key={row}
              x={r(130, 46)}
              y={GROUND - 16 - row * 16}
              width="46"
              height="15"
              fill={row ? '#2F6FB2' : '#8A6A1C'}
              stroke="#fff"
              strokeWidth="1"
            />
          ))}
        </g>
      )}
      {isCfs && (
        <g>
          {/* warehouse shed */}
          <path
            d={`M${mx(side, 30)} ${GROUND} L${mx(side, 30)} ${GROUND - 92} L${mx(side, 125)} ${GROUND - 132} L${mx(side, 220)} ${GROUND - 92} L${mx(side, 220)} ${GROUND} Z`}
            fill="#E9E4DA"
            stroke="#9AA29D"
            strokeWidth="2"
          />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect
                x={r(48 + i * 58, 42)}
                y={GROUND - 62}
                width="42"
                height="62"
                fill="#C9D1D2"
                stroke="#8B989C"
              />
              {[0, 1, 2, 3, 4, 5].map((j) => (
                <line
                  key={j}
                  x1={mx(side, 48 + i * 58)}
                  x2={mx(side, 90 + i * 58)}
                  y1={GROUND - 54 + j * 9}
                  y2={GROUND - 54 + j * 9}
                  stroke="#A9B4B6"
                />
              ))}
            </g>
          ))}
          <rect x={r(55, 140)} y={GROUND - 92} width="140" height="22" rx="3" fill="#1B6B4A" />
          <text
            x={mx(side, 125)}
            y={GROUND - 77}
            textAnchor="middle"
            fill="#fff"
            fontFamily="Manrope, sans-serif"
            fontSize="11"
            fontWeight="800"
            letterSpacing="0.6"
          >
            {short(name).toUpperCase().slice(0, 18)}
          </text>
          {/* container stacks */}
          {[0, 1, 2].map((row) => (
            <rect
              key={row}
              x={r(270, 50)}
              y={GROUND - 16 - row * 16}
              width="50"
              height="15"
              fill={['#B4472F', '#3F7F86', '#6B4FA0'][row]}
              stroke="#fff"
            />
          ))}
          {/* EV chargers */}
          {charging &&
            [0, 1].map((i) => (
              <g key={i}>
                <circle
                  cx={mx(side, 234 + i * 20)}
                  cy={GROUND - 22}
                  r="16"
                  fill="url(#sc-glow)"
                  opacity="0.6"
                />
                <rect
                  x={r(228 + i * 20, 12)}
                  y={GROUND - 36}
                  width="12"
                  height="36"
                  rx="3"
                  fill="#1B6B4A"
                />
                <path
                  d={`M${mx(side, 235 + i * 20)} ${GROUND - 31} l-3 7 h4 l-3 7`}
                  stroke="#fff"
                  strokeWidth="1.6"
                  fill="none"
                />
              </g>
            ))}
        </g>
      )}
      {!isPort && !isCfs && (
        <g>
          {[0, 1, 2].map((row) =>
            [0, 1, 2].map((col) => (
              <rect
                key={`${row}${col}`}
                x={r(60 + col * 62, 58)}
                y={GROUND - 18 - row * 17}
                width="58"
                height="16"
                fill={['#8A6A1C', '#2F6FB2', '#B4472F'][(row + col) % 3]}
                stroke="#fff"
              />
            )),
          )}
        </g>
      )}
    </g>
  );
}

/** Crane (port) or reach stacker (CFS) moving a container on/off the trailer, looping. */
function Handling({
  stage,
  cycle,
  truckX,
  facingLeft,
  placeType,
  color,
  big,
}: {
  stage: Stage;
  cycle: number;
  truckX: number;
  facingLeft: boolean;
  placeType: string;
  color: string;
  big: boolean;
}) {
  const side: Side = stage === 'loading' ? 'left' : 'right';
  const trailerCenter = facingLeft
    ? truckX + CAB + (TRUCK_LEN - CAB) / 2
    : truckX - CAB - (TRUCK_LEN - CAB) / 2;
  const w = big ? 128 : 62;
  const deckY = GROUND - 42;
  const source =
    placeType === 'PORT_TERMINAL'
      ? { x: mx(side, 60), y: GROUND - 80 }
      : { x: mx(side, 295), y: GROUND - 48 };
  // loading: source → trailer; unloading: trailer → source
  const [from, to] =
    stage === 'loading'
      ? [source, { x: trailerCenter, y: deckY }]
      : [{ x: trailerCenter, y: deckY }, source];
  const liftY = GROUND - 175;
  let cx: number;
  let cy: number;
  if (cycle < 0.25) {
    const p = cycle / 0.25;
    cx = from.x;
    cy = from.y + (liftY - from.y) * ease(p);
  } else if (cycle < 0.6) {
    const p = (cycle - 0.25) / 0.35;
    cx = from.x + (to.x - from.x) * ease(p);
    cy = liftY;
  } else if (cycle < 0.8) {
    const p = (cycle - 0.6) / 0.2;
    cx = to.x;
    cy = liftY + (to.y - liftY) * ease(p);
  } else {
    cx = to.x;
    cy = to.y;
  }
  const hanging = cycle < 0.8;
  const isPort = placeType === 'PORT_TERMINAL';
  return (
    <g>
      {isPort ? (
        <g>
          {/* trolley on the crane beam + cables */}
          <rect x={cx - 18} y={GROUND - 204} width="36" height="14" rx="2" fill="#4A565B" />
          {hanging && (
            <line
              x1={cx}
              x2={cx}
              y1={GROUND - 190}
              y2={cy - 24}
              stroke="#56625E"
              strokeWidth="1.5"
            />
          )}
          {hanging && (
            <rect
              x={cx - w / 2 - 4}
              y={cy - 26}
              width={w + 8}
              height="6"
              rx="2"
              fill="#E3AE45"
              stroke="#A9832A"
            />
          )}
        </g>
      ) : (
        <g>
          {/* reach stacker */}
          <rect
            x={cx + (side === 'left' ? 34 : -84)}
            y={GROUND - 30}
            width="50"
            height="24"
            rx="4"
            fill="#F0C35A"
            stroke="#A9832A"
          />
          <line
            x1={cx + (side === 'left' ? 40 : -40)}
            y1={GROUND - 28}
            x2={cx}
            y2={cy - 18}
            stroke="#A9832A"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <circle cx={cx + (side === 'left' ? 46 : -72)} cy={GROUND - 4} r="7" fill="#2A302D" />
          <circle cx={cx + (side === 'left' ? 74 : -44)} cy={GROUND - 4} r="7" fill="#2A302D" />
        </g>
      )}
      {(hanging || stage === 'unloading') && (
        <ContainerBox x={cx - w / 2} y={cy - 20} w={w} color={color} label="" />
      )}
    </g>
  );
}

const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

function ContainerBox({
  x,
  y,
  w,
  color,
  label,
}: {
  x: number;
  y: number;
  w: number;
  color: string;
  label: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height="34" rx="2" fill={color} stroke="rgba(0,0,0,0.25)" />
      {/* corrugated side panels */}
      <path
        d={Array.from(
          { length: Math.floor(w / 7) },
          (_, i) => `M${x + 4 + i * 7} ${y + 3}V${y + 31}`,
        ).join('')}
        stroke="rgba(255,255,255,0.18)"
      />
      {label && (
        <text
          x={x + w / 2}
          y={y + 21}
          textAnchor="middle"
          fill="#fff"
          fontFamily="Inter, sans-serif"
          fontSize="9.5"
          fontWeight="700"
        >
          {label}
        </text>
      )}
    </g>
  );
}

function Truck({
  x,
  facingLeft,
  moving,
  speed,
  t,
  containers,
}: {
  x: number;
  facingLeft: boolean;
  moving: boolean;
  speed: number;
  t: number;
  containers: BoardLeg['containers'];
}) {
  // Drawn facing right with the front at local x = TRUCK_LEN. In both directions x is the FRONT:
  // facing right the body trails to the left, facing left it trails to the right.
  const transform = facingLeft
    ? `translate(${x + TRUCK_LEN} 0) scale(-1 1)`
    : `translate(${x - TRUCK_LEN} 0)`;
  const spin = moving ? (t * 360 * 1.2 * speed) % 360 : 0;
  const wheel = (cx: number, r: number) => (
    <g key={cx} transform={`rotate(${spin} ${cx} ${GROUND + 24})`}>
      <circle cx={cx} cy={GROUND + 24} r={r} fill="#2A302D" />
      <circle cx={cx} cy={GROUND + 24} r={r * 0.55} fill="#B8BFBB" />
      <path
        d={`M${cx - r * 0.45} ${GROUND + 24}h${r * 0.9}M${cx} ${GROUND + 24 - r * 0.45}v${r * 0.9}`}
        stroke="#7D8682"
        strokeWidth="2"
      />
    </g>
  );
  const deckY = GROUND + 2;
  // Lay containers on the trailer from the rear: a 40ft fills it, 20fts sit side by side.
  let cursor = 6;
  const boxes = containers.map((c) => {
    const w = c.size === '40ft' ? 140 : 68;
    const box = { x: cursor, w, c };
    cursor += w + 4;
    return box;
  });
  return (
    <g transform={transform}>
      <ellipse
        cx={TRUCK_LEN / 2}
        cy={GROUND + 38}
        rx={TRUCK_LEN / 1.8}
        ry="4"
        fill="rgba(92,80,64,0.25)"
      />
      {/* trailer */}
      <path d={`M0 ${deckY} H${TRUCK_LEN - CAB - 4} V${deckY + 10} H0 Z`} fill="#4A565B" />
      {[22, 46, 70].map((cx) => wheel(cx, 11))}
      {/* containers (label keeps identity readable, never colour alone) */}
      {boxes.map((b) => (
        <g
          key={b.c.number}
          transform={facingLeft ? `translate(${b.x * 2 + b.w} 0) scale(-1 1)` : undefined}
        >
          <ContainerBox
            x={b.x}
            y={deckY - 36}
            w={b.w}
            color={clientColor(b.c.client)}
            label={`${b.c.client.split(' ')[0]} · ${b.c.number.slice(-7)}`}
          />
        </g>
      ))}
      {/* EV cab-over tractor */}
      <rect x={TRUCK_LEN - CAB} y={deckY + 4} width={CAB} height="10" rx="2" fill="#3A4448" />
      <path
        d={`M${TRUCK_LEN - CAB + 4} ${deckY + 8} V${deckY - 52} Q${TRUCK_LEN - CAB + 4} ${deckY - 60} ${TRUCK_LEN - CAB + 12} ${deckY - 60} H${TRUCK_LEN - 6} Q${TRUCK_LEN} ${deckY - 60} ${TRUCK_LEN} ${deckY - 52} V${deckY + 8} Z`}
        fill="url(#sc-cab)"
      />
      <rect x={TRUCK_LEN - 20} y={deckY - 54} width="16" height="22" rx="2" fill="url(#sc-glass)" />
      <rect
        x={TRUCK_LEN - CAB + 10}
        y={deckY - 50}
        width="18"
        height="16"
        rx="2"
        fill="url(#sc-glass)"
        opacity="0.9"
      />
      <rect
        x={TRUCK_LEN - CAB + 4}
        y={deckY - 22}
        width={CAB - 4}
        height="3"
        fill="#fff"
        opacity="0.85"
      />
      <text
        x={TRUCK_LEN - CAB + 8}
        y={deckY - 8}
        fill="rgba(255,255,255,0.95)"
        fontFamily="Manrope, sans-serif"
        fontSize="7"
        fontWeight="800"
        letterSpacing="0.6"
        transform={
          facingLeft ? `translate(${2 * (TRUCK_LEN - CAB + 8) + 34} 0) scale(-1 1)` : undefined
        }
      >
        EV
      </text>
      {/* headlight beam when driving */}
      {moving && (
        <path
          d={`M${TRUCK_LEN} ${deckY - 4} L${TRUCK_LEN + 90} ${deckY - 22} L${TRUCK_LEN + 90} ${deckY + 18} Z`}
          fill="#FFF3C4"
          opacity="0.35"
        />
      )}
      <rect x={TRUCK_LEN - 4} y={deckY - 8} width="5" height="6" rx="1.5" fill="#FFF3C4" />
      {[TRUCK_LEN - CAB + 14, TRUCK_LEN - 14].map((cx) => wheel(cx, 13))}
    </g>
  );
}

function Callout({
  x,
  reg,
  label,
  tone,
  sub,
}: {
  x: number;
  reg: string;
  label: string;
  tone: string;
  sub: string;
}) {
  const pill: Record<string, [string, string]> = {
    gray: ['#EEF0EE', '#4A565B'],
    amber: ['#FDF1DC', '#9A6412'],
    orange: ['#FDEADF', '#C4520F'],
    green: ['#E8F1EC', '#1B6B4A'],
  };
  const [bg, fg] = pill[tone] ?? pill.gray ?? ['#eee', '#333'];
  const pw = label.length * 6.2 + 18;
  const cx = Math.max(110, Math.min(W - 110, x));
  return (
    <g transform={`translate(${cx - 100} ${GROUND - 162})`}>
      <path d="M100 52 L100 64" stroke="#9AA29D" strokeDasharray="2 2" />
      <rect
        width="200"
        height="52"
        rx="10"
        fill="#fff"
        stroke="#E4DFD4"
        filter="drop-shadow(0 6px 10px rgba(31,42,36,0.10))"
      />
      <text
        x="12"
        y="21"
        fill="#1F2A24"
        fontFamily="Manrope, sans-serif"
        fontSize="13"
        fontWeight="800"
        letterSpacing="0.4"
      >
        {reg}
      </text>
      <text
        x="12"
        y="40"
        fill="#6B756F"
        fontFamily="Inter, sans-serif"
        fontSize="10.5"
        fontWeight="600"
      >
        {sub.length > 32 ? `${sub.slice(0, 31)}…` : sub}
      </text>
      <rect x={200 - pw - 10} y="8" width={pw} height="18" rx="9" fill={bg} />
      <text
        x={200 - 10 - pw / 2}
        y="21"
        textAnchor="middle"
        fill={fg}
        fontFamily="Inter, sans-serif"
        fontSize="10"
        fontWeight="700"
      >
        {label}
      </text>
    </g>
  );
}
