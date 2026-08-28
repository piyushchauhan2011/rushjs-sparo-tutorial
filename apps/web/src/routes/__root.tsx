import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";

import { Button } from "@hotel/ui";

import { AuthProvider, useAuth } from "../lib/auth.js";
import appCss from "../styles/app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Hotel Booking" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ErrorPage,
});

function ErrorPage({ error }: { error: Error }) {
  // Without this, any loader failure renders TanStack Router's default boundary,
  // which dumps a raw stack trace. The most common cause in local development is
  // simply that the API isn't running (`make dev` starts it alongside Postgres).
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">
        {error.message === "Failed to fetch" || error.message === "fetch failed"
          ? "Couldn't reach the API. Is it running on http://localhost:3001?"
          : error.message}
      </p>
      <Button asChild>
        <Link to="/">Back to search</Link>
      </Button>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">
        The page you're looking for doesn't exist.
      </p>
      <Button asChild>
        <Link to="/">Back to search</Link>
      </Button>
    </div>
  );
}

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <AuthProvider>
          <SiteHeader />
          <main className="mx-auto max-w-5xl px-4 py-8">
            <Outlet />
          </main>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}

function SiteHeader() {
  const { user, logout } = useAuth();

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link to="/" className="text-lg font-semibold">
          Hotel Booking
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <Link to="/bookings" className="hover:underline">
                My bookings
              </Link>
              <span className="text-muted-foreground">{user.fullName}</span>
              <button
                type="button"
                onClick={logout}
                className="hover:underline"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="hover:underline">
                Log in
              </Link>
              <Link to="/register" className="hover:underline">
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
