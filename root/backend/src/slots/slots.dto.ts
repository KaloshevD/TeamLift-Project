import { Transform } from 'class-transformer';
import { IsEmail, IsInt, IsNotEmpty, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateSlotDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be HH:mm (24h)' })
  startTime: string;

  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes: number;
}

export class BookSlotDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @Transform(trim)
  @IsEmail()
  @MaxLength(255)
  email: string;
}
