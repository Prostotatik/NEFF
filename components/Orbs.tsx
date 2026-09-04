/**
 * The orbital scene: the energy spheres the reference builds its hero out of.
 *
 * Implementation note — why SVG rather than WebGL or a raster. The reference's
 * spheres are made of three things: a bright rim, a cage of great-circle
 * filaments, and a scatter of point lights. All three are vector primitives, so
 * SVG draws them crisply at any size, animates them on the compositor with plain
 * CSS transforms, and costs no library and no GPU context. A three.js scene
 * would match the raster more literally and cost ~600KB plus a canvas per orb,
 * for a hero that has four of them on screen at once.
 *
 * Everything here is deterministic: positions come from a seeded generator
 * evaluated at module scope, never from Math.random during render, so the server
 * and client markup agree.
 */

import s from "./orbs.module.css";

/** Mulberry32 — small, fast, and stable across server and client. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Point = { x: number; y: number; r: number; delay: number; dur: number };

/**
 * Coordinates are rounded before they reach the DOM.
 *
 * Math.cos, Math.sin and Math.sqrt are implementation-defined in their last
 * bits, so Node and Chrome disagree on the final digit of the same expression —
 * which React sees as a server/client attribute mismatch and reports as a
 * hydration error. Three decimals is well past sub-pixel at this scale and is
 * identical on both sides.
 */
function fixed(n: number, places = 3): number {
  return Number(n.toFixed(places));
}

/** Point lights scattered inside a disc of the given radius. */
function scatter(seed: number, count: number, radius: number, inset = 0.94): Point[] {
  const rand = seeded(seed);
  return Array.from({ length: count }, () => {
    const angle = rand() * Math.PI * 2;
    // sqrt keeps the scatter even across the disc instead of clumping at centre
    const dist = Math.sqrt(rand()) * radius * inset;
    return {
      x: fixed(Math.cos(angle) * dist),
      y: fixed(Math.sin(angle) * dist),
      r: fixed(0.5 + rand() * 1.5),
      delay: fixed(rand() * 4, 2),
      dur: fixed(2.4 + rand() * 3.6, 2),
    };
  });
}

/** Dots strung along an ellipse, for the orbit trails. */
function alongEllipse(seed: number, count: number, rx: number, ry: number) {
  const rand = seeded(seed);
  return Array.from({ length: count }, () => {
    const t = rand() * Math.PI * 2;
    return {
      x: fixed(Math.cos(t) * rx),
      y: fixed(Math.sin(t) * ry),
      r: fixed(0.6 + rand() * 1.3),
      delay: fixed(rand() * 5, 2),
      dur: fixed(3 + rand() * 3, 2),
    };
  });
}

const CORE_STARS = scatter(20260905, 46, 100);
const FIELD_STARS = scatter(77123, 120, 300, 1);

/**
 * The central sphere. `hue` is a CSS colour; the whole orb is drawn from it, so
 * one prop re-skins the scene when the verdict changes.
 */
export function VerdictOrb({
  size = 320,
  hue = "#00ffa3",
  idle = false,
  children,
}: {
  size?: number;
  hue?: string;
  idle?: boolean;
  children?: React.ReactNode;
}) {
  const id = idle ? "orb-idle" : "orb-live";
  const R = 100;

  return (
    <div
      className={`${s.verdictOrb} ${idle ? s.orbIdle : ""}`}
      style={{ width: size, height: size, ["--hue" as string]: hue }}
    >
      <div className={s.orbBloom} aria-hidden="true" />
      <svg
        className={s.orbSvg}
        viewBox="-150 -150 300 300"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <radialGradient id={`${id}-fill`}>
            <stop offset="0%" stopColor="#000" stopOpacity="0.9" />
            <stop offset="62%" stopColor="#00120b" stopOpacity="0.82" />
            <stop offset="93%" stopColor={hue} stopOpacity="0.05" />
            <stop offset="100%" stopColor={hue} stopOpacity="0.015" />
          </radialGradient>
          <radialGradient id={`${id}-rimlight`}>
            <stop offset="88%" stopColor={hue} stopOpacity="0" />
            <stop offset="97%" stopColor={hue} stopOpacity="0.16" />
            <stop offset="100%" stopColor={hue} stopOpacity="0" />
          </radialGradient>
          <filter id={`${id}-soft`} x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
          <filter id={`${id}-wide`} x="-90%" y="-90%" width="280%" height="280%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>

        {/* interior */}
        <circle r={R} fill={`url(#${id}-fill)`} />
        <circle r={R} fill={`url(#${id}-rimlight)`} />

        {/* the cage of great circles — meridians, spun slowly */}
        <g className={s.spinSlow} stroke={hue} fill="none">
          {[0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165].map((deg, i) => (
            <ellipse
              key={deg}
              rx={R * (0.16 + (i % 4) * 0.27)}
              ry={R}
              transform={`rotate(${deg})`}
              strokeWidth={0.5}
              opacity={0.11 + (i % 3) * 0.05}
            />
          ))}
        </g>

        {/* latitudes, spun the other way so the surface reads as turning */}
        <g className={s.spinReverse} stroke={hue} fill="none">
          {[0.28, 0.52, 0.72, 0.88, 0.97].map((k, i) => (
            <ellipse
              key={k}
              rx={fixed(R * Math.sqrt(1 - (1 - k) ** 2))}
              ry={R * k * 0.34}
              cy={fixed(R * (1 - k) * (i % 2 === 0 ? -0.9 : 0.9))}
              strokeWidth={0.5}
              opacity={0.16}
            />
          ))}
        </g>

        {/* point lights on the surface */}
        <g fill={hue}>
          {CORE_STARS.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={p.r}
              className={s.twinkle}
              style={{ animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }}
            />
          ))}
        </g>

        {/* the rim: a hard edge plus two blurred copies for the bloom */}
        <circle r={R} fill="none" stroke={hue} strokeWidth="14" opacity="0.2" filter={`url(#${id}-wide)`} />
        <circle r={R} fill="none" stroke={hue} strokeWidth="2.6" opacity="0.5" filter={`url(#${id}-soft)`} />
        <circle r={R} fill="none" stroke={hue} strokeWidth="1" opacity="0.8" />
        {/* the hot side. In the reference the rim is not evenly lit: it burns
            through the upper left and falls away to the right, which is what
            makes the sphere read as lit rather than as a drawn circle. */}
        <circle
          r={R}
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.6"
          opacity="0.75"
          strokeDasharray={`${R * 1.5} ${R * 6.3}`}
          strokeDashoffset={R * 2.2}
          filter={`url(#${id}-soft)`}
        />

        {/* the flare that sits at the top of the rim in the reference */}
        <g className={s.flare} transform={`translate(0 ${-R})`}>
          <circle r="3.4" fill="#fff" opacity="0.9" filter={`url(#${id}-soft)`} />
          <path
            d="M0 -22 L2 0 L0 22 L-2 0Z M-22 0 L0 -2 L22 0 L0 2Z"
            fill={hue}
            opacity="0.55"
            filter={`url(#${id}-soft)`}
          />
        </g>
      </svg>
      <div className={s.orbFace}>{children}</div>
    </div>
  );
}

/**
 * A satellite: one model on the panel, drawn as a smaller sphere with the
 * Saturn-style ring the reference gives them, plus its own orbit trail.
 */
export function SatelliteOrb({
  size = 108,
  hue = "#b57af8",
  tilt = -22,
  seed = 7,
  dim = false,
}: {
  size?: number;
  hue?: string;
  tilt?: number;
  seed?: number;
  dim?: boolean;
}) {
  const id = `sat-${seed}`;
  const R = 60;
  const stars = scatter(seed * 977, 22, R);
  const ringDots = alongEllipse(seed * 331, 14, 96, 30);

  return (
    <div
      className={`${s.satellite} ${dim ? s.satelliteDim : ""}`}
      style={{ width: size, height: size, ["--hue" as string]: hue }}
    >
      <div className={s.satBloom} aria-hidden="true" />
      <svg viewBox="-110 -110 220 220" className={s.satSvg} aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id={`${id}-fill`}>
            <stop offset="0%" stopColor={hue} stopOpacity="0.4" />
            <stop offset="60%" stopColor={hue} stopOpacity="0.12" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.5" />
          </radialGradient>
          <filter id={`${id}-soft`} x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="2.6" />
          </filter>
        </defs>

        <circle r={R} fill={`url(#${id}-fill)`} />

        <g className={s.spinSlow} stroke={hue} fill="none" opacity="0.45">
          {[0, 36, 72, 108, 144].map((deg, i) => (
            <ellipse key={deg} rx={R * (0.2 + (i % 3) * 0.34)} ry={R} transform={`rotate(${deg})`} strokeWidth="0.8" />
          ))}
        </g>

        <g fill={hue}>
          {stars.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={p.r}
              className={s.twinkle}
              style={{ animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }}
            />
          ))}
        </g>

        <circle r={R} fill="none" stroke={hue} strokeWidth="3.4" opacity="0.3" filter={`url(#${id}-soft)`} />
        <circle r={R} fill="none" stroke={hue} strokeWidth="1.1" opacity="0.85" />

        {/* the core star */}
        <g transform="translate(-8 6)">
          <circle r="3" fill="#fff" opacity="0.95" filter={`url(#${id}-soft)`} />
          <path d="M0 -26 L1.8 0 L0 26 L-1.8 0Z M-26 0 L0 -1.8 L26 0 L0 1.8Z" fill={hue} opacity="0.75" filter={`url(#${id}-soft)`} />
        </g>

        {/* the ring, and dots riding it */}
        <g transform={`rotate(${tilt})`}>
          <ellipse rx="96" ry="30" fill="none" stroke={hue} strokeWidth="1.3" opacity="0.7" />
          <ellipse rx="96" ry="30" fill="none" stroke={hue} strokeWidth="4" opacity="0.16" filter={`url(#${id}-soft)`} />
          <g fill={hue} className={s.ringDots}>
            {ringDots.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={p.r} opacity="0.9" />
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}

/**
 * The ambient star field behind the whole hero. Purely decorative, so it is
 * marked hidden and never traps a pointer.
 */
export function StarField() {
  return (
    <svg className={s.starField} viewBox="-300 -300 600 600" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice">
      <g fill="#00ffa3">
        {FIELD_STARS.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={fixed(p.r * 0.62)}
            className={s.twinkle}
            opacity="0.5"
            style={{ animationDelay: `${p.delay}s`, animationDuration: `${fixed(p.dur * 1.6, 2)}s` }}
          />
        ))}
      </g>
    </svg>
  );
}

/**
 * The long elliptical orbit trails that sweep across the hero behind and in
 * front of the spheres.
 */
export function OrbitTrails() {
  return (
    <svg className={s.trails} viewBox="-400 -260 800 520" aria-hidden="true" focusable="false">
      <defs>
        <filter id="trail-soft" x="-30%" y="-60%" width="160%" height="220%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <linearGradient id="trail-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#00ffa3" stopOpacity="0" />
          <stop offset="35%" stopColor="#00ffa3" stopOpacity="0.55" />
          <stop offset="70%" stopColor="#72dcff" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#72dcff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#trail-fade)" filter="url(#trail-soft)">
        <ellipse rx="330" ry="118" transform="rotate(-14)" strokeWidth="2.4" className={s.trailA} />
        <ellipse rx="286" ry="168" transform="rotate(16)" strokeWidth="1.8" className={s.trailB} />
        <ellipse rx="366" ry="86" transform="rotate(6)" strokeWidth="2" className={s.trailC} />
        <ellipse rx="240" ry="212" transform="rotate(-32)" strokeWidth="1.4" opacity="0.7" className={s.trailB} />
        <ellipse rx="392" ry="146" transform="rotate(-4)" strokeWidth="1.6" opacity="0.55" className={s.trailC} />
      </g>
    </svg>
  );
}

/**
 * A low-poly wireframe shard — the debris drifting through the reference's hero,
 * and the same primitive the metrics strip uses at a larger size.
 */
export function Shard({
  size = 44,
  hue = "#00ffa3",
  className,
}: {
  size?: number;
  hue?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-50 -50 100 100"
      className={`${s.shard} ${className ?? ""}`}
      style={{ ["--hue" as string]: hue }}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke={hue} strokeWidth="1.1" opacity="0.75">
        <path d="M0 -40 L34 -18 L34 20 L0 42 L-34 20 L-34 -18Z" />
        <path d="M0 -40 L0 42 M-34 -18 L34 20 M34 -18 L-34 20" opacity="0.5" />
        <path d="M-34 -18 L0 -4 L34 -18 M0 -4 L0 42" opacity="0.5" />
      </g>
    </svg>
  );
}

/**
 * The wireframe icosahedron the metrics strip stands the witness count next to.
 *
 * A real icosahedron: the standard (0, ±1, ±φ) vertices rotated 36°/12° into the
 * view with the widest vertex separation, projected once, with the ten faces
 * whose centroid faces the viewer filled and their edges drawn pale. That last
 * part is what the reference actually does — the near edges are close to white
 * with a green wash inside them, and drawing every edge the same green flattens
 * the solid into a tangle of lines.
 */
export function Icosahedron({ size = 132, hue = "#00ffa3" }: { size?: number; hue?: string }) {
  const V: Array<[number, number]> = [
    [10.7, 3.9],
    [32, -35.6],
    [47.6, 16],
    [-4.1, -47.9],
    [21.2, 35.6],
    [38.5, -16],
    [4.1, 47.9],
    [-21.2, -35.6],
    [-38.5, 16],
    [-10.7, -3.9],
    [-32, 35.6],
    [-47.6, -16],
  ];
  const Z = [1.86, 0.72, 0.45, -0.71, -1.14, -1.13, 0.71, 1.14, 1.13, -1.86, -0.72, -0.45];
  const FRONT_FACES: Array<[number, number, number]> = [
    [0, 1, 2], [0, 1, 7], [0, 2, 6], [0, 6, 8], [0, 7, 8],
    [1, 2, 5], [1, 3, 7], [2, 4, 6], [6, 8, 10], [7, 8, 11],
  ];
  const E: Array<[number, number]> = [
    [0, 1], [0, 2], [0, 6], [0, 7], [0, 8], [1, 2], [1, 3], [1, 5], [1, 7], [2, 4],
    [2, 5], [2, 6], [3, 5], [3, 7], [3, 9], [3, 11], [4, 5], [4, 6], [4, 9], [4, 10],
    [5, 9], [6, 8], [6, 10], [7, 8], [7, 11], [8, 10], [8, 11], [9, 10], [9, 11], [10, 11],
  ];
  const FRONT_EDGES = new Set(
    FRONT_FACES.flatMap(([a, b, c]) => [
      [a, b],
      [a, c],
      [b, c],
    ]).map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`)),
  );
  const isFront = (a: number, b: number) => FRONT_EDGES.has(a < b ? `${a}-${b}` : `${b}-${a}`);
  const pts = (f: number[]) => f.map((i) => `${V[i][0]},${V[i][1]}`).join(" ");

  return (
    <svg
      width={size}
      height={size}
      viewBox="-62 -62 124 132"
      className={s.icosa}
      style={{ ["--hue" as string]: hue }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id="icosa-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
        <filter id="icosa-base" x="-90%" y="-90%" width="280%" height="280%">
          <feGaussianBlur stdDeviation="4.5" />
        </filter>
      </defs>

      {/* the lit plinth it stands on */}
      <g transform="translate(0 52)">
        <ellipse cy="4" rx="26" ry="9" fill={hue} opacity="0.28" filter="url(#icosa-base)" />
        <g fill="none" stroke={hue}>
          <path d="M0 -13 L32 0 L0 13 L-32 0Z" strokeWidth="1" opacity="0.9" />
          <path d="M0 -13 L32 0 L0 13 L-32 0Z" fill={hue} stroke="none" opacity="0.08" />
          <path d="M-32 0 L-32 6 L0 19 L32 6 L32 0" strokeWidth="0.9" opacity="0.55" />
          <path d="M0 -19 L46 0 L0 19 L-46 0Z" strokeWidth="0.7" opacity="0.25" />
        </g>
      </g>

      <g className={s.tumble}>
        {/* facets, so the solid reads as a body rather than a cage */}
        <g fill={hue} stroke="none">
          {FRONT_FACES.map((f, i) => (
            <polygon key={f.join("-")} points={pts(f)} opacity={0.05 + (i % 3) * 0.035} />
          ))}
        </g>

        {/* the bloom on the near edges */}
        <g fill="none" stroke={hue} strokeWidth="3" opacity="0.28" filter="url(#icosa-glow)">
          {E.filter(([a, b]) => isFront(a, b)).map(([a, b]) => (
            <path key={`g${a}-${b}`} d={`M${V[a][0]} ${V[a][1]} L${V[b][0]} ${V[b][1]}`} />
          ))}
        </g>

        {/* far edges in green, near edges close to white */}
        <g fill="none" strokeWidth="0.8" stroke={hue}>
          {E.filter(([a, b]) => !isFront(a, b)).map(([a, b]) => (
            <path
              key={`b${a}-${b}`}
              d={`M${V[a][0]} ${V[a][1]} L${V[b][0]} ${V[b][1]}`}
              opacity="0.3"
            />
          ))}
        </g>
        <g fill="none" strokeWidth="1" stroke="#dffff3">
          {E.filter(([a, b]) => isFront(a, b)).map(([a, b]) => (
            <path
              key={`f${a}-${b}`}
              d={`M${V[a][0]} ${V[a][1]} L${V[b][0]} ${V[b][1]}`}
              opacity="0.82"
            />
          ))}
        </g>

        <g>
          {V.map(([x, y], i) => (
            <circle
              key={`${x},${y}`}
              cx={x}
              cy={y}
              r={Z[i] > 0 ? 1.6 : 1.2}
              fill={Z[i] > 0 ? "#eafff6" : hue}
              opacity={Z[i] > 0 ? 0.95 : 0.35}
            />
          ))}
        </g>
      </g>

      {/* the debris ring the reference puts around it */}
      <g fill="none" stroke={hue} opacity="0.3" className={s.spinSlow}>
        <ellipse rx="58" ry="18" cy="6" strokeWidth="0.7" />
        <ellipse rx="46" ry="14" cy="14" strokeWidth="0.7" opacity="0.7" />
        <g fill={hue} stroke="none">
          <circle cx="56" cy="4" r="1.3" />
          <circle cx="-52" cy="12" r="1.2" />
          <circle cx="40" cy="22" r="1.1" />
        </g>
      </g>
    </svg>
  );
}

/**
 * The wireframe balance beside the two consensus readings — nominal on one pan,
 * effective on the other, which is the argument the strip is making.
 */
export function Balance({ size = 150, hue = "#00ffa3" }: { size?: number; hue?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-64 -54 128 120"
      className={s.balance}
      style={{ ["--hue" as string]: hue }}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke={hue} strokeWidth="1" strokeLinejoin="round">
        {/* column and foot */}
        <path d="M0 -40 L0 42" opacity="0.9" />
        <path d="M-15 42 L15 42 L21 52 L-21 52Z" opacity="0.85" />
        <path d="M-21 52 L21 52" opacity="0.55" />
        <circle cy="-42" r="3.2" opacity="0.9" />

        <g className={s.beam}>
          {/* the beam */}
          <path d="M-44 -38 L44 -38" strokeWidth="1.4" opacity="0.95" />
          {/* the cords each pan hangs from */}
          <path d="M-44 -38 L-44 -18 M44 -38 L44 -18" opacity="0.55" />
          {/* the pans */}
          <path d="M-64 -18 L-24 -18 L-44 6Z" opacity="0.55" />
          <path d="M-64 -18 L-24 -18" strokeWidth="1.3" opacity="0.95" />
          <path d="M24 -18 L64 -18 L44 6Z" opacity="0.55" />
          <path d="M24 -18 L64 -18" strokeWidth="1.3" opacity="0.95" />
          <path d="M-58 -18 L-44 6 L-30 -18" opacity="0.8" />
          <path d="M30 -18 L44 6 L58 -18" opacity="0.8" />
          <g fill={hue} stroke="none" opacity="0.95">
            <circle cx="-44" cy="-38" r="1.6" />
            <circle cx="44" cy="-38" r="1.6" />
            <circle cy="-38" r="1.6" />
          </g>
        </g>
      </g>
      <ellipse cy="54" rx="26" ry="7" fill={hue} opacity="0.18" />
    </svg>
  );
}

/** A spiral galaxy — the drifting motif behind the closing panel. */
export function Spiral({ size = 120, hue = "#00ffa3" }: { size?: number; hue?: string }) {
  const arms = [0, 120, 240];
  const dots = alongEllipse(4242, 26, 46, 30);
  return (
    <svg
      width={size}
      height={size}
      viewBox="-60 -60 120 120"
      className={s.spiral}
      style={{ ["--hue" as string]: hue }}
      aria-hidden="true"
      focusable="false"
    >
      <g className={s.spinSlow}>
        <g fill="none" stroke={hue} strokeWidth="0.8" opacity="0.55">
          {arms.map((a) => (
            <path
              key={a}
              d="M0 0 C 12 -6 26 -6 34 4 C 42 15 34 30 18 34 C 2 38 -14 30 -20 16"
              transform={`rotate(${a})`}
            />
          ))}
        </g>
        <g fill={hue} opacity="0.8">
          {dots.map((p, i) => (
            <circle key={i} cx={fixed(p.x * 0.8)} cy={fixed(p.y * 0.8)} r={fixed(p.r * 0.7)} />
          ))}
        </g>
      </g>
      <circle r="3" fill="#eafff6" opacity="0.9" />
      <circle r="9" fill={hue} opacity="0.18" />
    </svg>
  );
}

/** A wireframe terrain — the ridge motif under "load-bearing fact". */
export function Ridge({ size = 130, hue = "#00ffa3" }: { size?: number; hue?: string }) {
  return (
    <svg
      width={size}
      height={size * 0.62}
      viewBox="0 0 130 80"
      className={s.ridge}
      style={{ ["--hue" as string]: hue }}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke={hue} strokeWidth="0.7" opacity="0.6">
        <path d="M2 74 L26 40 L38 56 L54 18 L70 48 L84 30 L98 58 L128 26" />
        <path d="M2 74 L128 74" opacity="0.4" />
        <path d="M26 40 L26 74 M54 18 L54 74 M84 30 L84 74 M98 58 L98 74" opacity="0.35" />
        <path d="M14 60 L44 60 L62 60 L92 60 L118 60" opacity="0.25" />
        <path d="M8 68 L120 68" opacity="0.2" />
      </g>
      <g fill={hue} opacity="0.9">
        <circle cx="26" cy="40" r="1.4" />
        <circle cx="54" cy="18" r="1.6" />
        <circle cx="84" cy="30" r="1.4" />
        <circle cx="98" cy="58" r="1.2" />
      </g>
    </svg>
  );
}
