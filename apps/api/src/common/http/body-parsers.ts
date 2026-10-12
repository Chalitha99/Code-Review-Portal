import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ACCESS_COOKIE } from '../../modules/auth/auth.constants.js';
import { HttpExceptionFilter } from '../filters/http-exception.filter.js';

/** Every JSON body that is not an upload: forms, filters, decisions. */
export const DEFAULT_JSON_LIMIT = '1mb';

/** One task attachment: a 5 MB image as a base64 data URL is ~6.7 MB. */
export const ATTACHMENT_JSON_LIMIT = '8mb';

/**
 * A review draft carries every comment's screenshots on each save (and the
 * handover POST carries the same draft). Generous on purpose; moving images to
 * object storage is the real fix and is tracked as a follow-up.
 */
export const REVIEW_JSON_LIMIT = '25mb';

const ATTACHMENT_ROUTE = /^\/api\/(?:tasks|review-tasks)\/[^/]+\/attachments(?:\/[^/]+)?\/?$/;
const REVIEW_ROUTE = /^\/api\/tasks\/[^/]+\/(?:review|handover)\/?$/;

/**
 * Registers the JSON body parsers with per-route limits, replacing Nest's
 * default parser (create the app with `bodyParser: false`).
 *
 * Express's built-in default is 100 KB, which silently rejected almost every
 * real screenshot. The larger limits apply only to the upload routes, and only
 * when the request carries a session cookie: parsing happens before the auth
 * guards run, so an anonymous caller must never be able to make the server
 * buffer 25 MB. Such a request falls back to the 1 MB parser and is then
 * rejected by the guard anyway.
 */
export function registerBodyParsers(app: NestExpressApplication): void {
  const parsers = {
    default: express.json({ limit: DEFAULT_JSON_LIMIT }),
    attachment: express.json({ limit: ATTACHMENT_JSON_LIMIT }),
    review: express.json({ limit: REVIEW_JSON_LIMIT }),
  };

  const selectParser: RequestHandler = (request, response, next) => {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const hasSession = typeof cookies?.[ACCESS_COOKIE] === 'string';
    const parser = !hasSession
      ? parsers.default
      : ATTACHMENT_ROUTE.test(request.path)
        ? parsers.attachment
        : REVIEW_ROUTE.test(request.path)
          ? parsers.review
          : parsers.default;
    parser(request, response, next);
  };

  const filter = new HttpExceptionFilter();
  // Body-parser failures happen before Nest's router, so Nest's exception
  // filters never see them. Answer with the same public error envelope.
  const onParserError: ErrorRequestHandler = (error, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    filter.send(error, response);
  };

  app.use(selectParser);
  app.use(onParserError);
}
