import { IpAddress, Ipv6Address } from '$lib/ip.js';
import { add_room_candidate, create_room, delete_room, get_room, set_room_answer } from '$lib/server/rooms.js';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';


export const GET: RequestHandler = async ({ params, getClientAddress }) => {
    if (params.id === undefined || params.id.length === 0) {
        error(400, `Invalid room id '${params.id}`);
    }

    const room_id = get_room_id(params.id, getClientAddress());
    const room = await get_room(room_id);
    if (room === undefined) {
        error(404, `Room not found`);
    }

    return json({ data: room });
};

export const POST: RequestHandler = async ({ request, params, getClientAddress }) => {
    if (params.id === undefined || params.id.length === 0) {
        error(400, `Invalid room id '${params.id}`);
    }

    const room_id = get_room_id(params.id, getClientAddress());
    const raw = await request.json();
    const result = await roomPostSchema.safeParseAsync(raw);
    if (!result.success) {
        error(400, `Invalid data`);
    }

    const value = result.data;

    if (value.type === 'CANCEL') {
        await delete_room(room_id);

        return json({ success: true });
    }

    if (value.type === 'OFFER') {
        const room = await create_room(room_id, value.offer);
        if (room === undefined) {
            error(400, `Room already exists`);
        }

        return json({ success: true });
    }

    const room = await get_room(room_id);
    if (room === undefined) {
        error(404, `Room not found`);
    }

    if (value.type === 'ANSWER') {
        await set_room_answer(room.id, value.answer);
    }
    else {
        await add_room_candidate(room.id, value.candidate, value.is_host);
    }

    return json({ success: true });
};

const RTCIceComponentSchema = z.enum(['rtp', 'rtcp']);
const RTCIceProtocolSchema = z.enum(['udp', 'tcp']);
const RTCIceTcpCandidateTypeSchema = z.enum(['active', 'passive', 'so']);
const RTCIceCandidateTypeSchema = z.enum(['host', 'srflx', 'prflx', 'relay']);

const RTCIceCandidateSchema = z.object({
    address: z.string().nullable().optional(),
    candidate: z.string(),
    component: RTCIceComponentSchema.nullable().optional(),
    foundation: z.string().nullable().optional(),
    port: z.number().nullable().optional(),
    priority: z.number().nullable().optional(),
    protocol: RTCIceProtocolSchema.nullable().optional(),
    relatedAddress: z.string().nullable().optional(),
    relatedPort: z.number().nullable().optional(),
    sdpMLineIndex: z.number().nullable().optional(),
    sdpMid: z.string().nullable().optional(),
    tcpType: RTCIceTcpCandidateTypeSchema.nullable().optional(),
    type: RTCIceCandidateTypeSchema.nullable().optional(),
    usernameFragment: z.string().nullable().optional(),
});

const roomPostSchema = z.discriminatedUnion('type', [
    z.object({
        'type': z.literal('OFFER'),
        'offer': z.object({
            type: z.literal('offer'),
            sdp: z.string()
        })
    }),
    z.object({
        'type': z.literal('CANCEL'),
    }),
    z.object({
        'type': z.literal('ANSWER'),
        'answer': z.object({
            type: z.literal('answer'),
            sdp: z.string()
        })
    }),
    z.object({
        'type': z.literal('CANDIDATE'),
        'is_host': z.boolean(),
        'candidate': RTCIceCandidateSchema
    })
]);

function get_room_id(user_id: string, raw_ip: string): string {
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
