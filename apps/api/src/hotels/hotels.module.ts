import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Booking } from "../bookings/booking.entity.js";
import { Hotel } from "./hotel.entity.js";
import { HotelsController } from "./hotels.controller.js";
import { HotelsService } from "./hotels.service.js";
import { RoomType } from "./room-type.entity.js";

@Module({
  imports: [TypeOrmModule.forFeature([Hotel, RoomType, Booking])],
  controllers: [HotelsController],
  providers: [HotelsService],
  exports: [HotelsService],
})
export class HotelsModule {}
