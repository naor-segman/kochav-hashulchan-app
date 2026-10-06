import { markLogo, stackedLogo } from "./logoGeometry.js";
import { COMPANY } from "../../data/company.js";

/* The Unica Plan logo (owner, 6.10 — direction B2). `variant="stacked"` is the
   full logo; `variant="mark"` is the table alone, for tight places. `tone`
   picks the ink: "light" grounds get dark letters, "dark" grounds light ones.
   The ROLES in logoGeometry.js map to tokens here, so a palette change lands
   in the logo too. The SVG carries the name for screen readers; pass
   `decorative` where a visible name already sits beside it. */
const STACKED = stackedLogo();
const MARK = markLogo();

const PAINT = {
  light: { ink: "var(--text)", detail: "var(--text)", paper: "var(--surface)" },
  dark:  { ink: "var(--nav-text)", detail: "var(--text)", paper: "var(--surface)" },
};
const SHARED = {
  accent: "var(--accent)", white: "var(--white)",
  chair1: "var(--accent)", chair2: "var(--logo-teal)", chair3: "var(--logo-yellow)", chair4: "var(--logo-orange)",
};

function Shape({ s, paint }) {
  const fill = s.fill ? paint(s.fill) : "none";
  const stroke = s.stroke ? paint(s.stroke) : undefined;
  const common = {
    fill, stroke,
    strokeWidth: s.stroke ? s.strokeWidth : undefined,
    strokeLinecap: s.stroke ? "round" : undefined,
    strokeLinejoin: s.stroke ? "round" : undefined,
  };
  if (s.tag === "path") return <path d={s.d} transform={s.x ? `translate(${s.x.toFixed(2)} 0)` : undefined} {...common} />;
  if (s.tag === "circle") return <circle cx={s.cx} cy={s.cy} r={s.r} {...common} />;
  return <rect x={s.x} y={s.y} width={s.width} height={s.height} rx={s.rx}
    transform={s.rotate ? `rotate(${s.rotate})` : undefined} {...common} />;
}

export default function Logo({ variant = "stacked", tone = "light", className, decorative = false, title = COMPANY.name }) {
  const logo = variant === "mark" ? MARK : STACKED;
  const roles = { ...SHARED, ...PAINT[tone] };
  const paint = role => (role === "none" ? "none" : roles[role]);
  const a11y = decorative ? { "aria-hidden": true, focusable: "false" } : { role: "img", "aria-label": title };
  return (
    <svg className={className} viewBox={logo.viewBox} xmlns="http://www.w3.org/2000/svg" {...a11y}>
      {logo.groups.map((g, i) => (
        <g key={i} transform={g.transform || undefined}>
          {g.shapes.map((s, j) => <Shape key={j} s={s} paint={paint} />)}
        </g>
      ))}
    </svg>
  );
}
