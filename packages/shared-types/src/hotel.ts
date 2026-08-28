export interface Hotel {
  id: string;
  name: string;
  city: string;
  address: string;
  description: string;
  starRating: number;
  imageUrl: string | null;
}

export interface RoomType {
  id: string;
  hotelId: string;
  name: string;
  description: string;
  totalRooms: number;
  maxGuests: number;
  pricePerNight: number;
}

export interface HotelWithRoomTypes extends Hotel {
  roomTypes: RoomType[];
}

export interface HotelSearchQuery {
  city?: string;
  checkIn?: string;
  checkOut?: string;
}

export interface RoomAvailability {
  roomType: RoomType;
  availableRooms: number;
}
