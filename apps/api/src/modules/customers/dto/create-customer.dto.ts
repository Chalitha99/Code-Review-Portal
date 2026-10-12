import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * What an admin may set on a customer (`createCustomerInputSchema` in
 * @sdp/contracts). The customer `code` is derived from the name by the server
 * and never changes afterwards: task codes and history are keyed to it.
 */
export class CreateCustomerDto {
  @ApiProperty({ example: 'IFS' })
  @IsString()
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ example: '#2563eb' })
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color must be a 6-digit hex value such as #2563eb' })
  color!: string;
}
