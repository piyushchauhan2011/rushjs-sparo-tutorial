// The JWT is kept in localStorage, which only exists in the browser. Anything
// that needs it therefore has to run client-side — see the `ssr: false` comment
// on the /bookings route.
const TOKEN_KEY = "hotel_token";
const USER_KEY = "hotel_user";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser<T>(): T | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // A corrupt entry shouldn't wedge the app on every load.
    window.localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function storeSession(token: string, user: unknown): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}
