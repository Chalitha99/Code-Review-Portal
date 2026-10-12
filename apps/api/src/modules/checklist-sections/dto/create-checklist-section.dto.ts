import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class TaskTypeSectionMappingDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  taskTypeId!: number;

  @ApiProperty({ example: 10, default: 0 })
  @IsInt()
  @Min(0)
  displayOrder!: number;
}

export class CreateChecklistSectionDto {
  @ApiProperty({ example: 'Unit Testing' })
  @IsString()
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [TaskTypeSectionMappingDto] })
  @IsOptional()
  @IsArray()
  @ArrayUnique((mapping: TaskTypeSectionMappingDto) => mapping.taskTypeId)
  @ValidateNested({ each: true })
  @Type(() => TaskTypeSectionMappingDto)
  taskTypes?: TaskTypeSectionMappingDto[];
}

