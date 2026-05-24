// Monotonic ID factory — unique within a single browser session.
// Prefixed with the boot timestamp so IDs from different tabs don't collide
// and localStorage merges are safe without a server.
//
// TODO(cloud-sync): Replace with server-generated UUIDs (or ULIDs) when adding
// a backend. Client-generated IDs are fine for local storage but can conflict
// if the same user logs in from multiple devices simultaneously.

let _id = Date.now();
export const uid = () => String(++_id);
