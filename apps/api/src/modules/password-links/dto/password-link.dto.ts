import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

/*
 * Deliberately loose: a malformed token or email must get the same answer as a
 * wrong one (`invalid` / 202), so the service — not the validation pipe —
 * decides. Only the type and an upper bound are enforced here, which keeps
 * oversized payloads out without creating an enumeration signal.
 */

export class ValidateTokenDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1024)
  token!: string;
}

export class SetPasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1024)
  token!: string;

  /** Never trimmed: a leading space is part of the password. */
  @ApiProperty()
  @IsString()
  @MaxLength(1024)
  newPassword!: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1024)
  email!: string;
}

export class ResendLinkDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1024)
  token!: string;
}
