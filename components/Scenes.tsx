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
      {/* A LIT interior, deliberately unlike the hero orb's.
          The hero orb is dark glass with a bright rim because it is a body being
          measured. A probe-card sphere is the probe itself firing, so it carries
          a hot core falling off to the shell — reusing the hero's dark treatment
          here just made a small, dim copy of the hero. */}
      <radialGradient id={`${id}-body`} cx="40%" cy="34%">
        <stop offset="0%" stopColor="#eafff6" stopOpacity="0.55" />
        <stop offset="14%" stopColor={GREEN} stopOpacity="0.42" />
        <stop offset="38%" stopColor={GREEN} stopOpacity="0.2" />
        <stop offset="68%" stopColor="#00301f" stopOpacity="0.52" />
        <stop offset="100%" stopColor="#00120b" stopOpacity="0.66" />
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


/** Deterministic surface lights, so the sphere reads as populated, not empty. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function surfaceLights(seed: number, count: number, radius: number) {
  const rand = seeded(seed);
  return Array.from({ length: count }, () => {
    const angle = rand() * Math.PI * 2;
    const dist = Math.sqrt(rand()) * radius * 0.93;
    return {
      x: Number((Math.cos(angle) * dist).toFixed(2)),
      y: Number((Math.sin(angle) * dist).toFixed(2)),
      r: Number((0.7 + rand() * 1.7).toFixed(2)),
      delay: Number((rand() * 4).toFixed(2)),
      dur: Number((2.6 + rand() * 3.4).toFixed(2)),
    };
  });
}

const CLAIM_LIGHTS = surfaceLights(9101, 62, 124);
const MIRROR_LIGHTS_A = surfaceLights(3311, 28, 68);
const MIRROR_LIGHTS_B = surfaceLights(7717, 32, 78);

/**
 * The volumetric sphere the reference's probe cards are built around.
 *
 * The earlier version was an outlined circle with a few arcs behind it, which
 * read as a flat neon icon rather than a body. What makes it read as volume is
 * four things together: a radial fill that is brightest off-centre, meridians
 * *and* latitudes so the curvature is described in both directions, a specular
 * highlight, and enough surface lights that the far side looks populated.
 */
function Sphere({
  id,
  r,
  hue,
  lights,
  meridians = 10,
}: {
  id: string;
  r: number;
  hue: string;
  lights: ReturnType<typeof surfaceLights>;
  meridians?: number;
}) {
  // Latitudes come in symmetric pairs on purpose. The spin group rotates about
  // its own bounding box, so an odd number of one-sided rings puts the origin
  // off centre and the sphere sweeps out a second, ghost sphere as it turns.
  const lat = [0.42, 0.68, 0.88];
  return (
    <g>
      <circle r={r} fill={`url(#${id}-body)`} />
      <g className={s.spin}>
        <g fill="none" stroke={hue} strokeWidth="0.75">
          {Array.from({ length: meridians }, (_, i) => (
            <ellipse
              key={i}
              rx={Number((r * Math.abs(Math.cos((i / meridians) * Math.PI))).toFixed(2))}
              ry={r}
              transform={`rotate(${(i * 180) / meridians})`}
              opacity={0.34}
            />
          ))}
        </g>
        <g fill="none" stroke={hue} strokeWidth="0.7">
          {lat.flatMap((k) =>
            [-1, 1].map((sign) => (
              <ellipse
                key={`${k}-${sign}`}
                cy={Number((sign * r * (1 - k)).toFixed(2))}
                rx={Number((r * Math.sqrt(1 - (1 - k) ** 2)).toFixed(2))}
                ry={Number((r * k * 0.28).toFixed(2))}
                opacity={0.26}
              />
            )),
          )}
        </g>
      </g>
      <g fill={hue}>
        {lights.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={p.r}
            className={s.twinkleLight}
            style={{ animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }}
          />
        ))}
      </g>
      {/* rim: bloom, soft edge, hard edge */}
      <circle r={r} fill="none" stroke={hue} strokeWidth={r * 0.1} opacity="0.2" filter={`url(#${id}-glow)`} />
      <circle r={r} fill="none" stroke={hue} strokeWidth="2.4" opacity="0.45" filter={`url(#${id}-soft)`} />
      <circle r={r} fill="none" stroke={hue} strokeWidth="1.2" opacity="0.9" />
      {/* the specular the reference puts on the upper left */}
      <circle
        r={r}
        fill="none"
        stroke="#eafff6"
        strokeWidth="2"
        opacity="0.75"
        strokeDasharray={`${(r * 1.5).toFixed(1)} ${(r * 6.4).toFixed(1)}`}
        strokeDashoffset={(r * 2.3).toFixed(1)}
        filter={`url(#${id}-soft)`}
      />
    </g>
  );
}

/** The two-tier wireframe pedestal, with the ground-glow under it. */
function Pedestal({ id, y, hue = GREEN }: { id: string; y: number; hue?: string }) {
  return (
    <g transform={`translate(0 ${y})`}>
      <ellipse rx="70" ry="20" fill={hue} opacity="0.22" filter={`url(#${id}-glow)`} />
      <g fill="none" stroke={hue}>
        <path d="M0 -30 L76 0 L0 30 L-76 0Z" strokeWidth="3" opacity="0.18" filter={`url(#${id}-glow)`} />
        <path d="M0 -30 L76 0 L0 30 L-76 0Z" strokeWidth="1.1" opacity="0.9" />
        <path d="M0 -30 L76 0 L0 30 L-76 0Z" fill={hue} stroke="none" opacity="0.07" />
        <path d="M-76 0 L-76 13 L0 43 L76 13 L76 0" strokeWidth="1" opacity="0.6" />
        <path d="M0 30 L0 43" strokeWidth="1" opacity="0.5" />
        <path d="M0 -18 L46 0 L0 18 L-46 0Z" strokeWidth="0.8" opacity="0.45" />
        <path d="M0 -46 L100 -8 L0 32 L-100 -8Z" strokeWidth="0.7" opacity="0.2" />
      </g>
    </g>
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
      <ellipse rx="132" ry="34" transform="rotate(-14)" strokeWidth="0.6" opacity="0.2" className={s.ringA} />
      <ellipse rx="118" ry="52" transform="rotate(20)" strokeWidth="0.6" opacity="0.14" className={s.ringB} />
      <ellipse rx="142" ry="22" transform="rotate(7)" strokeWidth="0.6" opacity="0.12" className={s.ringC} />
      <g fill={hue} stroke="none" className={s.ringA} opacity="0.7">
        <circle cx="128" cy="-14" r="1.5" />
        <circle cx="-118" cy="22" r="1.3" />
      </g>
      <g fill={hue} stroke="none" className={s.ringB} opacity="0.7">
        <circle cx="-104" cy="-40" r="1.3" />
        <circle cx="96" cy="44" r="1.4" />
      </g>
      <circle cx="126" cy="-52" r="8" fill="none" stroke={BLUE} strokeWidth="0.9" opacity="0.6" />
      <circle cx="126" cy="-52" r="2" fill={BLUE} stroke="none" opacity="0.85" filter={`url(#${id}-soft)`} />
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
      <g transform="translate(0 -14)">
        <Sphere id={id} r={124} hue={GREEN} lights={CLAIM_LIGHTS} meridians={12} />
      </g>

      {/* the document being read, held inside the sphere */}
      <g transform="translate(0 -8)">
        <rect x="-34" y="-46" width="68" height="92" rx="8" fill="#04150e" stroke={GREEN} strokeWidth="1.6" />
        <rect x="-34" y="-46" width="68" height="92" rx="8" fill="none" stroke={GREEN} strokeWidth="6" opacity="0.24" filter={`url(#${id}-glow)`} />
        <g fill={GREEN} className={s.readLines}>
          <rect x="-21" y="-19" width="42" height="8.5" rx="4.25" />
          <rect x="-21" y="-2" width="42" height="8.5" rx="4.25" opacity="0.8" />
          <rect x="-21" y="15" width="27" height="8.5" rx="4.25" opacity="0.6" />
        </g>
        <path d="M-23 -44 L23 -44" stroke="#eafff6" strokeWidth="2.6" opacity="0.95" filter={`url(#${id}-soft)`} />
      </g>

      <Pedestal id={id} y={132} />
    </svg>
  );
}

/** Probe 02 — the claim and its negation, through a pane. */
export function MirrorScene() {
  const id = "sc2";
  return (
    <svg viewBox="-150 -150 300 300" className={s.scene} aria-hidden="true" focusable="false">
      <Defs id={id} />
      <g opacity="0.5">
        <Rings id={id} hue={VIOLET} />
      </g>

      {/* the negated side */}
      <g transform="translate(-80 20)">
        <Sphere id={id} r={66} hue={VIOLET} lights={MIRROR_LIGHTS_A} meridians={9} />
      </g>

      {/* the claim side */}
      <g transform="translate(80 20)">
        <Sphere id={id} r={74} hue={GREEN} lights={MIRROR_LIGHTS_B} meridians={10} />
      </g>

      {/* the pane the probe is fired through */}
      <g transform="translate(0 16)">
        <path d="M-17 -96 L17 -78 L17 82 L-17 74Z" fill={BLUE} opacity="0.13" />
        <path d="M-17 -96 L17 -88 L17 92 L-17 84Z" fill="none" stroke={BLUE} strokeWidth="1.3" opacity="0.9" />
        <path d="M-17 -96 L17 -88 L17 92 L-17 84Z" fill="none" stroke={BLUE} strokeWidth="7" opacity="0.2" filter={`url(#${id}-glow)`} />
        <path d="M-17 -34 L17 -26 M-17 30 L17 38" stroke={BLUE} strokeWidth="0.7" opacity="0.35" />
      </g>

      {/* the beam, fired both ways — a lit shaft, not a hairline */}
      <g className={s.beamPulse}>
        <path d="M-80 20 L80 20" stroke={GREEN} strokeWidth="10" opacity="0.22" filter={`url(#${id}-glow)`} />
        <path d="M-80 20 L80 20" stroke={GREEN} strokeWidth="3.4" opacity="0.75" filter={`url(#${id}-soft)`} />
        <path d="M-80 20 L80 20" stroke="#eafff6" strokeWidth="1.3" opacity="0.95" />
        <path d="M-80 2 L80 8" stroke={VIOLET} strokeWidth="1.4" opacity="0.55" filter={`url(#${id}-soft)`} />
        <path d="M-80 38 L80 34" stroke={BLUE} strokeWidth="1.4" opacity="0.5" filter={`url(#${id}-soft)`} />
      </g>
    </svg>
  );
}

/** Probe 03 — the sources the panel says it leaned on. */
export function EvidenceScene() {
  const id = "sc3";
  const nodes: Array<{ x: number; y: number; hue: string; glyph: "search" | "doc" | "book" }> = [
    { x: -110, y: 2, hue: BLUE, glyph: "search" },
    { x: 30, y: -76, hue: GREEN, glyph: "doc" },
    { x: 118, y: 44, hue: VIOLET, glyph: "book" },
  ];

  return (
    <svg viewBox="-150 -150 300 300" className={s.scene} aria-hidden="true" focusable="false">
      <Defs id={id} />

      {/* the shared store they all converge on */}
      <g transform="translate(0 52)">
        <g fill="none" stroke={GREEN}>
          <ellipse ry="13" rx="40" cy="-26" strokeWidth="1.4" opacity="0.95" />
          <ellipse ry="13" rx="40" cy="-26" fill={GREEN} stroke="none" opacity="0.12" />
          <path d="M-40 -26 L-40 24 M40 -26 L40 24" strokeWidth="1.4" opacity="0.95" />
          <ellipse ry="13" rx="40" cy="24" strokeWidth="1.4" opacity="0.95" />
          <ellipse ry="13" rx="40" cy="-3" strokeWidth="0.9" opacity="0.45" />
          <ellipse ry="13" rx="40" cy="-26" strokeWidth="7" opacity="0.3" filter={`url(#${id}-glow)`} />
          <path d="M-40 -26 L40 24 M40 -26 L-40 24" strokeWidth="0.6" opacity="0.16" />
        </g>
        <ellipse rx="54" ry="17" cy="24" fill={GREEN} opacity="0.24" filter={`url(#${id}-glow)`} />
      </g>

      {/* the orbit plane the sources sit on */}
      <g fill="none" stroke={GREEN} transform="translate(0 52)">
        <ellipse rx="146" ry="52" strokeWidth="0.9" opacity="0.4" />
        <ellipse rx="118" ry="42" strokeWidth="0.9" opacity="0.32" />
        <ellipse rx="88" ry="32" strokeWidth="0.9" opacity="0.24" />
        <ellipse rx="60" ry="22" strokeWidth="0.9" opacity="0.16" />
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
            <circle r="33" fill="#04150e" stroke={n.hue} strokeWidth="1.5" />
            <circle r="33" fill="none" stroke={n.hue} strokeWidth="8" opacity="0.34" filter={`url(#${id}-glow)`} />
            <g stroke={n.hue} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" transform="scale(1.42)">
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
