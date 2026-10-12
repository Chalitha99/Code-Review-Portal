import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  Min,
} from 'class-validator';

export class ChecklistQueryDto {
  @ApiProperty({
    description:
      'One or more task type IDs (comma-separated or repeated query values)',
    example: '1,2',
  })
  @Transform(({ value }: { value: unknown }) => {
    const values = Array.isArray(value) ? value : [value];
    return values
      .flatMap((item) => String(item).split(','))
      .map((item) => Number(item));
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  taskTypeIds!: number[];
}

