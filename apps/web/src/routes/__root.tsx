import { createRootRoute, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router';

import { AuthProvider, useAuth } from '../lib/auth.js';
import appCss from '../styles/app.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Hotel Booking' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
});

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
              <button type="button" onClick={logout} className="hover:underline">
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
