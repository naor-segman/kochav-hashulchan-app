import { Link } from "react-router-dom";

export default function NotFoundScreen() {
  return (
    <div style={{
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
          background: "var(--accent)",
          color: "#fff",
          borderRadius: "var(--radius)",
          fontSize: "14px",
          fontWeight: 600,
          textDecoration: "none",
          display: "inline-block",
        }}
      >
        חזרה לדשבורד
      </Link>
    </div>
  );
}
