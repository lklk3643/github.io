// Netlify Function: كل ما تحت /api/* (انظر ../lib/core.mjs)
import { getStore } from '@netlify/blobs';
import { handle } from '../lib/core.mjs';

export default async (req) => handle(req, getStore({ name: 'qu', consistency: 'strong' }));

export const config = { path: '/api/*' };
