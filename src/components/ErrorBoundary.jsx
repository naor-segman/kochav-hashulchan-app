import { Component } from "react";
import { reportError } from "../utils/errorReport.js";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  // Nothing was reported anywhere — no componentDidCatch at all — so a crash on
  // a customer's phone left no trace. There is no error service wired up yet
  // (Sentry is still on the plan), so the minimum honest thing is to put it on
  // the console where a support conversation can reach it.
  componentDidCatch(error, info) {
    reportError(error, { kind: "render", extra: info?.componentStack || "" });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        padding: "24px",
        background: "var(--bg)",
        color: "var(--text)",
        textAlign: "center",
        direction: "rtl",
      }}>
        <div style={{ fontSize: "40px", color: "var(--accent-text)" }} aria-hidden="true">✦</div>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text)" }}>
          אירעה שגיאה בלתי צפויה
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text2)", maxWidth: "360px", lineHeight: 1.6 }}>
          המידע שלכם שמור — זוהי תקלה טכנית בלבד.
        </p>
        {/* Reload was the ONLY action, and when the cause is the persisted event
            it re-crashes immediately — an unbreakable loop on a screen with no
            nav (the door tablet, every public token page). The second button is
            the way out: it leaves the broken route entirely. */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 24px",
              /* --accent under a white label is 3.80:1; --cta is the token for
                 exactly this and measures 4.71:1. */
              background: "var(--cta)",
              color: "var(--on-accent)",
              border: "none",
              borderRadius: "var(--radius)",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            טענו מחדש
          </button>
          <a
            href="/app"
            style={{
              padding: "10px 24px",
              background: "var(--surface)",
              color: "var(--text2)",
              border: "1px solid var(--border2)",
              borderRadius: "var(--radius)",
              fontSize: "14px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            חזרה למסך הראשי
          </a>
        </div>
        <details style={{ marginTop: "12px", fontSize: "11px", color: "var(--muted)", maxWidth: "480px" }}>
          <summary style={{ cursor: "pointer" }}>פרטי שגיאה</summary>
          <pre style={{ marginTop: "8px", textAlign: "start", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {this.state.error?.message}
          </pre>
        </details>
      </div>
    );
  }
}
