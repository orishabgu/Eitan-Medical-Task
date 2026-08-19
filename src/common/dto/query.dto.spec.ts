import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PaginationQueryDto, TimeRangeQueryDto } from './query.dto';

const validate = <T extends object>(cls: new () => T, payload: Record<string, unknown>) => {
  const instance = plainToInstance(cls, payload);
  return { instance, errors: validateSync(instance) };
};

describe('TimeRangeQueryDto', () => {
  it('accepts a valid ISO-8601 range', () => {
    const { errors } = validate(TimeRangeQueryDto, {
      from: '2024-03-01T00:00:00Z',
      to: '2024-03-02T00:00:00Z',
    });

    expect(errors).toHaveLength(0);
  });

  it('normalizes an offset to the same instant as its UTC form', () => {
    const offset = validate(TimeRangeQueryDto, { from: '2024-03-01T13:00:00+03:00' });
    const utc = validate(TimeRangeQueryDto, { from: '2024-03-01T10:00:00Z' });

    expect(offset.instance.from?.getTime()).toBe(utc.instance.from?.getTime());
  });

  it('rejects a value that is not ISO-8601', () => {
    const { errors } = validate(TimeRangeQueryDto, { from: 'not-a-date' });

    expect(errors[0].property).toBe('from');
  });

  it('rejects a loose date format', () => {
    const { errors } = validate(TimeRangeQueryDto, { from: '01/03/2024' });

    expect(errors).toHaveLength(1);
  });

  it('rejects a range that ends before it starts', () => {
    const { errors } = validate(TimeRangeQueryDto, {
      from: '2024-03-02T00:00:00Z',
      to: '2024-03-01T00:00:00Z',
    });

    expect(errors[0].property).toBe('to');
  });

  it('accepts a range whose bounds are equal', () => {
    const { errors } = validate(TimeRangeQueryDto, {
      from: '2024-03-01T00:00:00Z',
      to: '2024-03-01T00:00:00Z',
    });

    expect(errors).toHaveLength(0);
  });

  it('accepts either bound on its own', () => {
    expect(validate(TimeRangeQueryDto, { from: '2024-03-01T00:00:00Z' }).errors).toHaveLength(0);
    expect(validate(TimeRangeQueryDto, { to: '2024-03-01T00:00:00Z' }).errors).toHaveLength(0);
  });

  it('accepts an empty range', () => {
    expect(validate(TimeRangeQueryDto, {}).errors).toHaveLength(0);
  });

  it('accepts future timestamps, since device clocks drift', () => {
    const { errors } = validate(TimeRangeQueryDto, { from: '2999-01-01T00:00:00Z' });

    expect(errors).toHaveLength(0);
  });
});

describe('PaginationQueryDto', () => {
  it('defaults to the first page', () => {
    const { instance, errors } = validate(PaginationQueryDto, {});

    expect(errors).toHaveLength(0);
    expect(instance).toMatchObject({ page: 1, limit: 20 });
  });

  it.each([
    ['page below one', { page: '0' }],
    ['negative page', { page: '-1' }],
    ['non-numeric page', { page: 'abc' }],
    ['fractional page', { page: '1.5' }],
    ['limit below one', { limit: '0' }],
    ['limit above the cap', { limit: '101' }],
  ])('rejects %s', (_label, payload) => {
    expect(validate(PaginationQueryDto, payload).errors.length).toBeGreaterThan(0);
  });

  it('coerces numeric strings from the query string', () => {
    const { instance } = validate(PaginationQueryDto, { page: '2', limit: '50' });

    expect(instance).toMatchObject({ page: 2, limit: 50 });
  });
});
