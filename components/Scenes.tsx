/**
 * The three neon isometric scenes that fill the right half of the probe cards.
 *
 * Each one is the probe it illustrates, not decoration: a document held inside a
 * sphere on a plinth (the claim, being read), two spheres firing through a pane
 * of glass (the claim and its mirror), and a constellation of sources orbiting a
 * store (the evidence anchors). Drawn as SVG on a shared isometric grid so the
 * three read as one set, and animated on the compositor.
 */

import s from "./scenes.module.css";

const GREEN = "#00ffa3";
const VIOLET = "#a855f7";
const BLUE = "#72dcff";

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <radialGradient id={`${id}-core`}>
        <stop offset="0%" stopColor={GREEN} stopOpacity="0.34" />
        <stop offset="62%" stopColor={GREEN} stopOpacity="0.08" />
        <stop offset="100%" stopColor="#000" stopOpacity="0.4" />
      </radialGradient>
      <filter id={`${id}-glow`} x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="3" />
      </filter>
      <filter id={`${id}-soft`} x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="1.4" />
      </filter>
    </defs>
  );
}

/** The stacked isometric plinth every scene stands on. */
function Plinth({ id, y = 118 }: { id: string; y?: number }) {
  return (
    <g transform={`translate(0 ${y})`}>
      <g fill="none" stroke={GREEN}>
        <path d="M0 -26 L64 0 L0 26 L-64 0Z" strokeWidth="2.4" opacity="0.2" filter={`url(#${id}-glow)`} />
        <path d="M0 -26 L64 0 L0 26 L-64 0Z" strokeWidth="0.9" opacity="0.85" />
        <path d="M-64 0 L-64 11 L0 37 L64 11 L64 0" strokeWidth="0.9" opacity="0.6" />
        <path d="M0 26 L0 37" strokeWidth="0.9" opacity="0.5" />
        <path d="M0 -16 L40 0 L0 16 L-40 0Z" strokeWidth="0.7" opacity="0.45" />
        <path d="M0 -40 L86 -6 L0 28 L-86 -6Z" strokeWidth="0.7" opacity="0.22" />
      </g>
      <ellipse rx="52" ry="15" fill={GREEN} opacity="0.14" filter={`url(#${id}-glow)`} />
    </g>
  );
}

/** Orbit rings with dots riding them, the connective tissue of all three scenes. */
function Rings({ id, hue = GREEN }: { id: string; hue?: string }) {
  return (
    <g fill="none" stroke={hue}>
      <ellipse rx="112" ry="40" transform="rotate(-16)" strokeWidth="0.7" opacity="0.35" className={s.ringA} />
      <ellipse rx="94" ry="62" transform="rotate(22)" strokeWidth="0.7" opacity="0.28" className={s.ringB} />
      <ellipse rx="126" ry="26" transform="rotate(8)" strokeWidth="0.7" opacity="0.22" className={s.ringC} />
      <g fill={hue} stroke="none" className={s.ringA}>
        <circle cx="108" cy="-12" r="1.6" />
        <circle cx="-96" cy="20" r="1.4" />
        <circle cx="42" cy="36" r="1.2" />
      </g>
      <g fill={hue} stroke="none" className={s.ringB}>
        <circle cx="-84" cy="-38" r="1.4" />
        <circle cx="76" cy="42" r="1.5" />
      </g>
      <circle cx="118" cy="-46" r="9" fill="none" stroke={BLUE} strokeWidth="0.9" opacity="0.7" />
      <circle cx="118" cy="-46" r="2" fill={BLUE} stroke="none" opacity="0.9" filter={`url(#${id}-soft)`} />
    </g>
  );
}

/** Probe 01 — the claim, read inside a sphere. */
export function ClaimScene() {
  const id = "sc1";
  return (
    <svg viewBox="-150 -150 300 300" className={s.scene} aria-hidden="true" focusable="false">
      <Defs id={id} />
      <Rings id={id} />
      <circle cy="14" r="76" fill={`url(#${id}-core)`} />
      <g className={s.spin} style={{ transformOrigin: "0px 14px" }}>
        <g fill="none" stroke={GREEN} opacity="0.5">
          {[0, 40, 80, 120].map((deg, i) => (
            <ellipse key={deg} cy="14" rx={76 * (0.24 + (i % 3) * 0.3)} ry="76" transform={`rotate(${deg} 0 14)`} strokeWidth="0.8" />
          ))}
          <ellipse cy="14" rx="76" ry="24" strokeWidth="0.8" opacity="0.7" />
        </g>
      </g>
      <circle cy="14" r="76" fill="none" stroke={GREEN} strokeWidth="6" opacity="0.3" filter={`url(#${id}-glow)`} />
      <circle cy="14" r="76" fill="none" stroke={GREEN} strokeWidth="1.2" opacity="0.95" />

      {/* the document being read */}
      <g transform="translate(0 12)">
        <rect x="-24" y="-32" width="48" height="64" rx="6" fill="#04150e" stroke={GREEN} strokeWidth="1.4" />
        <rect x="-24" y="-32" width="48" height="64" rx="6" fill="none" stroke={GREEN} strokeWidth="4" opacity="0.22" filter={`url(#${id}-glow)`} />
        <g fill={GREEN} className={s.readLines}>
          <rect x="-14" y="-12" width="28" height="6" rx="3" />
          <rect x="-14" y="0" width="28" height="6" rx="3" opacity="0.8" />
          <rect x="-14" y="12" width="18" height="6" rx="3" opacity="0.6" />
        </g>
        <path d="M-16 -30 L16 -30" stroke="#eafff6" strokeWidth="2" opacity="0.9" filter={`url(#${id}-soft)`} />
      </g>
      <Plinth id={id} />
    </svg>
  );
}

/** Probe 02 — the claim and its negation, through a pane. */
export function MirrorScene() {
  const id = "sc2";
  return (
    <svg viewBox="-150 -150 300 300" className={s.scene} aria-hidden="true" focusable="false">
      <Defs id={id} />
      <g opacity="0.55">
        <Rings id={id} hue={VIOLET} />
      </g>

      {/* the negated side */}
      <g transform="translate(-84 34)">
        <circle r="52" fill={VIOLET} opacity="0.16" />
        <g className={s.spinSlow}>
          <g fill="none" stroke={VIOLET} opacity="0.6">
            {[0, 50, 100, 140].map((deg, i) => (
              <ellipse key={deg} rx={52 * (0.22 + (i % 3) * 0.32)} ry="52" transform={`rotate(${deg})`} strokeWidth="0.8" />
            ))}
          </g>
        </g>
        <circle r="52" fill="none" stroke={VIOLET} strokeWidth="5" opacity="0.32" filter={`url(#${id}-glow)`} />
        <circle r="52" fill="none" stroke={VIOLET} strokeWidth="1" opacity="0.85" />
        <circle r="3" fill="#fff" opacity="0.9" filter={`url(#${id}-soft)`} />
      </g>

      {/* the claim side */}
      <g transform="translate(80 34)">
        <circle r="58" fill={GREEN} opacity="0.14" />
        <g className={s.spin}>
          <g fill="none" stroke={GREEN} opacity="0.55">
            {[0, 45, 90, 135].map((deg, i) => (
              <ellipse key={deg} rx={58 * (0.22 + (i % 3) * 0.32)} ry="58" transform={`rotate(${deg})`} strokeWidth="0.8" />
            ))}
          </g>
        </g>
        <circle r="58" fill="none" stroke={GREEN} strokeWidth="5.5" opacity="0.3" filter={`url(#${id}-glow)`} />
        <circle r="58" fill="none" stroke={GREEN} strokeWidth="1" opacity="0.85" />
      </g>

      {/* the pane the probe is fired through */}
      <g transform="translate(0 30)">
        <path d="M-16 -78 L16 -70 L16 74 L-16 66Z" fill={BLUE} opacity="0.12" />
        <path d="M-16 -78 L16 -70 L16 74 L-16 66Z" fill="none" stroke={BLUE} strokeWidth="1.2" opacity="0.85" />
        <path d="M-16 -78 L16 -70 L16 74 L-16 66Z" fill="none" stroke={BLUE} strokeWidth="4" opacity="0.18" filter={`url(#${id}-glow)`} />
      </g>

      {/* the beam, fired both ways */}
      <g className={s.beamPulse}>
        <path d="M-84 34 L80 34" stroke={GREEN} strokeWidth="1.8" opacity="0.85" filter={`url(#${id}-soft)`} />
        <path d="M-84 34 L80 34" stroke="#eafff6" strokeWidth="0.8" opacity="0.95" />
        <path d="M-84 20 L80 24" stroke={VIOLET} strokeWidth="1" opacity="0.55" filter={`url(#${id}-soft)`} />
        <path d="M-84 48 L80 44" stroke={BLUE} strokeWidth="1" opacity="0.5" filter={`url(#${id}-soft)`} />
      </g>
    </svg>
  );
}

/** Probe 03 — the sources the panel says it leaned on. */
export function EvidenceScene() {
  const id = "sc3";
  const nodes: Array<{ x: number; y: number; hue: string; glyph: "search" | "doc" | "book" }> = [
    { x: -96, y: 18, hue: BLUE, glyph: "search" },
    { x: 40, y: -46, hue: GREEN, glyph: "doc" },
    { x: 108, y: 44, hue: VIOLET, glyph: "book" },
  ];

  return (
    <svg viewBox="-150 -150 300 300" className={s.scene} aria-hidden="true" focusable="false">
      <Defs id={id} />

      {/* the shared store they all converge on */}
      <g transform="translate(0 52)">
        <g fill="none" stroke={GREEN}>
          <ellipse ry="9" rx="26" cy="-16" strokeWidth="1.2" opacity="0.9" />
          <path d="M-26 -16 L-26 14 M26 -16 L26 14" strokeWidth="1.2" opacity="0.9" />
          <ellipse ry="9" rx="26" cy="14" strokeWidth="1.2" opacity="0.9" />
          <ellipse ry="9" rx="26" cy="-1" strokeWidth="0.9" opacity="0.5" />
          <ellipse ry="9" rx="26" cy="-16" strokeWidth="4" opacity="0.25" filter={`url(#${id}-glow)`} />
        </g>
        <ellipse rx="34" ry="11" cy="14" fill={GREEN} opacity="0.16" filter={`url(#${id}-glow)`} />
      </g>

      {/* the orbit plane the sources sit on */}
      <g fill="none" stroke={GREEN} transform="translate(0 52)">
        <ellipse rx="140" ry="50" strokeWidth="0.8" opacity="0.34" />
        <ellipse rx="112" ry="40" strokeWidth="0.8" opacity="0.28" />
        <ellipse rx="82" ry="30" strokeWidth="0.8" opacity="0.22" />
      </g>

      {/* each source, wired back to the store */}
      {nodes.map((n, i) => (
        <g key={n.glyph}>
          <path
            d={`M0 52 Q ${n.x * 0.5} ${(n.y + 52) * 0.4} ${n.x} ${n.y}`}
            fill="none"
            stroke={n.hue}
            strokeWidth="0.8"
            opacity="0.4"
            strokeDasharray="3 5"
            className={s.wire}
          />
          {/* The bob animation is a CSS transform, and a CSS transform beats an
              SVG transform attribute on the same element — so the placement and
              the motion have to live on different groups, or all three nodes
              collapse onto the origin. */}
          <g transform={`translate(${n.x} ${n.y})`}>
            <g className={s.bob} style={{ animationDelay: `${-2.3 * i}s` }}>
            <circle r="24" fill="#04150e" stroke={n.hue} strokeWidth="1.3" />
            <circle r="24" fill="none" stroke={n.hue} strokeWidth="5" opacity="0.3" filter={`url(#${id}-glow)`} />
            <g stroke={n.hue} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
              {n.glyph === "search" ? (
                <>
                  <circle cx="-2" cy="-2" r="7" />
                  <path d="m3.5 3.5 5 5" />
                </>
              ) : null}
              {n.glyph === "doc" ? (
                <>
                  <path d="M-7 -9 h9 l5 5 v13 h-14Z" />
                  <path d="M-3 1 h6 M-3 5 h4" />
                </>
              ) : null}
              {n.glyph === "book" ? (
                <>
                  <path d="M-9 -8 h7 a2 2 0 0 1 2 2 v14 a2 2 0 0 0 -2 -2 h-7Z" />
                  <path d="M9 -8 h-7 a2 2 0 0 0 -2 2 v14 a2 2 0 0 1 2 -2 h7Z" />
                </>
              ) : null}
              </g>
            </g>
          </g>
        </g>
      ))}
    </svg>
  );
}
