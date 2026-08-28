import type { Booking as BookingDto } from '@hotel/shared-types';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { HotelsService } from '../hotels/hotels.service.js';
import { Booking } from './booking.entity.js';

function toDto(booking: Booking): BookingDto {
  return {
    id: booking.id,
    userId: booking.userId,
    roomTypeId: booking.roomTypeId,
    hotelId: booking.roomType.hotel.id,
    hotelName: booking.roomType.hotel.name,
    roomTypeName: booking.roomType.name,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    guests: booking.guests,
    totalPrice: booking.totalPrice,
    status: booking.status,
    createdAt: booking.createdAt.toISOString(),
  };
}

export interface CreateBookingInput {
  userId: string;
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking) private readonly bookingsRepo: Repository<Booking>,
    private readonly hotelsService: HotelsService,
  ) {}

  async create(input: CreateBookingInput) {
    const roomType = await this.hotelsService.findRoomType(input.roomTypeId);

    if (new Date(input.checkOut) <= new Date(input.checkIn)) {
      throw new BadRequestException('checkOut must be after checkIn');
    }
    if (input.guests < 1 || input.guests > roomType.maxGuests) {
      throw new BadRequestException(`guests must be between 1 and ${roomType.maxGuests}`);
    }

    const availability = await this.hotelsService.checkAvailability(
      roomType.hotelId,
      input.checkIn,
      input.checkOut,
    );
    const thisRoomType = availability.find((entry) => entry.roomType.id === roomType.id);
    if (!thisRoomType || thisRoomType.availableRooms < 1) {
      throw new BadRequestException('No rooms of this type are available for the selected dates');
    }

    const nights = Math.ceil(
      (new Date(input.checkOut).getTime() - new Date(input.checkIn).getTime()) / (1000 * 60 * 60 * 24),
    );

    const booking = this.bookingsRepo.create({
      userId: input.userId,
      roomTypeId: input.roomTypeId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      guests: input.guests,
      totalPrice: nights * roomType.pricePerNight,
      status: 'confirmed',
    });

    const saved = await this.bookingsRepo.save(booking);
    saved.roomType = roomType;
    return toDto(saved);
  }

  async findForUser(userId: string) {
    const bookings = await this.bookingsRepo.find({
      where: { userId },
      relations: { roomType: { hotel: true } },
      order: { createdAt: 'DESC' },
    });
    return bookings.map(toDto);
  }
}
