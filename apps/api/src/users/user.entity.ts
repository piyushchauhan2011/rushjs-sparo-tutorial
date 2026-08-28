import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";

import { Booking } from "../bookings/booking.entity.js";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  passwordHash!: string;

  @Column()
  fullName!: string;

  @OneToMany(() => Booking, (booking) => booking.user)
  bookings!: Booking[];
}
