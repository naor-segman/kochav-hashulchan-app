import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { fetchCollabGuestsOwner, subscribeCollabGuests } from "../utils/publicTokens.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { getSideLabels } from "../utils/eventHelpers.js";
import Banner from "../components/feedback/Banner.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import Icon from "../components/ui/Icon.jsx";
import QrCode from "../components/ui/QrCode.jsx";
import StatPill from "../components/ui/StatPill.jsx";
import base from "../styles/screenBase.module.css";

const norm = (s) => (s || "").toString().trim();
const complete = (r) => !!(norm(r.name) && norm(r.phone) && r.side && norm(r.guest_group));

// The shared collaborative table hub. Family members fill the live table via the
// link; complete rows sync into the guest list automatically (useCollabSync), so
// there is no manual import here — just share, watch, and export.
export default function CollabReviewScreen({ activeEvent: ev, go, showToast }) {
  const [rows, setRows] = useState([]);
  const [loadState, setLoadState] = useState("loading"); // loading | ready | offline

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !ev.cloudId) { setLoadState("offline"); return; }
    try { setRows(await fetchCollabGuestsOwner(ev.cloudId)); setLoadState("ready"); }
    catch { setLoadState("offline"); }
  }, [ev.cloudId]);

  useEffect(() => { load(); }, [load]);

  // Live counts update as the family edits the table.
  useEffect(() => {
    if (!isSupabaseConfigured || !ev.cloudId) return;
    const unsub = subscribeCollabGuests(ev.cloudId, (payload) => {
      setRows((prev) => {
        if (payload.eventType === "DELETE") return prev.filter((r) => r.id !== payload.old?.id);
        const row = payload.new; if (!row) return prev;
        return prev.some((r) => r.id === row.id) ? prev.map((r) => (r.id === row.id ? row : r)) : [...prev, row];
      });
    });
    return unsub;
  }, [ev.cloudId]);

  const collabLink = ev.tokens?.collab ? window.location.origin + "/collab/" + ev.tokens.collab : null;
  const sides = getSideLabels(ev);
  const completeCount = rows.filter(complete).length;

  const downloadExcel = () => {
    const aoa = [["שם מלא", "טלפון", "צד", "קבוצה", "כמות"]];
    (ev.guests || []).forEach((g) => aoa.push([g.name || "", g.phone || "", sides[g.side] || "", g.group || "", g.count || 1]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 22 }, { wch: 15 }, { wch: 12 }, { wch: 16 }, { wch: 7 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "רשימת אורחים");
    XLSX.writeFile(wb, `אורחים-${(ev.name || "אירוע").replace(/[^\p{L}\p{N} -]/gu, "")}.xlsx`);
  };

  return (
    <div className={base.page}>
      <PageHeader
        title="טבלה משותפת"
        icon={<Icon name="users" />}
        sub="שתפו קישור אחד עם המשפחה — כולם ממלאים את אותה טבלה יחד, בזמן אמת. כל רשומה מלאה נכנסת אוטומטית לרשימת האורחים."
      />

      {collabLink ? (
        <div className={base.card}>
          <p className={base.fieldHint}>הקישור לטבלה המשותפת (שם וטלפון בהקלדה, השאר מרשימה — בלי טעויות):</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input className={base.input} readOnly value={collabLink} dir="ltr" />
            <button className={base.btnSm} onClick={async () => {
              try { await navigator.clipboard.writeText(collabLink); showToast("הקישור הועתק ✓"); }
              catch { showToast("העתיקו ידנית", "err"); }
            }}>העתיקו</button>
            <QrCode url={collabLink} label="טבלה משותפת" filename="qr-collab" />
          </div>
          <div className={base.actionBar} style={{ marginTop: 14 }}>
            <a className={base.btnPrimary} href={collabLink} target="_blank" rel="noopener noreferrer">פתחו את הטבלה ←</a>
            <button className={base.btnSecondary} onClick={downloadExcel} disabled={!(ev.guests || []).length}>⬇ הורדה לאקסל</button>
          </div>
        </div>
      ) : (
        <Banner variant="warn">הקישור ייווצר אוטומטית — שמרו את האירוע והתחברו לחשבון כדי לסנכרן לענן.</Banner>
      )}

      {loadState === "offline" && (
        <Banner variant="warn">
          {isSupabaseConfigured
            ? "האירוע עדיין לא סונכרן לענן — הטבלה המשותפת תתחיל לעבוד אחרי הסנכרון הראשון (התחברו לחשבון)."
            : "סנכרון ענן אינו מוגדר בסביבה זו."}
        </Banner>
      )}

      {loadState === "ready" && (
        <div className={base.card}>
          <div className={base.pills}>
            <StatPill n={rows.length} label="רשומות בטבלה" />
            <StatPill n={completeCount} label="מלאות ומסונכרנות" color="var(--green)" />
            {rows.length - completeCount > 0 && (
              <StatPill n={rows.length - completeCount} label="ממתינות להשלמה" color="var(--warn)" />
            )}
          </div>
          <p className={base.fieldHint} style={{ marginTop: 12 }}>
            הרשומות המלאות כבר ברשימת האורחים שלכם — הכל מתעדכן אוטומטית בשני הכיוונים.
          </p>
          <div style={{ marginTop: 14 }}>
            <button className={base.btnSecondary} onClick={() => go("guests")}>→ לרשימת האורחים</button>
          </div>
        </div>
      )}
    </div>
  );
}
