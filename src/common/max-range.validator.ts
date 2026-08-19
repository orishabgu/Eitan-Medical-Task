import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Resolved through Nest's container (see useContainer in main.ts) so the limit comes from
// configuration rather than a literal baked into the decorator.
@Injectable()
@ValidatorConstraint({ name: 'maxRangeDays', async: false })
export class MaxRangeDaysConstraint implements ValidatorConstraintInterface {
  constructor(private readonly config: ConfigService) {}

  validate(from: unknown, args: ValidationArguments): boolean {
    const to = (args.object as Record<string, unknown>)[args.constraints[0] as string];
    // Only a closed range has a span to measure. An open-ended query stays allowed and is
    // bounded instead by pagination, or by the per-patient index for analytics.
    if (!(from instanceof Date) || !(to instanceof Date)) {
      return true;
    }
    return to.getTime() - from.getTime() <= this.maxDays * MS_PER_DAY;
  }

  defaultMessage(): string {
    return `the requested time range must not span more than ${this.maxDays} days`;
  }

  private get maxDays(): number {
    return this.config.get<number>('maxRangeDays')!;
  }
}

export function MaxRangeDays(endProperty: string, options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [endProperty],
      validator: MaxRangeDaysConstraint,
    });
  };
}
