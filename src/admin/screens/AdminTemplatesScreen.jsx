import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { invalidateTemplateCache } from "../../utils/templateHelpers.js";
import styles from "./AdminTemplatesScreen.module.css";

// ── Constants ─────────────────────────────────────────────────────────────────

const EVENT_TYPES = ["חתונה", "בר/בת מצווה", "ברית", "חינה", "אירועי חברה"];

const FORM_DEFAULTS = {
  name:        "",
  type:        "חתונה",
  icon:        "",
  description: "",
  sort_order:  "0",
  is_active:   true,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function templateToForm(t) {
  return {
    name:        t.name        || "",
    type:        t.type        || "חתונה",
    icon:        t.icon        || "",
    description: t.description || "",
    sort_order:  String(t.sort_order ?? 0),
    is_active:   t.is_active   ?? true,
  };
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function loadTemplatesData() {
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, type, icon, description, sort_order, is_active, created_at, updated_at")
    .order("sort_order", { ascending: true })
    .order("created_at",  { ascending: true });

  if (error) throw error;
  return data || [];
}

// ── TemplateForm modal ────────────────────────────────────────────────────────

function TemplateForm({ initial, onSave, onClose, saving, formError }) {
  const [form, setForm] = useState(initial);
  const isNew = !initial.id;

  const set = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>

        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{isNew ? "תבנית חדשה" : "עריכת תבנית"}</h2>
          <button className={styles.closeBtn} onClick={onClose} type="button">✕</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form} noValidate>

          <div className={styles.formRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="tpl-name">שם התבנית *</label>
              <input
                id="tpl-name"
                className={styles.input}
                type="text"
                value={form.name}
                onChange={set("name")}
                placeholder="למשל: חתונה קלאסית"
                required
                dir="auto"
              />
            </div>
            <div className={styles.fieldNarrow}>
              <label className={styles.label} htmlFor="tpl-icon">אייקון</label>
              <div className={styles.iconWrap}>
                <input
                  id="tpl-icon"
                  className={styles.iconInput}
                  type="text"
                  value={form.icon}
                  onChange={set("icon")}
                  placeholder="💍"
                  maxLength={4}
                  dir="auto"
                />
                <span className={styles.iconPreview}>{form.icon || "?"}</span>
              </div>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="tpl-type">סוג אירוע</label>
            <select
              id="tpl-type"
              className={styles.select}
              value={form.type}
              onChange={set("type")}
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="tpl-desc">תיאור</label>
            <textarea
              id="tpl-desc"
              className={styles.textarea}
              value={form.description}
              onChange={set("description")}
              placeholder="תיאור קצר של התבנית…"
              rows={3}
              dir="auto"
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.fieldNarrow}>
              <label className={styles.label} htmlFor="tpl-order">סדר תצוגה</label>
              <input
                id="tpl-order"
                className={styles.input}
                type="number"
                min="0"
                step="1"
                value={form.sort_order}
                onChange={set("sort_order")}
              />
            </div>
            <div className={styles.fieldCheck}>
              <label className={styles.checkLabel} htmlFor="tpl-active">
                <input
                  id="tpl-active"
                  className={styles.checkbox}
                  type="checkbox"
                  checked={form.is_active}
                  onChange={set("is_active")}
                />
                פעיל
              </label>
            </div>
          </div>

          {formError && <p className={styles.formError}>{formError}</p>}

          <div className={styles.formActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={saving}>
              ביטול
            </button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? "שומר…" : isNew ? "צור תבנית" : "שמור שינויים"}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminTemplatesScreen() {
  const navigate = useNavigate();

  const [adminEmail,  setAdminEmail]  = useState(null);
  const [templates,   setTemplates]   = useState(null);   // null = loading
  const [error,       setError]       = useState(null);
  const [editTarget,  setEditTarget]  = useState(null);   // null=closed, FORM_DEFAULTS=new, obj=edit
  const [saving,      setSaving]      = useState(false);
  const [formError,   setFormError]   = useState(null);
  const [toggling,    setToggling]    = useState(null);   // id of row currently toggling

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setAdminEmail(user.email);
    });
  }, []);

  const loadTemplates = useCallback(async () => {
    if (!supabase) return;
    setTemplates(null);
    setError(null);
    try {
      setTemplates(await loadTemplatesData());
    } catch (err) {
      setError(err.message || "Failed to load templates.");
      setTemplates([]);
    }
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    navigate("/admin/login", { replace: true });
  };

  // ── CRUD handlers ───────────────────────────────────────────────────────────

  const openCreate = () => {
    setFormError(null);
    setEditTarget({ ...FORM_DEFAULTS });
  };

  const openEdit = (template) => {
    setFormError(null);
    setEditTarget({ id: template.id, ...templateToForm(template) });
  };

  const handleClose = () => {
    setEditTarget(null);
    setFormError(null);
  };

  const handleSave = async (form) => {
    if (!form.name.trim()) {
      setFormError("שם התבנית נדרש.");
      return;
    }

    setSaving(true);
    setFormError(null);

    const payload = {
      name:        form.name.trim(),
      type:        form.type,
      icon:        form.icon.trim() || null,
      description: form.description.trim() || null,
      sort_order:  Math.max(0, parseInt(form.sort_order) || 0),
      is_active:   form.is_active,
      updated_at:  new Date().toISOString(),
    };

    let err;
    if (editTarget.id) {
      ({ error: err } = await supabase
        .from("templates")
        .update(payload)
        .eq("id", editTarget.id));
    } else {
      ({ error: err } = await supabase
        .from("templates")
        .insert(payload));
    }

    setSaving(false);

    if (err) {
      setFormError(err.message || "שמירה נכשלה.");
      return;
    }

    invalidateTemplateCache();
    handleClose();
    loadTemplates();
  };

  const handleToggleActive = async (template) => {
    setToggling(template.id);
    const { error: err } = await supabase
      .from("templates")
      .update({ is_active: !template.is_active, updated_at: new Date().toISOString() })
      .eq("id", template.id);
    setToggling(null);
    if (!err) {
      invalidateTemplateCache();
      // Optimistic update to avoid full reload flash
      setTemplates((prev) =>
        (prev || []).map((t) =>
          t.id === template.id ? { ...t, is_active: !template.is_active } : t
        )
      );
    }
  };

  const loading = templates === null;

  return (
    <div className={styles.page}>

      {/* ── Top bar ── */}
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <Link to="/admin/dashboard" className={styles.backLink}>←</Link>
          <span className={styles.brandMark}>✦</span>
          <span className={styles.brandName}>ניהול תבניות</span>
          <span className={styles.brandSep}>·</span>
          <span className={styles.brandSub}>כוכב השולחן</span>
        </div>
        <div className={styles.topbarRight}>
          {adminEmail && <span className={styles.adminEmail}>{adminEmail}</span>}
          <button className={styles.logoutBtn} onClick={handleLogout}>יציאה</button>
        </div>
      </header>

      <main className={styles.main}>

        {/* ── Error banner ── */}
        {error && (
          <div className={styles.errorBanner}>
            {error}
            <button className={styles.retryBtn} onClick={loadTemplates}>נסה שוב</button>
          </div>
        )}

        {/* ── Toolbar ── */}
        <div className={styles.toolbar}>
          {!loading && !error && (
            <span className={styles.resultCount}>
              {(templates || []).length.toLocaleString()} תבניות
            </span>
          )}
          <button className={styles.newBtn} onClick={openCreate} disabled={loading}>
            + תבנית חדשה
          </button>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div className={styles.stateBox}>
            <span className={styles.loadingText}>טוען תבניות…</span>
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && !error && templates.length === 0 && (
          <div className={styles.stateBox}>
            <p className={styles.emptyTitle}>אין תבניות עדיין</p>
            <p className={styles.emptyHint}>צור תבנית ראשונה עם כפתור "תבנית חדשה" למעלה</p>
          </div>
        )}

        {/* ── Templates table ── */}
        {!loading && !error && templates.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.iconCol}></th>
                  <th>שם</th>
                  <th>סוג</th>
                  <th>תיאור</th>
                  <th className={styles.numCol}>סדר</th>
                  <th>סטטוס</th>
                  <th>נוצר</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className={!t.is_active ? styles.rowInactive : undefined}>
                    <td className={styles.iconCell}>{t.icon || <span className={styles.muted}>—</span>}</td>
                    <td className={styles.nameCell}>{t.name}</td>
                    <td className={styles.typeCell}>{t.type}</td>
                    <td className={styles.descCell}>
                      {t.description
                        ? <span title={t.description}>{t.description.length > 60 ? t.description.slice(0, 60) + "…" : t.description}</span>
                        : <span className={styles.muted}>—</span>
                      }
                    </td>
                    <td className={styles.numCell}>{t.sort_order}</td>
                    <td>
                      <span className={t.is_active ? styles.badgeActive : styles.badgeInactive}>
                        {t.is_active ? "פעיל" : "לא פעיל"}
                      </span>
                    </td>
                    <td className={styles.dateCell}>{formatDate(t.created_at)}</td>
                    <td>
                      <div className={styles.actions}>
                        <button
                          className={styles.editBtn}
                          onClick={() => openEdit(t)}
                        >
                          ערוך
                        </button>
                        <button
                          className={t.is_active ? styles.deactivateBtn : styles.activateBtn}
                          onClick={() => handleToggleActive(t)}
                          disabled={toggling === t.id}
                        >
                          {toggling === t.id ? "…" : t.is_active ? "השבת" : "הפעל"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </main>

      {/* ── Modal form ── */}
      {editTarget !== null && (
        <TemplateForm
          initial={editTarget}
          onSave={handleSave}
          onClose={handleClose}
          saving={saving}
          formError={formError}
        />
      )}

    </div>
  );
}
