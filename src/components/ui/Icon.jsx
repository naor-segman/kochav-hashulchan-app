// Shared line-icon set — one consistent visual system across the app, replacing
// decorative emoji (an "AI-generated" tell). Stroke uses currentColor so icons
// inherit their context's color; every icon is aria-hidden by default.
//
// Usage: <Icon name="users" />  ·  size defaults to 1em (scales with font-size),
// pass size={20} for a fixed px size.

import styles from "./Icon.module.css";

const P = {
  users:      <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6" /><path d="M17 14.2A5.5 5.5 0 0 1 20.5 19" /></>,
  calendar:   <><rect x="3.5" y="4.5" width="17" height="16" rx="2" /><path d="M3.5 9h17M8 2.5v4M16 2.5v4" /></>,
  clipboard:  <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M8.5 10h7M8.5 14h7M8.5 18h4" /></>,
  card:       <><rect x="2.5" y="5.5" width="19" height="13" rx="2" /><path d="M2.5 10h19" /></>,
  settings:   <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
  key:        <><circle cx="8" cy="8" r="4" /><path d="M11 11l8 8M16 16l2-2M18 18l2-2" /></>,
  trash:      <><path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13" /></>,
  chart:      <><path d="M4 20h16" /><path d="M7 16V9M12 16V5M17 16v-4" /></>,
  print:      <><path d="M7 9V3h10v6" /><rect x="4" y="9" width="16" height="8" rx="2" /><path d="M7 14h10v6H7z" /></>,
  cards:      <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M8 3h13v13" /></>,
  qr:         <><rect x="3.5" y="3.5" width="6" height="6" rx="1" /><rect x="14.5" y="3.5" width="6" height="6" rx="1" /><rect x="3.5" y="14.5" width="6" height="6" rx="1" /><path d="M14.5 14.5h3v3M20.5 14.5v6M14.5 20.5h3" /></>,
  phone:      <><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></>,
  chat:       <><path d="M4 5h16v11H9l-4 4V5Z" /></>,
  send:       <><path d="M20 4 3 11l7 2 2 7 8-16Z" /></>,
  search:     <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  money:      <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v10M9.5 9.5a2.5 2 0 0 1 5 0c0 2-5 1-5 3a2.5 2 0 0 0 5 0" /></>,
  lock:       <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  unlock:     <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 7.5-1.9" /></>,
  refresh:    <><path d="M20 11a8 8 0 1 0-.5 3M20 5v6h-6" /></>,
  building:   <><path d="M4 21V6l8-3 8 3v15" /><path d="M4 21h16M9 21v-4h6v4M8 9h2M14 9h2M8 13h2M14 13h2" /></>,
  sparkle:    <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /></>,
  eye:        <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff:     <><path d="M4 4l16 16M9.5 5.4A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6 7.3A17 17 0 0 0 2 12s3.5 7 10 7a9.5 9.5 0 0 0 3.8-.8" /></>,
  mail:       <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 6.5 12 12l8.5-5.5" /></>,
  pin:        <><path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
  chair:      <><path d="M6 4v7h12V4M6 11l-1 9M18 11l1 9M5 15h14" /></>,
  hexagon:    <><path d="M12 3l7.5 4.5v9L12 21l-7.5-4.5v-9L12 3Z" /></>,
  bell:       <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0" /></>,
  bolt:       <><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></>,
  link:       <><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /><path d="M9 6.5h5a3.5 3.5 0 0 1 3.5 3.5v5" /></>,
  bulb:       <><path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10.5c-.7.7-1 1.2-1 2.5H9c0-1.3-.3-1.8-1-2.5A6 6 0 0 1 12 3Z" /></>,
  globe:      <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.5 6 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-6-3.5-9s1-6.5 3.5-9Z" /></>,
  check:      <><path d="M20 6 9 17l-5-5" /></>,
  scale:      <><path d="M12 4v16M7 20h10M5 8h14M5 8l-2.5 5a3 3 0 0 0 5 0L5 8Zm14 0-2.5 5a3 3 0 0 0 5 0L19 8ZM12 4a2 2 0 0 0 0 4" /></>,

  // Added when the emoji were pulled out of the app chrome. Same 24 grid, same
  // 1.6 hairline, so they sit beside the originals without a seam.
  food:       <><path d="M5 3v7a2.5 2.5 0 0 0 5 0V3M7.5 12.5V21" /><path d="M17 3c-1.6 1.4-2.4 3.2-2.4 5.4 0 1.7.8 2.8 2.4 3.1V21" /></>,
  together:   <><circle cx="7" cy="9" r="3" /><circle cx="17" cy="9" r="3" /><path d="M10 9h4" /><path d="M2.5 19a4.5 4.5 0 0 1 9 0M12.5 19a4.5 4.5 0 0 1 9 0" /></>,
  apart:      <><circle cx="7" cy="9" r="3" /><circle cx="17" cy="9" r="3" /><path d="M10.2 7.2l3.6 3.6M13.8 7.2l-3.6 3.6" /><path d="M2.5 19a4.5 4.5 0 0 1 9 0M12.5 19a4.5 4.5 0 0 1 9 0" /></>,
  camera:     <><path d="M3.5 8.5h3.2l1.6-2.4h7.4l1.6 2.4h3.2v10a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" /><circle cx="12" cy="13.4" r="3.4" /></>,
  download:   <><path d="M12 3.5v11m0 0 4-4m-4 4-4-4" /><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17" /></>,
  alert:      <><path d="M12 3.6 21.2 20H2.8z" /><path d="M12 10v4.4" /><circle cx="12" cy="17.4" r=".4" /></>,
  cloud:      <><path d="M7 18.5a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17.4 11a3.8 3.8 0 0 1-.4 7.5z" /></>,
  compass:    <><circle cx="12" cy="12" r="8.8" /><path d="m15.4 8.6-2 4.8-4.8 2 2-4.8z" /></>,
  star:       <><path d="m12 3.6 2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 10l6-.8z" /></>,
  diamond:    <><path d="m12 2.8 9.2 9.2-9.2 9.2L2.8 12z" /></>,
  plus:       <><path d="M12 5v14M5 12h14" /></>,
  edit:       <><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="m14.5 6 3 3" /></>,
  heart:      <><path d="M12 20.4s-8-4.9-8-10.3A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 8 2.5c0 5.4-8 10.3-8 10.3Z" /></>,
  gift:       <><rect x="3.5" y="9.5" width="17" height="11" rx="1.8" /><path d="M2.5 6h19v3.5h-19zM12 6v14.5" /><path d="M12 6C10.4 3 8 2.6 7.3 4c-.6 1.3 1.3 2 4.7 2m0 0c1.6-3 4-3.4 4.7-2 .6 1.3-1.3 2-4.7 2" /></>,
  tag:        <><path d="M11.4 3.5H20v8.6l-8.6 8.6a1.6 1.6 0 0 1-2.3 0l-6.3-6.3a1.6 1.6 0 0 1 0-2.3z" /><circle cx="16.4" cy="7.6" r="1.4" /></>,
  dot:        <><circle cx="12" cy="12" r="5" /></>,

  // Venue fixtures on the floor plan. They used to be ⛩ 🍸 🎛 🎁 — four
  // different typefaces' worth of styling sitting on a photo of a real hall.
  chuppah:    <><path d="M3 8.5 12 3.5l9 5" /><path d="M5 8.5V21M19 8.5V21M5 8.5h14" /><path d="M8.5 21v-5a3.5 3.5 0 0 1 7 0v5" /></>,
  stage:      <><rect x="2.5" y="12" width="19" height="7.5" rx="1.6" /><path d="M6 12V8.5h12V12" /><path d="M12 8.5V4.5" /><circle cx="12" cy="3.4" r="1.4" /></>,
  glass:      <><path d="M5 4h14l-7 7.4z" /><path d="M12 11.4V19M8 19.5h8" /></>,
  note:       <><circle cx="7" cy="17.5" r="3" /><circle cx="18" cy="15" r="2.6" /><path d="M10 17.5V6l10.6-2.4v14" /></>,
  turntable:  <><circle cx="12" cy="12" r="8.8" /><circle cx="12" cy="12" r="2.2" /><path d="m17.6 6.6-4 4" /></>,
  doorway:    <><path d="M14.5 3.5H20V21h-5.5" /><path d="M11 12H3m3.5-3.5L3 12l3.5 3.5" /></>,

  // Event types on the dashboard — the first drawing a new host ever sees.
  rings:      <><circle cx="8.6" cy="14" r="6" /><circle cx="15.4" cy="14" r="6" /><path d="m13 4.4 2.4-2 2.4 2-2.4 2.6z" /></>,
  star6:      <><path d="m12 2.8 8 13.9H4z" /><path d="m12 21.2 8-13.9H4z" /></>,
  leaf:       <><path d="M20 4C10 4.6 4.5 8.5 4.5 14.5A5.5 5.5 0 0 0 10 20c6 0 9.6-6 10-16Z" /><path d="M6.5 21c1.5-5 5-9 11-13" /></>,
};

export default function Icon({ name, size, className, strokeWidth = 1.6, style }) {
  const paths = P[name];
  if (!paths) return null;
  const px = size ? `${size}px` : "1em";
  return (
    <svg
      className={[styles.icon, className].filter(Boolean).join(" ")}
      style={style}
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}
