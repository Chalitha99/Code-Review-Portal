import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'REVIEWER' })
  @IsString()
  @Matches(/\S/, { message: 'code must contain a non-whitespace character' })
  @MinLength(1)
  @MaxLength(30)
  code!: string;

  @ApiProperty({ example: 'Reviewer' })
  @IsString()
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;
}

