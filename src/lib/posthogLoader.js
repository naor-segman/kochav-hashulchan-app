// posthog-js behind a module of our own, so its chunk is named posthogLoader-*
// and vite.config.js can keep it out of the service worker's precache. Loaded
// only after a yes to the cookie question (analytics.js).
export { default } from "posthog-js";
