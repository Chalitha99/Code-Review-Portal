import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Longest justification an admin may record against a privileged action. */
export const MAX_REASON_LENGTH = 500;

/**
 * Optional free-text justification, recorded in the audit log's metadata. The
 * web client asks for one when privileged access changes, a user or record is
 * deleted, or an in-review task is reassigned.
 */
export class ReasonDto {
  @ApiPropertyOptional({ maxLength: MAX_REASON_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_REASON_LENGTH)
  reason?: string;
}

/** `{ reason }` for audit metadata, or nothing when no reason was given. */
export function reasonMetadata(reason: string | undefined): { reason?: string } {
  const trimmed = reason?.trim();
  return trimmed ? { reason: trimmed } : {};
}
