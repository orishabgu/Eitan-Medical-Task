import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationQueryDto, TimeRangeQueryDto } from '../../common/dto/query.dto';

export class HighEventsQueryDto extends IntersectionType(TimeRangeQueryDto, PaginationQueryDto) {
  @ApiPropertyOptional({
    description:
      'A reading counts as an event only when strictly above this value. Defaults to HIGH_HEART_RATE_THRESHOLD.',
    minimum: 1,
    maximum: 299,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(299)
  threshold?: number;
}
