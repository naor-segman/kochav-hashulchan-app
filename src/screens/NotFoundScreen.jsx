import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { NOT_FOUND_TITLE } from "../data/seo.js";

/* The page's one <main> (38a) — except inside an event, where it renders in
   Shell's <main> and a second one would be two landmarks of the same kind.
   EventRoutes passes `landmark={false}` for that case. */
export default function NotFoundScreen({ landmark = true }) {
  const Root = landmark ? "main" : "div";

  // The tab says so too (audit 3.10, P2-6) — it read the site's home title.
  // Keyed on the path: one 404 to another keeps this screen mounted, and the
  // route default (PageMeta, an earlier sibling) rewrites the title each time.
  const { pathname } = useLocation();
  useEffect(() => { document.title = NOT_FOUND_TITLE; }, [pathname]);
  return (
    <Root style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "12px",
      padding: "24px",
      background: "var(--bg)",
      color: "var(--text)",
      textAlign: "center",
      direction: "rtl",
    }}>
      <div style={{ fontSize: "48px", color: "var(--border2)" }}>✦</div>
      <h1 style={{ fontSize: "22px", fontWeight: 700 }}>הדף לא נמצא</h1>
      <p style={{ fontSize: "14px", color: "var(--text2)", maxWidth: "320px", lineHeight: 1.6 }}>
        הכתובת שביקשתם לא קיימת.
      </p>
      <Link
        to="/app"
        style={{
          marginTop: "12px",
          padding: "10px 24px",
          /* --accent under a white label is 3.80:1 and --accent is fills-only.
             --cta is the token for exactly this job, at 4.71:1. */
          background: "var(--cta)",
          color: "var(--on-accent)",
          borderRadius: "var(--radius)",
          fontSize: "14px",
          fontWeight: 600,
          textDecoration: "none",
          display: "inline-block",
        }}
      >
        חזרה לאירועים שלי
      </Link>
    </Root>
  );
}
