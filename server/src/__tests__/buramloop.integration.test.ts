import request from 'supertest';
import express from 'express';
import { AppError } from '../common/errors';
import { errorHandler } from '../middlewares/error.middleware';

describe('BuramLoop API integration', () => {
  const app = express();

  app.get('/missing', (_req, _res, next) => {
    next(AppError.notFound('Resource', '42'));
  });
  app.get('/duplicate', (_req, _res, next) => {
    next({ code: 11000, keyValue: { code: 'R-1' } });
  });
  app.use(errorHandler);

  it('serializes application errors using the standard API response shape', async () => {
    const response = await request(app).get('/missing');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      message: 'Resource (42) not found',
      details: null,
    });
  });

  it('converts MongoDB duplicate-key errors to conflict responses', async () => {
    const response = await request(app).get('/duplicate');

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      ok: false,
      code: 'DUPLICATE_KEY',
      message: 'A record with the same unique identifier already exists.',
      details: { code: 'R-1' },
    });
  });
});