import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

import { Booking } from '../bookings/booking.entity.js';
import { Hotel } from './hotel.entity.js';

@Entity('room_types')
export class RoomType {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'int' })
  totalRooms!: number;

  @Column({ type: 'int' })
  maxGuests!: number;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: { to: (value: number) => value, from: (value: string) => Number.parseFloat(value) },
  })
  pricePerNight!: number;

  @ManyToOne(() => Hotel, (hotel) => hotel.roomTypes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'hotelId' })
  hotel!: Hotel;

  @Column()
  hotelId!: string;

  @OneToMany(() => Booking, (booking) => booking.roomType)
  bookings!: Booking[];
}
