import { z } from 'zod';

/**
 * validate({ body, query, params }) parses each part with a zod schema and exposes the typed result
 * on req.valid.{body,query,params}. Failures throw a ZodError that the error middleware turns into a 422.
 */
export const validate = (schemas) => (req, _res, next) => {
  try {
    req.valid = req.valid || {};
    for (const part of ['params', 'query', 'body']) {
      if (schemas[part]) req.valid[part] = schemas[part].parse(req[part] ?? {});
    }
    next();
  } catch (err) {
    next(err);
  }
};

export { z };
