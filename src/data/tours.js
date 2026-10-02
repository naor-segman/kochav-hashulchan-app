// What the guided tour says on each screen (WORKPLAN 124, owner 2.10 #13).
//
// Keyed by the `screen` the Shell is given. A step lights the element marked
// `data-tour="<target>"`; one without a target is a centred card. Steps are in
// the order a host USES the parts, not the order they are painted. A part that
// is not on the page (an empty list has no filter bar) is skipped by the tour.
//
// Every sentence here was checked against the code it describes — a tour that
// promises a button the screen does not have is worse than no tour. Plural
// address, like the rest of the app.

export const TOURS = {
  hub: [
    { title: "ברוכים הבאים למפת האירוע",
      text: "סיור של דקה על החלקים של המסך, לפי הסדר. אפשר לדלג בכל רגע, ולראות אותו שוב מכפתור הסיור שבראש המסך." },
    { target: "hub.head", title: "האירוע שלכם",
      text: "השם, התאריך, האולם וכמה זמן נשאר. משנים אותם ב\"פרטי האירוע\"." },
    { target: "shell.areas", title: "שלושה אזורים, לפי הזמן",
      text: "הרשימה וההושבה, ההכנות, ויום האירוע. לחיצה על אזור פותחת אותו, ובתוכו המסכים שלו." },
    { target: "hub.resume", title: "המשיכו מכאן",
      text: "תמיד מצביע על השלב הבא שעוד לא עשיתם. לא בטוחים מה עכשיו? לוחצים כאן." },
    { target: "hub.areas", title: "כל המסכים במקום אחד",
      text: "שלב שהושלם מקבל ✓. כל מסך נפתח מתי שרוצים — הסדר הוא המלצה, לא חובה.",
      done: "בואו נתחיל" },
  ],

  guests: [
    { target: "guests.ways", title: "שלוש דרכים להכניס מוזמנים",
      text: "להקליד אחד-אחד, להדביק רשימה שכבר יש לכם (מוואטסאפ או מאקסל), או לשלוח קישור שהמשפחה תמלא במקומכם." },
    { target: "guests.form", title: "כאן מוסיפים",
      text: "שם, צד, וכמה כיסאות לשמור. משפחה של ארבעה היא שורה אחת עם 4 כיסאות. Enter בשדה השם מוסיף ועובר לאורח הבא." },
    { target: "guests.counts", title: "המספרים",
      text: "כמה ברשימה, כמה אישרו, כמה סירבו וכמה כבר משובצים לשולחן." },
    { target: "guests.filter", title: "חיפוש וסינון",
      text: "מוצאים אורח לפי שם, צד, קבוצה או סטטוס הגעה. מכאן גם מורידים את הרשימה לאקסל." },
    { target: "guests.list", title: "הרשימה",
      text: "כל אורח בשורה משלו. בשורה עצמה: וואטסאפ אליו, עריכה ומחיקה." },
    { target: "next", title: "השלב הבא",
      text: "כשהרשימה מוכנה, גם אם חלקית, ממשיכים לשולחנות. הכל נשמר לבד.",
      done: "הבנתי" },
  ],

  seating: [
    { target: "seating.run", title: "הושבה בלחיצה אחת",
      text: "מושיבה את כולם לפי הצדדים, הקבוצות והאילוצים שהגדרתם. אפשר להריץ שוב בכל שלב, ושולחן או אורח נעולים לא זזים. \"בטלו\" מחזיר את מה שהיה." },
    { target: "seating.waiting", title: "מחכים לשולחן",
      text: "מי שעוד לא שובץ. גוררים אותו לשולחן, או בוחרים שולחן מהרשימה שליד השם." },
    { target: "seating.tables", title: "השולחנות",
      text: "כל שולחן מראה מי יושב בו וכמה מקומות נשארו. גוררים אורח משולחן לשולחן כדי להחליף." },
    { target: "seating.print", title: "הדפסות ויום האירוע",
      text: "סידור מלא, גרסה קצרה לצוות האולם, כרטיסי שולחן, ועמדת הכניסה שמחכה ליום האירוע.",
      done: "הבנתי" },
  ],
};

export const hasTour = (screen) => Object.hasOwn(TOURS, screen);
