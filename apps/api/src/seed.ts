import 'reflect-metadata';
import 'dotenv/config';

import { DataSource } from 'typeorm';

import { Booking } from './bookings/booking.entity.js';
import { Hotel } from './hotels/hotel.entity.js';
import { RoomType } from './hotels/room-type.entity.js';
import { User } from './users/user.entity.js';

const SAMPLE_HOTELS: Array<{ hotel: Omit<Hotel, 'id' | 'roomTypes'>; roomTypes: Array<Omit<RoomType, 'id' | 'hotel' | 'hotelId' | 'bookings'>> }> = [
  {
    hotel: {
      name: 'Harbor View Grand',
      city: 'San Francisco',
      address: '1 Embarcadero Center, San Francisco, CA',
      description: 'A waterfront hotel with sweeping views of the bay and the bridge.',
      starRating: 5,
      imageUrl: null,
    },
    roomTypes: [
      { name: 'Standard King', description: 'Cozy room with a king bed.', totalRooms: 10, maxGuests: 2, pricePerNight: 189 },
      { name: 'Bay View Suite', description: 'Suite with a private balcony overlooking the bay.', totalRooms: 4, maxGuests: 4, pricePerNight: 349 },
    ],
  },
  {
    hotel: {
      name: 'Downtown Central Inn',
      city: 'Austin',
      address: '500 Congress Ave, Austin, TX',
      description: 'Budget-friendly hotel walking distance from the city center.',
      starRating: 3,
      imageUrl: null,
    },
    roomTypes: [
      { name: 'Economy Double', description: 'Two double beds, ideal for groups.', totalRooms: 15, maxGuests: 4, pricePerNight: 99 },
      { name: 'Business Single', description: 'Quiet single room with a work desk.', totalRooms: 8, maxGuests: 1, pricePerNight: 79 },
    ],
  },
  {
    hotel: {
      name: 'Mountain Ridge Lodge',
      city: 'Denver',
      address: '200 Alpine Way, Denver, CO',
      description: 'A rustic lodge at the edge of the Rockies with ski-in access.',
      starRating: 4,
      imageUrl: null,
    },
    roomTypes: [
      { name: 'Lodge Room', description: 'Warm wood-paneled room with a fireplace view.', totalRooms: 12, maxGuests: 3, pricePerNight: 159 },
      { name: 'Family Cabin Suite', description: 'Two-bedroom suite for families.', totalRooms: 5, maxGuests: 6, pricePerNight: 279 },
    ],
  },
];

async function main() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [Hotel, RoomType, Booking, User],
    synchronize: true,
  });

  await dataSource.initialize();

  const hotelRepo = dataSource.getRepository(Hotel);
  const roomTypeRepo = dataSource.getRepository(RoomType);

  const existingCount = await hotelRepo.count();
  if (existingCount > 0) {
    // eslint-disable-next-line no-console
    console.log(`Database already has ${existingCount} hotels, skipping seed.`);
    await dataSource.destroy();
    return;
  }

  for (const { hotel, roomTypes } of SAMPLE_HOTELS) {
    const savedHotel = await hotelRepo.save(hotelRepo.create(hotel));
    await roomTypeRepo.save(
      roomTypes.map((roomType) => roomTypeRepo.create({ ...roomType, hotelId: savedHotel.id })),
    );
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded ${SAMPLE_HOTELS.length} hotels.`);
  await dataSource.destroy();
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
