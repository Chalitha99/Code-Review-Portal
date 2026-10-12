import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString } from 'class-validator';

/**
 * A whole collection's new sequence, by id. Order values are derived from array
 * position on the server, so the body never carries numbers that could collide.
 */
export class ReorderDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  ids!: string[];
}

/** True when `ids` lists every one of `existing` exactly once. */
export function isCompleteOrder(ids: readonly string[], existing: readonly string[]): boolean {
  return ids.length === existing.length && existing.every((id) => ids.includes(id));
}
