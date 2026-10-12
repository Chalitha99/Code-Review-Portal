import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  MinLength,
} from 'class-validator';
import {
  ROLE_CODES,
  ROLE_CODES_BY_LABEL,
  type RoleCode,
  type RoleLabel,
} from '../../auth/auth.constants.js';
import { MAX_REASON_LENGTH } from '../../../common/dto/reason.dto.js';

function normalizeRoles({ value }: TransformFnParams): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((role: unknown) => {
    if (typeof role !== 'string') return role;
    return ROLE_CODES_BY_LABEL[role as RoleLabel] ?? role.trim().toUpperCase();
  });
}

export class CreateUserDto {
  @ApiProperty({ example: 'developer@example.com' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'Alex Developer' })
  @IsString()
  @Matches(/\S/, {
    message: 'name must contain a non-whitespace character',
  })
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ enum: ROLE_CODES, isArray: true })
  @Transform(normalizeRoles)
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
