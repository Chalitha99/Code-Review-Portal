import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateUserRoleDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  roleId!: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'User who granted this role',
  })
  @IsOptional()
  @IsUUID()
  grantedBy?: string | null;
}

