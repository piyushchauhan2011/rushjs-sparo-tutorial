import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";

import {
  CurrentUser,
  type RequestUser,
} from "../auth/current-user.decorator.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { BookingsService } from "./bookings.service.js";
import { CreateBookingDto } from "./dto/create-booking.dto.js";

@Controller("bookings")
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create({ ...dto, userId: user.id });
  }

  @Get("me")
  findMine(@CurrentUser() user: RequestUser) {
    return this.bookingsService.findForUser(user.id);
  }
}
