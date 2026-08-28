import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@hotel/ui";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { api } from "../lib/api.js";
import { getStoredToken } from "../lib/token.js";

export const Route = createFileRoute("/bookings")({
  // The JWT lives in localStorage, which the server cannot read. With SSR on,
  // this route's loader ran on the server with no token and the API answered
  // 401, so the page failed with a 500 before the browser ever got involved.
  // Rendering it client-side means the loader runs where the token exists.
  ssr: false,
  beforeLoad: () => {
    if (!getStoredToken()) {
      throw redirect({ to: "/login" });
    }
  },
  loader: () => api.myBookings(),
  component: BookingsPage,
});

function BookingsPage() {
  const bookings = Route.useLoaderData();

  return (
    <Card>
      <CardHeader>
        <CardTitle>My bookings</CardTitle>
      </CardHeader>
      <CardContent>
        {bookings.length === 0 ? (
          <p className="text-muted-foreground">You have no bookings yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hotel</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Check in</TableHead>
                <TableHead>Check out</TableHead>
                <TableHead>Guests</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map((booking) => (
                <TableRow key={booking.id}>
                  <TableCell>{booking.hotelName}</TableCell>
                  <TableCell>{booking.roomTypeName}</TableCell>
                  <TableCell>{booking.checkIn}</TableCell>
                  <TableCell>{booking.checkOut}</TableCell>
                  <TableCell>{booking.guests}</TableCell>
                  <TableCell>${booking.totalPrice}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        booking.status === "confirmed" ? "default" : "secondary"
                      }
                    >
                      {booking.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
