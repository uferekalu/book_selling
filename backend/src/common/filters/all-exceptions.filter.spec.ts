import {
  BadRequestException,
  InternalServerErrorException,
  ServiceUnavailableException,
  type ArgumentsHost,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function run(exception: unknown) {
  const sent: { status?: number; body?: Record<string, unknown> } = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      sent.body = body;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ url: '/payments/initiate' }),
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return sent;
}

describe('AllExceptionsFilter', () => {
  it('passes a deliberate 503 message to the customer (BS-23)', () => {
    const sent = run(
      new ServiceUnavailableException(
        "We couldn't reach Paystack. Please try again or choose another payment method.",
      ),
    );
    expect(sent.status).toBe(503);
    expect(sent.body?.message).toMatch(/couldn't reach Paystack/);
  });

  it('hides the details of every other server error', () => {
    expect(
      run(new InternalServerErrorException('Mongo driver exploded')).body
        ?.message,
    ).toBe('Internal server error');
    expect(run(new Error('secret stack detail')).body).toMatchObject({
      statusCode: 500,
      message: 'Internal server error',
    });
  });

  it('keeps client errors with their code', () => {
    const sent = run(new BadRequestException({ message: 'Nope', code: 'no' }));
    expect(sent.body).toMatchObject({
      statusCode: 400,
      message: 'Nope',
      code: 'no',
    });
  });
});
