import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@hotel/ui';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import * as React from 'react';

import { api } from '../lib/api.js';

interface SearchParams {
  city?: string;
  checkIn?: string;
  checkOut?: string;
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    city: typeof search.city === 'string' ? search.city : undefined,
    checkIn: typeof search.checkIn === 'string' ? search.checkIn : undefined,
    checkOut: typeof search.checkOut === 'string' ? search.checkOut : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => api.listHotels(deps),
  component: HomePage,
});

function HomePage() {
  const search = Route.useSearch();
  const hotels = Route.useLoaderData();
  const navigate = useNavigate({ from: Route.fullPath });

  const [city, setCity] = React.useState(search.city ?? '');
  const [checkIn, setCheckIn] = React.useState(search.checkIn ?? '');
  const [checkOut, setCheckOut] = React.useState(search.checkOut ?? '');

  function onSearch(event: React.FormEvent) {
    event.preventDefault();
    void navigate({ search: { city: city || undefined, checkIn: checkIn || undefined, checkOut: checkOut || undefined } });
  }

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>Find your stay</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSearch} className="grid grid-cols-1 gap-4 sm:grid-cols-4 sm:items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" placeholder="San Francisco" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="checkIn">Check in</Label>
              <Input id="checkIn" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="checkOut">Check out</Label>
              <Input id="checkOut" type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
            </div>
            <Button type="submit">Search</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {hotels.map((hotel) => (
          <Link key={hotel.id} to="/hotels/$hotelId" params={{ hotelId: hotel.id }} search={{ checkIn, checkOut }}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{hotel.name}</CardTitle>
                  <Badge variant="secondary">{hotel.starRating}★</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  {hotel.city} · {hotel.address}
                </p>
                <p className="text-sm">{hotel.description}</p>
                <p className="text-sm font-medium">
                  From ${Math.min(...hotel.roomTypes.map((rt) => rt.pricePerNight))} / night
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
        {hotels.length === 0 && <p className="text-muted-foreground">No hotels match your search.</p>}
      </div>
    </div>
  );
}
