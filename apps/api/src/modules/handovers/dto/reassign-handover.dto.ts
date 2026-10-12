import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ReassignHandoverDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  reviewerId!: string;
}
