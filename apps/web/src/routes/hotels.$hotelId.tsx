import type { RoomAvailability } from "@hotel/shared-types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@hotel/ui";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";

import { ApiError } from "@hotel/api-client";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth-context.js";

interface SearchParams {
  checkIn?: string;
  checkOut?: string;
}

export const Route = createFileRoute("/hotels/$hotelId")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    checkIn: typeof search.checkIn === "string" ? search.checkIn : undefined,
    checkOut: typeof search.checkOut === "string" ? search.checkOut : undefined,
  }),
  loader: ({ params }) => api.getHotel(params.hotelId),
  component: HotelDetailPage,
});

function HotelDetailPage() {
  const hotel = Route.useLoaderData();
  const search = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate({ from: Route.fullPath });

  const [checkIn, setCheckIn] = React.useState(search.checkIn ?? "");
  const [checkOut, setCheckOut] = React.useState(search.checkOut ?? "");
  const [availability, setAvailability] = React.useState<
    RoomAvailability[] | null
  >(null);
  const [error, setError] = React.useState<string | null>(null);
  const [bookingRoomTypeId, setBookingRoomTypeId] = React.useState<
    string | null
  >(null);

  async function checkAvailability(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    void navigate({ search: { checkIn, checkOut } });
    try {
      setAvailability(await api.checkAvailability(hotel.id, checkIn, checkOut));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to check availability",
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{hotel.name}</h1>
          <Badge variant="secondary">{hotel.starRating}★</Badge>
        </div>
        <p className="text-muted-foreground">
          {hotel.city} · {hotel.address}
        </p>
        <p className="mt-2">{hotel.description}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Check availability</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={checkAvailability}
            className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="checkIn">Check in</Label>
              <Input
                id="checkIn"
                type="date"
                required
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="checkOut">Check out</Label>
              <Input
                id="checkOut"
                type="date"
                required
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
              />
            </div>
            <Button type="submit">Check availability</Button>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {hotel.roomTypes.map((roomType) => {
          const availableRooms = availability?.find(
            (entry) => entry.roomType.id === roomType.id,
          )?.availableRooms;
          return (
            <Card key={roomType.id}>
              <CardHeader>
                <CardTitle>{roomType.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  {roomType.description}
                </p>
                <p className="text-sm">
                  Sleeps up to {roomType.maxGuests} guests
                </p>
                <p className="font-medium">${roomType.pricePerNight} / night</p>
                {availability && (
                  <p className="text-sm">
                    {availableRooms && availableRooms > 0
                      ? `${availableRooms} room(s) available`
                      : "No rooms available for these dates"}
                  </p>
                )}
                <Button
                  disabled={!availability || !availableRooms}
                  onClick={() =>
                    user
                      ? setBookingRoomTypeId(roomType.id)
                      : void navigate({ to: "/login" })
                  }
                >
                  {user ? "Book this room" : "Log in to book"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <BookingDialog
        roomType={
          hotel.roomTypes.find((rt) => rt.id === bookingRoomTypeId) ?? null
        }
        checkIn={checkIn}
        checkOut={checkOut}
        onClose={() => setBookingRoomTypeId(null)}
      />
    </div>
  );
}

function BookingDialog({
  roomType,
  checkIn,
  checkOut,
  onClose,
}: {
  roomType: {
    id: string;
    name: string;
    maxGuests: number;
    pricePerNight: number;
  } | null;
  checkIn: string;
  checkOut: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [guests, setGuests] = React.useState(1);
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function onConfirm() {
    if (!roomType) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await api.createBooking({
        roomTypeId: roomType.id,
        checkIn,
        checkOut,
        guests,
      });
      onClose();
      void navigate({ to: "/bookings" });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to create booking",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={roomType !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm booking</DialogTitle>
        </DialogHeader>
        {roomType && (
          <div className="flex flex-col gap-3">
            <p>
              {roomType.name} · {checkIn} → {checkOut}
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="guests">Guests</Label>
              <Input
                id="guests"
                type="number"
                min={1}
                max={roomType.maxGuests}
                value={guests}
                onChange={(e) => setGuests(Number(e.target.value))}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isSubmitting}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
