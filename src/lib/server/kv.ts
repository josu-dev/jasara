import { UPSTASH_REDIS_REST_TOKEN, UPSTASH_REDIS_REST_URL } from '$env/static/private';
import { Redis } from "@upstash/redis";


const redis = new Redis({
    url: UPSTASH_REDIS_REST_URL,
    token: UPSTASH_REDIS_REST_TOKEN,
});

export { redis };

export async function get_obj<T extends Record<string, any>>(key: string): Promise<undefined | T> {
    const v = await redis.json.get(key);
    if (v == null) {
        return;
    }
    return v as T;
}

export async function del_obj(key: string) {
    return redis.json.del(key, '$')
}

export async function set_obj(key: string, obj: Record<string, any>) {
    await redis.json.set(key, '$', obj);
}

export async function set_field(key: string, path: string, value: any) {
    await redis.json.set(key, path, value);
}

export async function push_field(key: string, path: string, value: any) {
    await redis.json.arrappend(key, path, value);
}
