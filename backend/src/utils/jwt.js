import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const signToken = (user) =>
  jwt.sign({ sub: user.id, tv: user.token_version }, config.jwt.secret, {
    algorithm: 'HS256',
    expiresIn: config.jwt.expiresInSeconds,
  });

export const verifyToken = (token) => jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });

export function setSessionCookie(res, token) {
  res.cookie(config.cookie.name, token, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: config.jwt.expiresInSeconds * 1000,
  });
}

export const clearSessionCookie = (res) =>
  res.clearCookie(config.cookie.name, { httpOnly: true, secure: config.cookie.secure, sameSite: 'lax', path: '/' });
