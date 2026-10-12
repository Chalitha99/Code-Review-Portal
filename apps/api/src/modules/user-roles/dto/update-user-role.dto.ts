import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class UpdateUserRoleDto {
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'New grantor; use null to clear it',
  })
  @IsOptional()
  @IsUUID()
  grantedBy?: string | null;
}

