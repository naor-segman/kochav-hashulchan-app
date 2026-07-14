import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
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
        <div style={{ fontSize: "40px" }}>✦</div>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text)" }}>
          אירעה שגיאה בלתי צפויה
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text2)", maxWidth: "360px", lineHeight: 1.6 }}>
          המידע שלך שמור — זוהי תקלה טכנית בלבד.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: "8px",
            padding: "10px 24px",
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius)",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          טען מחדש
        </button>
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
