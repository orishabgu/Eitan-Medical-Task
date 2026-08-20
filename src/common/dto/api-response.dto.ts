import { Type, applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiProperty, getSchemaPath } from '@nestjs/swagger';

export class ResponseMetaDto {
  @ApiProperty({ description: 'Correlation id, also present in the logs', example: '42' })
  requestId!: string;

  @ApiProperty({ example: '2024-03-01T10:30:00.000Z' })
  timestamp!: string;
}

export class ErrorResponseDto {
  @ApiProperty({ example: 404 })
  statusCode!: number;

  @ApiProperty({ description: 'Stable machine-readable code', example: 'NOT_FOUND' })
  code!: string;

  @ApiProperty({
    description: 'A string, or a list of them when validation fails',
    example: 'Patient 999 not found',
  })
  message!: string | string[];

  @ApiProperty({ example: '42' })
  requestId!: string;

  @ApiProperty({ example: '2024-03-01T10:30:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: '/api/v1/patients/999' })
  path!: string;
}

// Every success goes through TransformInterceptor, so the documented schema has to describe
// the envelope rather than the handler's return type.
export const ApiEnvelopeResponse = <T extends Type<unknown>>(model: T, description?: string) =>
  applyDecorators(
    ApiExtraModels(ResponseMetaDto, model),
    ApiOkResponse({
      description,
      schema: {
        type: 'object',
        required: ['data', 'meta'],
        properties: {
          data: { $ref: getSchemaPath(model) },
          meta: { $ref: getSchemaPath(ResponseMetaDto) },
        },
      },
    }),
  );

export const ApiPaginatedEnvelopeResponse = <T extends Type<unknown>>(
  model: T,
  description?: string,
) =>
  applyDecorators(
    ApiExtraModels(ResponseMetaDto, model),
    ApiOkResponse({
      description,
      schema: {
        type: 'object',
        required: ['data', 'meta'],
        properties: {
          data: {
            type: 'object',
            required: ['items', 'total', 'page', 'limit'],
            properties: {
              items: { type: 'array', items: { $ref: getSchemaPath(model) } },
              total: { type: 'integer', description: 'Matching rows, ignoring paging' },
              page: { type: 'integer', example: 1 },
              limit: { type: 'integer', example: 20 },
            },
          },
          meta: { $ref: getSchemaPath(ResponseMetaDto) },
        },
      },
    }),
  );
