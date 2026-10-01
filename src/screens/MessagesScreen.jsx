import { useEffect, useMemo, useRef, useState } from "react";
import { messageSignature } from "../data/company.js";
import {
  MESSAGE_STAGES, audienceFor, audienceLabel, reachable,
  renderTemplate, whatsappLink, linkForStage,
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
  // Every message in this screen carries a public link into it. In guest mode
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

  /* ONE LINK PER STAGE (checklist 88). This was a single `link` for all six —
     the RSVP token if there was one, else the site — so the save-the-date,
     sent months before any invitation exists, asked guests to confirm
     attendance, and the event site reached almost nobody. See STAGE_LINKS in
     messageSequence.js for which link each stage carries and why. */
  const stages = useMemo(() => MESSAGE_STAGES.map(s => {
    const audience  = audienceFor(s, ev.guests);
    const withPhone = reachable(audience);
    const done      = audience.filter(g => sent[s.key]?.[g.id]).length;
    const link      = linkForStage(s.key, ev, window.location.origin);
    // `audienceKey` keeps the stage's own key: `audience` is replaced by the
    // guest list, and audienceLabel(list) found nothing and said "כל האורחים"
    // on every stage — the reminder that goes to 2 people said everyone
    // (third review 30.9, סב53).
    return { ...s, body: custom[s.key] ?? s.body, audience, audienceKey: s.audience, withPhone, done, link };
  }), [ev, sent, custom]);

  const totalPlanned = stages.reduce((n, s) => n + s.withPhone.length, 0);

  const markSent = (stageKey, guestId) => patchEvent(e => ({
    ...e,
    messagesSent: {
      ...(e.messagesSent || {}),
      [stageKey]: { ...((e.messagesSent || {})[stageKey] || {}), [guestId]: Date.now() },
    },
  }));

  /* ── Opened is not sent (ת2) ───────────────────────────────────────────────
     A tap on "שלחו" opens WhatsApp with the text ready; the guest is sent
     nothing until the host presses send THERE. The guest used to be marked
     "נשלח" at the tap — a host who closed WhatsApp without sending saw the
     guest done, the count went up, and the reminders skipped them.

     So the tap only records that WhatsApp was OPENED, and the row asks
     "נשלח?" — focused when the host comes back to this tab. Only "כן" writes
     to messagesSent, the synced field, in the same shape as before. "Opened"
     is this device's, kept in sessionStorage: it is a question waiting for
     the person who tapped, not a fact about the guest, so it is not synced. */
  const openedKey = `kh_msg_opened:${ev.id}`;
  const [opened, setOpened] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(openedKey) || "{}") || {}; } catch { return {}; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(openedKey, JSON.stringify(opened)); } catch { /* full or blocked */ }
  }, [openedKey, opened]);
  const setOpenedFor = (stageKey, guestId, on) => setOpened(prev => {
    const stage = { ...(prev[stageKey] || {}) };
    if (on) stage[guestId] = Date.now(); else delete stage[guestId];
    return { ...prev, [stageKey]: stage };
  });
  const confirmSent = (stageKey, guestId) => { markSent(stageKey, guestId); setOpenedFor(stageKey, guestId, false); };

  // Back from WhatsApp: put focus on the question for the guest just opened.
  const lastOpened = useRef(null);
  useEffect(() => {
    const onVisible = () => {
      if (document.hidden || !lastOpened.current) return;
      document.querySelector(`[data-ask-sent="${lastOpened.current}"]`)?.focus();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

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

  // RG9: a template that asks for {{קישור}} on a stage whose page is not
  // published goes out without it — "נשמח שתאשרו הגעה:" and then nothing. It
  // was sent, and marked sent, with one tap. Now the first send of such a
  // stage asks, once per stage per visit; "no" sends and marks nothing.
  const [noLinkOk, setNoLinkOk] = useState(() => new Set());
  const missingLink = stage => !stage.link && /\{\{\s*קישור\s*\}\}/.test(stage.body || "");
  const sendTo = async (stage, g, url) => {
    if (missingLink(stage) && !noLinkOk.has(stage.key)) {
      const ok = await confirm(
        "בהודעה הזאת יש מקום לקישור, אבל הדף שלה עוד לא פורסם — היא תצא בלי קישור.\n\n"
        + "אפשר לפרסם את הדף קודם, או לשלוח בכל זאת.",
        { confirmLabel: "שלחו בלי קישור" },
      );
      if (!ok) return;
      setNoLinkOk(prev => new Set(prev).add(stage.key));
    }
    setOpenedFor(stage.key, g.id, true);
    lastOpened.current = `${stage.key}:${g.id}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const textFor = (stage, g) =>
    renderTemplate(stage.body, {
      event: { ...ev, date: fmtDate(ev.date) },
      guest: g, table: tableOf(g), link: stage.link?.url || "",
    }) + messageSignature();

  return (
    <div className={base.page}>
      {dialog}
      <PageHeader
        title="הודעות לאורחים"
        mark="messages"
        sub="רצף ההודעות משמירת התאריך ועד התודה — עם סימון למי כבר שלחתם."
        aside={
          <div className={base.pills}>
            <StatPill n={stages.reduce((n, s) => n + s.done, 0)} label="נשלחו" color="var(--green)" />
            <StatPill n={totalPlanned} label="מתוכננות" primary />
          </div>
        }
      />

      {/* What the host needs from this card is the answer to "will this cost me
          money?", and that answer is no. What used to follow it — a projected
          bill for automated sending we have not built, at a rate we had guessed
          — is our cost structure, not theirs. It priced a service they cannot
          buy and cannot avoid, on a screen whose job is to help them send an
          invitation. The analysis moved to WORKPLAN, where it belongs and where
          it now carries Meta's real rate card. */}
      <div className={base.card}>
        <SectionLabel>עלות</SectionLabel>
        <p className={base.fieldHint}>
          השליחה נעשית מהוואטסאפ שלכם, ולכן <b>ללא עלות</b> — כאן רק מכינים את
          הטקסט, בוחרים למי, ורואים למי כבר שלחתם.
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
                  {stage.when} · {audienceLabel(stage.audienceKey)}
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
                    {/* The message as a guest will read it, not the template:
                        the raw {{שם}} was what the host saw here (WORKPLAN
                        108). Filled for a real guest of this stage — the
                        first one it goes to — through the same textFor that
                        builds what is sent, so the two cannot differ. With no
                        guest yet the name slot says what goes there. */}
                    {(() => {
                      // Someone this stage actually SENDS to: a guest with a
                      // phone first, then anyone in its audience — never a guest
                      // outside it. The reminder was previewed "for" a guest who
                      // had declined, beside "no guests match this stage"
                      // (29.9 review). Nobody in the audience: a placeholder.
                      const sample = stage.withPhone.find(g => g.name?.trim())
                        || stage.audience.find(g => g.name?.trim())
                        || { id: "", name: "שם האורח" };
                      return <>
                        {/* <bdi>: a Latin name ending in a period ("Tal S.")
                            painted its period on the wrong side (review). */}
                        <p className={styles.previewFor}>כך ההודעה תיראה אצל <bdi>{sample.name}</bdi>:</p>
                        <div className={styles.preview}>{textFor(stage, sample)}</div>
                      </>;
                    })()}
                    {/* Which page {{קישור}} opens in THIS stage, said out loud.
                        With one link per stage the host can no longer assume
                        "the link" means the RSVP form — and when a stage has
                        none (the site is not published, say), the message goes
                        out without it, which the host must hear here rather
                        than discover from a guest. */}
                    <p className={styles.linkNote}>
                      {stage.link
                        ? <>הקישור בהודעה הזאת: <b>{stage.link.label}</b></>
                        : "ההודעה הזאת תצא בלי קישור — הדף שמתאים לה עוד לא פורסם."}
                    </p>
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
                        const asking  = !!opened[stage.key]?.[g.id];
                        const url = whatsappLink(g.phone, textFor(stage, g));
                        return (
                          <div key={g.id} className={[styles.guestRow, already && !asking ? styles.guestDone : ""].filter(Boolean).join(" ")}>
                            <span className={styles.guestName}>{g.name}</span>
                            {already && !asking && <span className={styles.sentTag}>נשלח <Icon name="check" size={11} /></span>}
                            {asking ? (
                              <span className={styles.askSent} role="group" aria-label={`נשלחה ההודעה ל${g.name}?`}>
                                <span className={styles.askText}>נפתח בוואטסאפ — נשלח?</span>
                                <button
                                  type="button"
                                  className={styles.askYes}
                                  data-ask-sent={`${stage.key}:${g.id}`}
                                  onClick={() => confirmSent(stage.key, g.id)}
                                  aria-label={`כן, נשלחה ל${g.name}`}
                                >כן</button>
                                <button
                                  type="button"
                                  className={styles.askNo}
                                  onClick={() => setOpenedFor(stage.key, g.id, false)}
                                  aria-label={`לא נשלחה ל${g.name}`}
                                >לא</button>
                              </span>
                            ) : url && (
                              <button
                                className={styles.waBtn}
                                type="button"
                                onClick={() => guard("ההודעה לאורחים", () => { sendTo(stage, g, url); })}
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
                        <Icon name="bulb" /> לחיצה על "שלחו" פותחת את וואטסאפ עם הטקסט מוכן. אחרי שתלחצו "שלח"
                        בוואטסאפ ותחזרו לכאן, סמנו "כן" — רק אז האורח נספר כמי שקיבל את ההודעה.
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
