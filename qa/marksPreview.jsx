/* Dev-only contact sheet for the section marks. Not part of the app bundle —
   Vite only builds index.html. Used to look at all the marks at real size
   before wiring them into screens. */
import { createRoot } from "react-dom/client";
import "../src/styles/tokens.css";
import "../src/styles/reset.css";
import SectionMark from "../src/components/ui/SectionMark.jsx";
import { SECTION_MARK_NAMES } from "./sectionMarkNames.js";

const brand = SECTION_MARK_NAMES.filter((n) => !n.startsWith("admin"));
const adm   = SECTION_MARK_NAMES.filter((n) => n.startsWith("admin"));

function Row({ names, tone, bg }) {
  return (
    <div style={{ background: bg, padding: "18px", display: "flex", flexWrap: "wrap", gap: "14px" }}>
      {names.map((n) => (
        <div key={n} style={{ textAlign: "center", width: 96 }}>
          <SectionMark name={n} tone={tone} size={26} tile />
          <div style={{ fontSize: 10, marginTop: 6, color: tone === "ondark" ? "#F5F5F6" : "#4A4F57" }}>{n}</div>
        </div>
      ))}
    </div>
  );
}

function Small({ names, tone, bg }) {
  return (
    <div style={{ background: bg, padding: "14px", display: "flex", flexWrap: "wrap", gap: "16px" }}>
      {names.map((n) => <SectionMark key={n} name={n} tone={tone} size={18} />)}
    </div>
  );
}

createRoot(document.getElementById("marks")).render(
  <div style={{ fontFamily: "Heebo, sans-serif" }}>
    <Row   names={brand} tone="brand"  bg="#FFFFFF" />
    <Row   names={brand} tone="brand"  bg="#F5F5F6" />
    <Small names={brand} tone="brand"  bg="#FFFFFF" />
    <Row   names={brand} tone="ondark" bg="#21242A" />
    <Row   names={adm}   tone="admin"  bg="#fafafa" />
    <Small names={adm}   tone="admin"  bg="#fafafa" />
  </div>
);
