# GonkaRouter Color Scheme

Source: https://gonkarouter.io (Tailwind 3.4.19, Material Design 3 token naming)

## Dark theme (default)

| Token | Hex | Role |
|---|---|---|
| `--surface` | `#0e0e0e` | page background |
| `--surface-container-lowest` | `#000` | deepest background |
| `--surface-container-low` | `#131313` | cards, panels |
| `--surface-container-high` | `#201f1f` | raised elements |
| `--surface-container-highest` | `#262626` | hovers, lightest surfaces |
| `--outline-variant` | `#494847` | thin borders/dividers |
| `--primary` | `#006d43` | dark green base tone |
| `--primary-dim` | `#00ef99` | main bright green accent (buttons, links) |
| `--primary-container` | `#00ffa3` | brightest neon-green — main brand accent |
| `--on-primary-container` | `#00472a` | text on green container |
| `--secondary` | `#006c51` | secondary dark green |
| `--secondary` (light alt) | `#64fcc9` | mint secondary accent |
| `--tertiary` | `#72dcff` | blue accent (gradients) |

## Brand gradient (hero text, CTA glow)

```css
linear-gradient(135deg, #00ef99, #00ffa3 45%, #72dcff)
```

Green → neon-green → blue, 135deg.

## Semantic/status accents

- `#f87171` — red (error/danger)
- `#facc15` / `#fbbf24` — yellow (warning)
- `#60a5fa` — blue (info)
- `#22d3ee` — cyan (extra accent)
- `#a855f7` / `#8b5cf6` — purple (extra)
- `#5b56f1` — indigo (extra UI)

Status colors also come with alpha variants (`1a`, `33`, `4d`, etc. = ~10%/20%/30% opacity) for badges/background highlights.

## Light theme (`html.light` override)

| Token | Hex |
|---|---|
| `--surface` | `#f4f6f8` |
| `--surface-container-low` | `#fff` |
| `--surface-container-high` | `#ebedef` |
| `--surface-container-highest` | `#e1e4e8` |
| `--outline-variant` | `#ced4da` |
| `--primary` | `#b1ffce` |
| `--primary-dim` | `#09c596` |
| `--primary-container` | `#09c596` |
| `--secondary` | `#64fcc9` |
| `--tertiary` | `#72dcff` |

## Fonts

- **Headings**: Plus Jakarta Sans (700/800), class `.font-headline`
- **Body**: Inter (300/400/500/700)
- **Code/mono/data**: JetBrains Mono (400/500)

## Style notes

- Text selection (`::selection`) — green `#00ffa3`
- Scrollbar thumb hover — green `#00ffa359`
- Promo cards — dark radial-gradient background (`#10231b → #080b0a → #060707`) + grid pattern of white lines at 4.5% opacity
- Overall feel: neon-green (`#00ffa3`) on near-black (`#0e0e0e`), blue (`#72dcff`) as secondary gradient accent
