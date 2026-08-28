import { createApiClient } from "@hotel/api-client";

import { getStoredToken } from "./token.js";

const publicApiUrl =
  import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";

// Server-side rendering runs inside its own container/process, so it must reach the
// API via an internal network address (e.g. the "api" Docker Compose service), while
// the browser always uses the publicly reachable VITE_API_URL. In local (non-Docker)
// dev both addresses are the same, so API_INTERNAL_URL is optional.
const baseUrl =
  typeof window === "undefined"
    ? (process.env.API_INTERNAL_URL ?? publicApiUrl)
    : publicApiUrl;

export const api = createApiClient({
  baseUrl,
  getToken: getStoredToken,
});
