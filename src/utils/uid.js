// V1 ID factory — copied verbatim from legacy/v1-seating-app.jsx

let _id = Date.now();
export const uid = () => String(++_id);
