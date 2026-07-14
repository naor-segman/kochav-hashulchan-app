import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";

export default function AuthCallbackScreen() {
  const navigate = useNavigate();
  const [msg, setMsg] = useState("מאמת…");

  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => {
      if (data?.session) {
        setMsg("האימות הצליח! מעביר…");
        setTimeout(() => navigate("/", { replace: true }), 1200);
      } else {
        setMsg("הקישור פג תוקף. נסה להתחבר מחדש.");
        setTimeout(() => navigate("/login", { replace: true }), 2500);
      }
    });
  }, [navigate]);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "16px",
      background: "var(--bg)",
      color: "var(--text)",
      textAlign: "center",
      direction: "rtl",
    }}>
      <div style={{ fontSize: "36px" }}>✦</div>
      <p style={{ fontSize: "16px", fontWeight: 600 }}>{msg}</p>
    </div>
  );
}
