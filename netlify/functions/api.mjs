// Netlify Function exposing the SAME Express app that runs on a normal Node server (see backend/src/server.js).
// netlify.toml rewrites /api/* to this function. The app is built once per warm container and reused.
import serverless from 'serverless-http';
import { createApp } from '../../backend/src/app.js';

let serverlessHandler;

export const handler = async (event, context) => {
  // Return as soon as the response is ready; don't wait for idle pg sockets to close.
  context.callbackWaitsForEmptyEventLoop = false;
  try {
    // binary: image responses (profile photos) must be base64-encoded for API Gateway / Lambda.
    serverlessHandler ??= serverless(createApp(), { binary: ['image/*'] });
  } catch (err) {
    console.error('[api] startup failed:', err.message); // e.g. missing DATABASE_URL / JWT_SECRET
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { code: 'MISCONFIGURED', message: 'The server is not configured correctly. Check the function logs.' } }),
    };
  }
  return serverlessHandler(event, context);
};
