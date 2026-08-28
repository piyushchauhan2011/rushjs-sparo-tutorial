import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { HotelsModule } from "../hotels/hotels.module.js";
import { Booking } from "./booking.entity.js";
import { BookingsController } from "./bookings.controller.js";
import { BookingsService } from "./bookings.service.js";

@Module({
  imports: [TypeOrmModule.forFeature([Booking]), HotelsModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
