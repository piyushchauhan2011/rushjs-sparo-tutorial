import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { RoomType } from "../hotels/room-type.entity.js";
import { User } from "../users/user.entity.js";

@Entity("bookings")
export class Booking {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => User, (user) => user.bookings, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  @Column()
  userId!: string;

  @ManyToOne(() => RoomType, (roomType) => roomType.bookings, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "roomTypeId" })
  roomType!: RoomType;

  @Column()
  roomTypeId!: string;

  @Column({ type: "date" })
  checkIn!: string;

  @Column({ type: "date" })
  checkOut!: string;

  @Column({ type: "int" })
  guests!: number;

  @Column({
    type: "numeric",
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => Number.parseFloat(value),
    },
  })
  totalPrice!: number;

  @Column({ default: "confirmed" })
  status!: "confirmed" | "cancelled";

  @CreateDateColumn()
  createdAt!: Date;
}
