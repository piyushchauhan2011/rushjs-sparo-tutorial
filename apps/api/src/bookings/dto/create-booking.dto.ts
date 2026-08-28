import { IsDateString, IsInt, IsUUID, Min } from "class-validator";

export class CreateBookingDto {
  @IsUUID()
  roomTypeId!: string;

  @IsDateString()
  checkIn!: string;

  @IsDateString()
  checkOut!: string;

  @IsInt()
  @Min(1)
  guests!: number;
}
