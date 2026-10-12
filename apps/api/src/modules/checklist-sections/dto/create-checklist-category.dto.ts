import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

export class CreateChecklistCategoryDto {
  @ApiProperty({ example: 'Unit Testing' })
  @IsString()
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ type: [String], example: ['1', '2'] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsNumberString({}, { each: true })
  applicableTaskTypeIds!: string[];

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
