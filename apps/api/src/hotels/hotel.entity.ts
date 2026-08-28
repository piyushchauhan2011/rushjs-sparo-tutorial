import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

import { RoomType } from './room-type.entity.js';

@Entity('hotels')
export class Hotel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column()
  city!: string;

  @Column()
  address!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'int', default: 3 })
  starRating!: number;

  @Column({ type: 'text', nullable: true })
  imageUrl!: string | null;

  @OneToMany(() => RoomType, (roomType) => roomType.hotel)
  roomTypes!: RoomType[];
}
