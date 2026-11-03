// Where the members API lives. For local development, `?api=http://127.0.0.1:8787` overrides it —
// only when the page itself runs on localhost, so a crafted link can't send the passcode elsewhere.
const DEFAULT_API_BASE = "https://membership-api.richardfu71.workers.dev";

const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);

export const API_BASE = (isLocal && new URLSearchParams(location.search).get("api")) || DEFAULT_API_BASE;
