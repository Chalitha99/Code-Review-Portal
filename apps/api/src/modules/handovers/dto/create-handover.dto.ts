import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateHandoverDto {
  @ApiProperty({ example: 'I am unavailable and cannot complete this review.' })
  @IsString()
  @Matches(/\S/, { message: 'reason must contain a non-whitespace character' })
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  draft?: Record<string, unknown>;
}
