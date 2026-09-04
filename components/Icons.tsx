/**
 * The icon set the reference uses. All inline SVG on `currentColor`, so an icon
 * inherits whatever the row it sits in is coloured — a green shield in the
 * details rail and a grey one in a disabled row come from the same component.
 *
 * Drawn on a 24-unit grid at stroke width 1.6, which is the weight the reference
 * uses: thin enough to read as instrument marking, heavy enough to survive at
 * 16px.
 */

type IconProps = { size?: number; className?: string };

function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: "false" as const,
  };
}

export function ShieldCheck({ size = 20, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M12 2.8 4.8 5.6v5.9c0 4.3 2.9 8.2 7.2 9.7 4.3-1.5 7.2-5.4 7.2-9.7V5.6Z" />
      <path d="m9.1 11.9 2 2 3.8-3.9" />
    </svg>
  );
}

export function CheckCircle({ size = 20, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="m8.4 12.1 2.4 2.4 4.8-4.9" />
    </svg>
  );
}

export function MinusCircle({ size = 20, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M8.4 12h7.2" />
    </svg>
  );
}

export function SplitCircle({ size = 20, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 3.4v17.2" />
    </svg>
  );
}

export function Copy({ size = 16, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <rect x="9" y="9" width="11" height="11" rx="2.4" />
      <path d="M15 6.2A2.2 2.2 0 0 0 12.8 4H6.2A2.2 2.2 0 0 0 4 6.2v6.6A2.2 2.2 0 0 0 6.2 15" />
    </svg>
  );
}

export function ArrowRight({ size = 18, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M4.6 12h14.2" />
      <path d="m13.2 6.4 5.6 5.6-5.6 5.6" />
    </svg>
  );
}

export function LinkIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M10 13.6a3.9 3.9 0 0 0 5.9.4l2.4-2.4a3.9 3.9 0 0 0-5.5-5.5l-1.4 1.3" />
      <path d="M14 10.4a3.9 3.9 0 0 0-5.9-.4l-2.4 2.4a3.9 3.9 0 0 0 5.5 5.5l1.4-1.3" />
    </svg>
  );
}

export function TextIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M5.4 6.4V4.8h13.2v1.6" />
      <path d="M12 4.8v14.4" />
      <path d="M9.4 19.2h5.2" />
    </svg>
  );
}

export function ImageIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <rect x="4" y="5.2" width="16" height="13.6" rx="2.4" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m4.8 16.8 4.4-4.2 3.4 3.2 2.6-2.4 4 3.6" />
    </svg>
  );
}

export function XIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M17.3 3.6h3.1l-6.8 7.8 8 10.6h-6.3l-4.9-6.4-5.6 6.4H1.7l7.3-8.4L1.3 3.6h6.4l4.4 5.9ZM16.2 20.1h1.7L6.9 5.3H5.1Z" />
    </svg>
  );
}

export function DocIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M13.4 3.6H7a2 2 0 0 0-2 2v12.8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9.2Z" />
      <path d="M13.4 3.6v5.6H19" />
      <path d="M8.6 13h6.8M8.6 16.2h4.4" />
    </svg>
  );
}

export function SearchIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <circle cx="10.8" cy="10.8" r="6.2" />
      <path d="m15.4 15.4 4 4" />
    </svg>
  );
}

export function MirrorIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M12 3.2v17.6" />
      <path d="M8.6 6.8 4 12l4.6 5.2Z" />
      <path d="M15.4 6.8 20 12l-4.6 5.2Z" />
    </svg>
  );
}

export function ScaleIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M12 4.4v15.2M7 19.6h10" />
      <path d="M4.4 7.6h15.2" />
      <path d="M4.4 7.6 2 13.4h4.8ZM19.6 7.6 17.2 13.4H22Z" />
    </svg>
  );
}

/** The Gonka mark: a hexagon with a G notched out of its right shoulder. */
export function GonkaMark({ size = 26, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path
        d="M16 1.6 28.4 8.8v14.4L16 30.4 3.6 23.2V8.8Z"
        fill="currentColor"
      />
      <path
        d="M20.2 12.4a5.4 5.4 0 1 0 .6 6.3h-4.4v-2.9h6.8"
        fill="none"
        stroke="#04140d"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
