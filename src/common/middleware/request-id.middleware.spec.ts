import { Request, Response } from 'express';
import { MAX_REQUEST_ID_LENGTH } from '../constants/request-id.constants';
import {
  REQUEST_ID_HEADER,
  RequestIdMiddleware,
} from './request-id.middleware';

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;
  let setHeader: jest.Mock;
  let next: jest.Mock;

  beforeEach(() => {
    middleware = new RequestIdMiddleware();
    setHeader = jest.fn();
    next = jest.fn();
  });

  it('generates a new request id when none is provided upstream', () => {
    const req = { headers: {} } as unknown as Request & { id?: string };
    const res = { setHeader } as unknown as Response;

    middleware.use(req, res, next);

    expect(req.id).toEqual(expect.any(String));
    expect(req.id).not.toHaveLength(0);
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.id);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('reuses an upstream request id instead of generating a new one', () => {
    const req = {
      headers: { [REQUEST_ID_HEADER]: 'upstream-id-123' },
    } as unknown as Request & { id?: string };
    const res = { setHeader } as unknown as Response;

    middleware.use(req, res, next);

    expect(req.id).toBe('upstream-id-123');
    expect(setHeader).toHaveBeenCalledWith(
      REQUEST_ID_HEADER,
      'upstream-id-123',
    );
  });

  it.each([
    ['a UUID', '124a7114-098b-4044-a926-e65949f7c448'],
    ['a trace id with dots and colons', 'trace.1:span_2-abc'],
    ['an id of exactly the maximum length', 'a'.repeat(MAX_REQUEST_ID_LENGTH)],
  ])('accepts %s from upstream', (_label, incoming) => {
    const req = {
      headers: { [REQUEST_ID_HEADER]: incoming },
    } as unknown as Request & { id?: string };

    middleware.use(req, { setHeader } as unknown as Response, next);

    expect(req.id).toBe(incoming);
  });

  it.each([
    ['too long', 'a'.repeat(MAX_REQUEST_ID_LENGTH + 1)],
    ['containing spaces', 'abc def'],
    ['able to forge log fields', 'x] ip=10.0.0.1, route=Fake.login, [y'],
    ['containing a newline', 'abc\ndef'],
    ['an array of values', ['one', 'two']],
  ])(
    'replaces an upstream id that is %s with a generated UUID',
    (_label, incoming) => {
      const req = {
        headers: { [REQUEST_ID_HEADER]: incoming },
      } as unknown as Request & { id?: string };

      middleware.use(req, { setHeader } as unknown as Response, next);

      expect(req.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.id);
    },
  );
});
