import { IpAddress, Ipv6Address } from '$lib/ip.js';
import { add_room_candidate, create_room, delete_room, delete_room_answer, get_room, is_room_id, set_room_answer } from '$lib/server/rooms.js';
import { error, json } from '@sveltejs/kit';
import * as z from '@zod/mini';
import type { RequestHandler } from './$types.js';


export const GET: RequestHandler = async ({ params, getClientAddress }) => {
    if (!is_room_id(params.id)) {
        error(400, `invalid room id '${params.id}`);
    }

    const room_id = server_room_id(params.id, getClientAddress());
    const room = await get_room(room_id);
    if (room === undefined) {
        error(404, `room not found`);
    }

    return json({ data: room });
};

export const POST: RequestHandler = async ({ request, params, getClientAddress }) => {
    if (!is_room_id(params.id)) {
        error(400, `invalid room id '${params.id}`);
    }

    const room_id = server_room_id(params.id, getClientAddress());
    const result = await post_schema.safeParseAsync(request);
    if (!result.success) {
        error(400, `invalid data`);
    }

    const value = result.data;
    if (value.type === 'OFFER') {
        const room = await create_room(room_id, value.offer);
        if (room === undefined) {
            error(400, `room already exists`);
        }

        return json({ success: true });
    }

    if (value.type === 'OFFER_CANCEL') {
        await delete_room(room_id);
        return json({ success: true });
    }

    const room = await get_room(room_id);
    if (room === undefined) {
        error(404, `room not found`);
    }

    if (value.type === 'CANDIDATE') {
        await add_room_candidate(room.id, value.candidate, value.is_host);
        return json({ success: true });
    }

    if (value.type === 'ANSWER') {
        await set_room_answer(room.id, value.answer);
        return json({ success: true });
    }

    if (value.type === 'ANSWER_CANCEL') {
        await delete_room_answer(room.id);
        return json({ success: true });
    }

    return json({ success: true });
};

function server_room_id(user_id: string, raw_ip: string): string {
    let ip = IpAddress.parse(raw_ip);
    if (Ipv6Address.is_ipv6(ip) && ip.is_mapped_v4()) {
        ip = ip.get_mapped_v4()!;
    }
    if (ip.is_private()) {
        return ip.get_subnet() + '_' + user_id;
    }
    if (ip.is_local()) {
        return ip.ip_string + '_' + user_id;
    }
    return ip.ip_string + '_' + user_id;
}

const rtc_ice_candidate_schema = z.interface({
    "address": z.optional(z.nullable(
        z.string()
    )),
    candidate: z.string(),
    "component": z.optional(z.nullable(
        z.literal(['rtp', 'rtcp'])
    )),
    "foundation": z.optional(z.nullable(
        z.string()
    )),
    "port": z.optional(z.nullable(
        z.number()
    )),
    "priority": z.optional(z.nullable(
        z.number()
    )),
    "protocol": z.optional(z.nullable(
        z.literal(['udp', 'tcp'])
    )),
    "relatedAddress": z.optional(z.nullable(
        z.string()
    )),
    "relatedPort": z.optional(z.nullable(
        z.number()
    )),
    "sdpMLineIndex": z.optional(z.nullable(
        z.number()
    )),
    "sdpMid": z.optional(z.nullable(
        z.string()
    )),
    "tcpType": z.optional(z.nullable(
        z.literal(['active', 'passive', 'so'])
    )),
    "type": z.optional(z.nullable(
        z.literal(['host', 'srflx', 'prflx', 'relay'])
    )),
    "usernameFragment": z.optional(z.nullable(
        z.string()
    )),
});

const post_body_schema = z.discriminatedUnion([
    z.interface({
        'type': z.literal('OFFER'),
        'offer': z.interface({
            type: z.literal('offer'),
            sdp: z.string()
        })
    }),
    z.interface({
        'type': z.literal('OFFER_CANCEL'),
    }),
    z.interface({
        'type': z.literal('ANSWER'),
        'answer': z.interface({
            type: z.literal('answer'),
            sdp: z.string()
        })
    }),
    z.interface({
        'type': z.literal('ANSWER_CANCEL'),
    }),
    z.interface({
        'type': z.literal('CANDIDATE'),
        'is_host': z.boolean(),
        'candidate': rtc_ice_candidate_schema
    })
]);

const post_schema = z.pipe(
    z.transform(async (val: Request, ctx) => {
        try {
            return await val.json();
        } catch (e) {
            ctx.issues.push({
                code: "custom",
                message: "Body is not valid json",
                input: val
            });
            return;
        }
    }),
    post_body_schema
);
