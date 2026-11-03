// Where the members API lives. `?api=http://localhost:8787` overrides it for local development.
const DEFAULT_API_BASE = "https://membership-api.REPLACE_ME.workers.dev";

export const API_BASE = new URLSearchParams(location.search).get("api") || DEFAULT_API_BASE;
