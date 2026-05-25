import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import styles from "./AdminSettingsScreen.module.css";

// ── Constants ─────────────────────────────────────────────────────────────────

const SETTINGS_ROW_ID = "00000000-0000-0000-0000-000000000001";

const FEATURE_FLAG_DEFS = [
  { key: "cloud_sync",        label: "סנכרון ענן"         },
  { key: "templates_picker",  label: "בחירת תבניות"      },
  { key: "ai_seating",        label: "סידור ישיבה AI"    },
  { key: "multi_user",        label: "ריבוי משתמשים"     },
];

const EVENT_TYPE_OPTS = ["חתונה", "בר/בת מצווה", "ברית", "חינה", "אירועי חברה"];

const EMPTY_FORM = {
  product_name:   "כוכב השולחן",
  support_email:  "",
  table_capacity: "8",
  guest_count:    "100",
  event_type:     "חתונה",
  system_notes:   "",
  // feature flags are kept in a separate flat object
  cloud_sync:        false,
  templates_picker:  false,
  ai_seating:        false,
  multi_user:        false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowToForm(row) {
  const ed = row.event_defaults || {};
  const ff = row.feature_flags  || {};
  return {
    product_name:    row.product_name    || "כוכב השולחן",
    support_email:   row.support_email   || "",
    table_capacity:  String(ed.table_capacity ?? 8),
    guest_count:     String(ed.guest_count    ?? 100),
    event_type:      ed.event_type            || "חתונה",
    system_notes:    row.system_notes    || "",
    cloud_sync:        !!(ff.cloud_sync),
    templates_picker:  !!(ff.templates_picker),
    ai_seating:        !!(ff.ai_seating),
    multi_user:        !!(ff.multi_user),
  };
}

function formToPayload(form) {
  return {
    id:            SETTINGS_ROW_ID,
    product_name:  form.product_name.trim() || "כוכב השולחן",
    support_email: form.support_email.trim() || null,
    event_defaults: {
      table_capacity: Math.max(1, parseInt(form.table_capacity) || 8),
      guest_count:    Math.max(1, parseInt(form.guest_count)    || 100),
      event_type:     form.event_type,
    },
    feature_flags: {
      cloud_sync:       form.cloud_sync,
      templates_picker: form.templates_picker,
      ai_seating:       form.ai_seating,
      multi_user:       form.multi_user,
    },
    system_notes: form.system_notes.trim() || null,
    updated_at:   new Date().toISOString(),
  };
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminSettingsScreen() {
  const navigate = useNavigate();

  const [adminEmail,   setAdminEmail]   = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [notConfigured,setNotConfigured]= useState(false);  // table missing
  const [error,        setError]        = useState(null);
  const [form,         setForm]         = useState(EMPTY_FORM);
  const [saving,       setSaving]       = useState(false);
  const [saveError,    setSaveError]    = useState(null);
  const [saveSuccess,  setSaveSuccess]  = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setAdminEmail(user.email);
    });
  }, []);

  const loadSettings = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    setNotConfigured(false);

    const { data, error: err } = await supabase
      .from("app_settings")
      .select("*")
      .eq("id", SETTINGS_ROW_ID)
      .maybeSingle();

    setLoading(false);

    if (err) {
      // 42P01 = relation does not exist (table not migrated yet)
      if (err.code === "42P01") {
        setNotConfigured(true);
      } else {
        setError(err.message || "טעינת ההגדרות נכשלה.");
      }
      return;
    }

    if (data) {
      setForm(rowToForm(data));
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    navigate("/admin/login", { replace: true });
  };

  const set = (field) => (e) =>
    setForm((prev) => ({
      ...prev,
      [field]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.product_name.trim()) {
      setSaveError("שם המוצר נדרש.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const { error: err } = await supabase
      .from("app_settings")
      .upsert(formToPayload(form), { onConflict: "id" });

    setSaving(false);

    if (err) {
      setSaveError(err.message || "שמירה נכשלה.");
      return;
    }

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className={styles.page}>

      {/* ── Top bar ── */}
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <Link to="/admin/dashboard" className={styles.backLink}>←</Link>
          <span className={styles.brandMark}>✦</span>
          <span className={styles.brandName}>הגדרות מערכת</span>
          <span className={styles.brandSep}>·</span>
          <span className={styles.brandSub}>כוכב השולחן</span>
        </div>
        <div className={styles.topbarRight}>
          {adminEmail && <span className={styles.adminEmail}>{adminEmail}</span>}
          <button className={styles.logoutBtn} onClick={handleLogout}>יציאה</button>
        </div>
      </header>

      <main className={styles.main}>

        {/* ── Loading ── */}
        {loading && (
          <div className={styles.stateBox}>
            <span className={styles.loadingText}>טוען הגדרות…</span>
          </div>
        )}

        {/* ── Table missing ── */}
        {!loading && notConfigured && (
          <div className={styles.notConfiguredBox}>
            <div className={styles.notConfiguredIcon}>⚙️</div>
            <h2 className={styles.notConfiguredTitle}>טבלת ההגדרות לא נמצאה</h2>
            <p className={styles.notConfiguredText}>
              הפעל את המיגרציה הבאה ב-Supabase SQL Editor כדי להפעיל את מסך ההגדרות:
            </p>
            <code className={styles.migrationName}>
              supabase/migrations/20260524000002_app_settings.sql
            </code>
            <button className={styles.retryBtn} onClick={loadSettings}>
              נסה שוב לאחר הפעלת המיגרציה
            </button>
          </div>
        )}

        {/* ── Load error ── */}
        {!loading && error && (
          <div className={styles.errorBanner}>
            {error}
            <button className={styles.retryInlineBtn} onClick={loadSettings}>נסה שוב</button>
          </div>
        )}

        {/* ── Settings form ── */}
        {!loading && !notConfigured && !error && (
          <form onSubmit={handleSave} noValidate>

            {/* Section: Product */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>פרטי מוצר</h2>
              <div className={styles.card}>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="s-name">שם המוצר *</label>
                  <input
                    id="s-name"
                    className={styles.input}
                    type="text"
                    value={form.product_name}
                    onChange={set("product_name")}
                    dir="auto"
                    required
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="s-email">אימייל תמיכה</label>
                  <input
                    id="s-email"
                    className={styles.input}
                    type="email"
                    value={form.support_email}
                    onChange={set("support_email")}
                    placeholder="support@example.com"
                    dir="ltr"
                  />
                </div>

              </div>
            </section>

            {/* Section: Event Defaults */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>ברירות מחדל לאירועים</h2>
              <div className={styles.card}>

                <div className={styles.formRow}>
                  <div className={styles.fieldNarrow}>
                    <label className={styles.label} htmlFor="s-capacity">קיבולת שולחן</label>
                    <input
                      id="s-capacity"
                      className={styles.input}
                      type="number"
                      min="1"
                      step="1"
                      value={form.table_capacity}
                      onChange={set("table_capacity")}
                    />
                  </div>
                  <div className={styles.fieldNarrow}>
                    <label className={styles.label} htmlFor="s-guests">מספר אורחים</label>
                    <input
                      id="s-guests"
                      className={styles.input}
                      type="number"
                      min="1"
                      step="1"
                      value={form.guest_count}
                      onChange={set("guest_count")}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="s-type">סוג אירוע</label>
                    <select
                      id="s-type"
                      className={styles.select}
                      value={form.event_type}
                      onChange={set("event_type")}
                    >
                      {EVENT_TYPE_OPTS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

              </div>
            </section>

            {/* Section: Feature Flags */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>דגלי תכונות</h2>
              <div className={styles.card}>
                <p className={styles.flagHint}>
                  תכונות שאינן מופעלות עדיין. שינוי ערכים כאן משפיע על התנהגות האפליקציה עבור כל הלקוחות.
                </p>
                <div className={styles.flagGrid}>
                  {FEATURE_FLAG_DEFS.map(({ key, label }) => (
                    <label key={key} className={styles.flagRow}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={form[key]}
                        onChange={set(key)}
                      />
                      <span className={styles.flagLabel}>{label}</span>
                      <span className={styles.flagBadge}>
                        {form[key] ? "פעיל" : "כבוי"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </section>

            {/* Section: System Notes */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>הערות מערכת</h2>
              <div className={styles.card}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="s-notes">הערות פנימיות (לא גלויות ללקוחות)</label>
                  <textarea
                    id="s-notes"
                    className={styles.textarea}
                    value={form.system_notes}
                    onChange={set("system_notes")}
                    rows={4}
                    dir="auto"
                    placeholder="הערות תחזוקה, לוג שינויים ידני…"
                  />
                </div>
              </div>
            </section>

            {/* ── Actions ── */}
            {saveError && <p className={styles.saveError}>{saveError}</p>}
            {saveSuccess && <p className={styles.saveSuccess}>ההגדרות נשמרו בהצלחה ✓</p>}

            <div className={styles.formActions}>
              <button type="submit" className={styles.saveBtn} disabled={saving}>
                {saving ? "שומר…" : "שמור הגדרות"}
              </button>
            </div>

          </form>
        )}

      </main>
    </div>
  );
}
