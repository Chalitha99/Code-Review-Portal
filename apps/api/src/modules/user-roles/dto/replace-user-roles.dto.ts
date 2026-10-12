import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { MAX_REASON_LENGTH } from '../../../common/dto/reason.dto.js';
import { ROLE_CODES, type RoleCode } from '../../auth/auth.constants.js';

export class ReplaceUserRolesDto {
  @ApiProperty({ enum: ROLE_CODES, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(ROLE_CODES, { each: true })
  roles!: RoleCode[];

  /** Justification for a privileged change; audited. */
  @ApiPropertyOptional({ maxLength: MAX_REASON_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_REASON_LENGTH)
  reason?: string;
}

