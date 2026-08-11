import { useMemo, useState } from "react";
import { messageSignature } from "../data/company.js";
import {
  MESSAGE_STAGES, audienceFor, audienceLabel, reachable,
  renderTemplate, whatsappLink, estimateCost,
} from "../data/messageSequence.js";
import { fmtDate } from "../utils/dateFormat.js";
import Field from "../components/ui/Field.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import SectionLabel from "../components/ui/SectionLabel.jsx";
import StatPill from "../components/ui/StatPill.jsx";
import base from "../styles/screenBase.module.css";
import Icon from "../components/ui/Icon.jsx";
import { useConfirm } from "../components/ui/useConfirm.jsx";
import styles from "./MessagesScreen.module.css";
import { useShareGate } from "../components/share/useShareGate.jsx";

/**
 * One place for everything sent to guests.
 *
 * Two problems at once: the WhatsApp button and templates were buried in the
 * guest list where hosts never found them, and there was no sequence at all —
 * just one message at a time with nothing tracking who already got what.
 *
 * Sending is still manual (WhatsApp opens with the text ready). Everything
 * around it — sequence, audiences, per-guest sent state, cost estimate — is
 * built, so connecting an API later is a connection rather than a project.
 */
export default function MessagesScreen({ activeEvent: ev, patchEvent, showToast }) {
  // Every message in this screen carries an RSVP link into it. In guest mode
  // that link resolves to nothing, so sending forty of them is worse than
  // sending none — see useShareGate.
  const { guard, gate } = useShareGate();
  const { confirm, dialog } = useConfirm();
  const [openStage, setOpenStage] = useState("invitation");
  const [editing, setEditing]     = useState(null);

  // Memoized on the event fields themselves: `ev.messagesSent || {}` builds a
  // fresh object on every render when the field is absent, which made the
  // stages memo below recompute every time regardless of its dependencies.
  const sent   = useMemo(() => ev.messagesSent     || {}, [ev.messagesSent]);      // { [stageKey]: { [guestId]: ts } }
  const custom = useMemo(() => ev.messageTemplates || {}, [ev.messageTemplates]);  // { [stageKey]: body }

  const link = useMemo(() => {
    const t = ev.tokens || {};
    if (t.rsvp)   return `${window.location.origin}/rsvp/${t.rsvp}`;
    if (t.invite) return `${window.location.origin}/invite/${t.invite}`;
    return "";
  }, [ev.tokens]);

  const stages = useMemo(() => MESSAGE_STAGES.map(s => {
    const audience  = audienceFor(s, ev.guests);
    const withPhone = reachable(audience);
    const done      = audience.filter(g => sent[s.key]?.[g.id]).length;
    return { ...s, body: custom[s.key] ?? s.body, audience, withPhone, done };
  }), [ev.guests, sent, custom]);

  const totalPlanned = stages.reduce((n, s) => n + s.withPhone.length, 0);

  const markSent = (stageKey, guestId) => patchEvent(e => ({
    ...e,
    messagesSent: {
      ...(e.messagesSent || {}),
      [stageKey]: { ...((e.messagesSent || {})[stageKey] || {}), [guestId]: Date.now() },
    },
  }));

  const clearStage = async (stageKey) => {
    if (!await confirm("לאפס את הסימונים של השלב הזה?", { danger: true, confirmLabel: "אפסו" })) return;
    patchEvent(e => {
      const next = { ...(e.messagesSent || {}) };
      delete next[stageKey];
      return { ...e, messagesSent: next };
    });
    showToast("הסימונים אופסו");
  };

  const saveTemplate = (stageKey, body) => {
    patchEvent(e => ({ ...e, messageTemplates: { ...(e.messageTemplates || {}), [stageKey]: body } }));
    setEditing(null);
    showToast("התבנית נשמרה ✓");
  };

  const resetTemplate = (stageKey) => {
    patchEvent(e => {
      const next = { ...(e.messageTemplates || {}) };
      delete next[stageKey];
      return { ...e, messageTemplates: next };
    });
    setEditing(null);
    showToast("התבנית הוחזרה לברירת המחדל");
  };

  const tableOf = g => {
    const tid = ev.seating?.[g.id];
    return tid ? ev.tables?.find(t => t.id === tid) : null;
  };

  const textFor = (stage, g) =>
    renderTemplate(stage.body, {
      event: { ...ev, date: fmtDate(ev.date) },
      guest: g, table: tableOf(g), link,
    }) + messageSignature();

  return (
    <div className={base.page}>
      {dialog}
      <PageHeader
        title="הודעות לאורחים"
        mark="messages"
        sub="רצף ההודעות מהשמירת-תאריך ועד התודה — עם מעקב מי כבר קיבל מה."
        aside={
          <div className={base.pills}>
            <StatPill n={stages.reduce((n, s) => n + s.done, 0)} label="נשלחו" color="var(--green)" />
            <StatPill n={totalPlanned} label="מתוכננות" primary />
          </div>
        }
      />

      {/* Cost is shown before anything is automated, because "unlimited
          messages" is exactly how a package quietly loses money. */}
      <div className={base.card}>
        <SectionLabel>עלות משוערת</SectionLabel>
        <p className={base.fieldHint}>
          כרגע השליחה ידנית דרך וואטסאפ ולכן <b>ללא עלות</b>. אם נחבר שליחה
          אוטומטית, רצף מלא לאירוע הזה הוא <b>{totalPlanned} הודעות</b> ≈{" "}
          <b>₪{estimateCost(totalPlanned)}</b> (בהערכה של ₪0.12 להודעה).
          זו הסיבה שחבילה "ללא הגבלה" חייבת תקרה.
        </p>
      </div>

      {stages.map(stage => {
        const isOpen  = openStage === stage.key;
        const pending = stage.withPhone.filter(g => !sent[stage.key]?.[g.id]);
        const noPhone = stage.audience.length - stage.withPhone.length;

        return (
          <div key={stage.key} className={base.card}>
            <button
              className={styles.stageHead}
              onClick={() => setOpenStage(isOpen ? null : stage.key)}
              aria-expanded={isOpen}
            >
              <span className={styles.stageIcon} aria-hidden="true"><Icon name={stage.icon} size={18} /></span>
              <span className={styles.stageMain}>
                <span className={styles.stageTitle}>{stage.label}</span>
                <span className={styles.stageWhen}>
                  {stage.when} · {audienceLabel(stage.audience)}
                </span>
              </span>
              <span className={styles.stageCount}>
                {stage.done}/{stage.withPhone.length}
              </span>
              <span className={styles.chev} aria-hidden="true"><Icon name={isOpen ? "chevronUp" : "chevronDown"} size={14} /></span>
            </button>

            {isOpen && (
              <div className={styles.stageBody}>
                {editing === stage.key ? (
                  <TemplateEditor
                    initial={stage.body}
                    onSave={body => saveTemplate(stage.key, body)}
                    onReset={() => resetTemplate(stage.key)}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <>
                    <div className={styles.preview}>{stage.body}</div>
                    <div className={styles.stageActions}>
                      <button className={base.btnSm} onClick={() => setEditing(stage.key)}>ערכו תבנית</button>
                      {stage.done > 0 && (
                        <button className={[base.btnSm, base.btnGhost].join(" ")}
                          onClick={() => clearStage(stage.key)}>אפסו סימונים</button>
                      )}
                    </div>
                  </>
                )}

                {stage.audience.length === 0 ? (
                  <p className={styles.empty}>אין אורחים שמתאימים לשלב הזה כרגע.</p>
                ) : (
                  <>
                    <p className={styles.summary}>
                      {stage.withPhone.length} אורחים עם טלפון
                      {noPhone > 0 && <> · <span className={styles.warn}>{noPhone} ללא טלפון — לא ניתן לשלוח</span></>}
                    </p>

                    <div className={styles.guestList}>
                      {stage.withPhone.map(g => {
                        const already = !!sent[stage.key]?.[g.id];
                        const url = whatsappLink(g.phone, textFor(stage, g));
                        return (
                          <div key={g.id} className={[styles.guestRow, already ? styles.guestDone : ""].filter(Boolean).join(" ")}>
                            <span className={styles.guestName}>{g.name}</span>
                            {already && <span className={styles.sentTag}>נשלח <Icon name="check" size={11} /></span>}
                            {url && (
                              <button
                                className={styles.waBtn}
                                type="button"
                                onClick={() => guard("ההודעה לאורחים", () => {
                                  markSent(stage.key, g.id);
                                  window.open(url, "_blank", "noopener,noreferrer");
                                })}
                              >
                                {already ? "שלחו שוב" : "שלחו בוואטסאפ"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {pending.length > 0 && (
                      <p className={styles.hint}>
                        <Icon name="bulb" /> לחיצה על "שלחו" פותחת את וואטסאפ עם הטקסט מוכן ומסמנת את האורח כנשלח.
                        עדיין צריך ללחוץ "שלח" בוואטסאפ עצמו.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
      {gate}
    </div>
  );
}

function TemplateEditor({ initial, onSave, onReset, onCancel }) {
  const [body, setBody] = useState(initial);
  return (
    <div className={styles.editor}>
      <Field label="תוכן ההודעה" hint="{{שם}} · {{אירוע}} · {{תאריך}} · {{מקום}} · {{שולחן}} · {{קישור}}">
        <textarea className={base.input} rows={8} value={body} onChange={e => setBody(e.target.value)} />
      </Field>
      <div className={styles.stageActions}>
        <button className={base.btnPrimary} onClick={() => onSave(body)}>שמרו</button>
        <button className={[base.btnSm, base.btnGhost].join(" ")} onClick={onReset}>ברירת מחדל</button>
        <button className={[base.btnSm, base.btnGhost].join(" ")} onClick={onCancel}>ביטול</button>
      </div>
    </div>
  );
}
