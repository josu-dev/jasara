import * as kv from '$lib/server/kv.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';


export const GET: RequestHandler = async () => {
    let status = 200;
    const now = new Date().toISOString();
    const out: Record<string, any> = {
        status: 'healthy',
        timestamp: now,
    };

    try {
        const pong = await kv.redis.ping();
        if (typeof pong !== 'string' || pong !== 'PONG') {
            status = 503;
            out.status = 'unhealthy';
            out.message = 'unexpected redis response';
        }
        await kv.redis.set('healtz:last', now);
        await kv.redis.get('healtz:last');
    }
    catch (ex) {
        status = 503;
        out.status = 'unhealthy';
        out.message = (ex instanceof Error ? (ex.message) : '') || 'unexpected exception';
        console.log(ex)
    }

    return json(out, { status: status });
};
