import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  MinLength,
} from 'class-validator';
import { MAX_REASON_LENGTH } from '../../../common/dto/reason.dto.js';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'developer@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: 'Alex Developer' })
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Justification for a privileged change; audited. */
  @ApiPropertyOptional({ maxLength: MAX_REASON_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_REASON_LENGTH)
  reason?: string;
}
