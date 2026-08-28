import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';

import { HotelsService } from './hotels.service.js';

@Controller('hotels')
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @Get()
  search(@Query('city') city?: string) {
    return this.hotelsService.search(city);
  }

  @Get(':hotelId')
  findOne(@Param('hotelId') hotelId: string) {
    return this.hotelsService.findOne(hotelId);
  }

  @Get(':hotelId/availability')
  checkAvailability(
    @Param('hotelId') hotelId: string,
    @Query('checkIn') checkIn?: string,
    @Query('checkOut') checkOut?: string,
  ) {
    if (!checkIn || !checkOut) {
      throw new BadRequestException('checkIn and checkOut query params are required');
    }
    return this.hotelsService.checkAvailability(hotelId, checkIn, checkOut);
  }
}
