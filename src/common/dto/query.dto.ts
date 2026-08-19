import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidationArguments,
  ValidationOptions,
  isISO8601,
  registerDecorator,
} from 'class-validator';

// Leaves unparseable input untouched so @IsDate produces the 400 with a clear field name.
// Both `Z` and offset forms (`+03:00`) normalize to the same instant.
const toUtcDate = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string' || !isISO8601(value, { strict: true })) {
    return value;
  }
  return new Date(value);
};

export function IsAtOrAfter(property: string, options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isAtOrAfter',
      target: object.constructor,
      propertyName,
      options,
      constraints: [property],
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const other = (args.object as Record<string, unknown>)[args.constraints[0] as string];
          if (!(value instanceof Date) || !(other instanceof Date)) {
            return true;
          }
          return value.getTime() >= other.getTime();
        },
        defaultMessage: (args: ValidationArguments) =>
          `${args.property} must be at or after ${args.constraints[0]}`,
      },
    });
  };
}

export class TimeRangeQueryDto {
  @ApiPropertyOptional({
    description: 'Start of the range, inclusive. ISO-8601.',
    example: '2024-03-01T00:00:00Z',
  })
  @IsOptional()
  @Transform(toUtcDate)
  @IsDate({ message: 'from must be a valid ISO-8601 date' })
  from?: Date;

  @ApiPropertyOptional({
    description: 'End of the range, inclusive. ISO-8601.',
    example: '2024-03-31T23:59:59Z',
  })
  @IsOptional()
  @Transform(toUtcDate)
  @IsDate({ message: 'to must be a valid ISO-8601 date' })
  @IsAtOrAfter('from')
  to?: Date;
}

export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export class PaginatedDto<T> {
  items!: T[];
  total!: number;
  page!: number;
  limit!: number;
}
