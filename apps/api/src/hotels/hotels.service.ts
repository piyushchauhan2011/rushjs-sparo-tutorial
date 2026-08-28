import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Booking } from '../bookings/booking.entity.js';
import { Hotel } from './hotel.entity.js';
import { RoomType } from './room-type.entity.js';

@Injectable()
export class HotelsService {
  constructor(
    @InjectRepository(Hotel) private readonly hotelsRepo: Repository<Hotel>,
    @InjectRepository(RoomType) private readonly roomTypesRepo: Repository<RoomType>,
    @InjectRepository(Booking) private readonly bookingsRepo: Repository<Booking>,
  ) {}

  async search(city?: string) {
    const query = this.hotelsRepo.createQueryBuilder('hotel').leftJoinAndSelect('hotel.roomTypes', 'roomType');

    if (city) {
      query.where('hotel.city ILIKE :city', { city: `%${city}%` });
    }

    return query.getMany();
  }

  async findOne(hotelId: string) {
    const hotel = await this.hotelsRepo.findOne({ where: { id: hotelId }, relations: { roomTypes: true } });
    if (!hotel) {
      throw new NotFoundException('Hotel not found');
    }
    return hotel;
  }

  async findRoomType(roomTypeId: string) {
    const roomType = await this.roomTypesRepo.findOne({ where: { id: roomTypeId }, relations: { hotel: true } });
    if (!roomType) {
      throw new NotFoundException('Room type not found');
    }
    return roomType;
  }

  /** Rooms of a given type are available if fewer overlapping bookings exist than totalRooms. */
  async checkAvailability(hotelId: string, checkIn: string, checkOut: string) {
    const hotel = await this.findOne(hotelId);

    const results = await Promise.all(
      hotel.roomTypes.map(async (roomType) => {
        const overlapping = await this.bookingsRepo
          .createQueryBuilder('booking')
          .where('booking.roomTypeId = :roomTypeId', { roomTypeId: roomType.id })
          .andWhere('booking.status = :status', { status: 'confirmed' })
          .andWhere('booking.checkIn < :checkOut', { checkOut })
          .andWhere('booking.checkOut > :checkIn', { checkIn })
          .getCount();

        return { roomType, availableRooms: Math.max(roomType.totalRooms - overlapping, 0) };
      }),
    );

    return results;
  }
}
