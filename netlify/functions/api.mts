import type { Config, Context } from '@netlify/functions';
import { handleApi } from '../../server/netlify/api.js';

export default async function api(request: Request, context: Context) {
  return handleApi(request, context.ip);
}

export const config: Config = { path: '/api/*' };
