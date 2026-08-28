export type BookingStatus = 'confirmed' | 'cancelled';

export interface Booking {
  id: string;
  userId: string;
  roomTypeId: string;
  hotelId: string;
  hotelName: string;
  roomTypeName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  totalPrice: number;
  status: BookingStatus;
  createdAt: string;
}

export interface CreateBookingRequest {
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}
