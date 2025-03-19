import { IpAddress, Ipv6Address } from '$lib/ip';
import { add_room_candidate, create_room, get_room, set_room_answer, set_room_offer, type Room } from '$lib/server/rooms';
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

function get_room_id(user_id: string, raw_ip: string): string {
    console.log(`raw ip address: '${raw_ip}'`);
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

export const GET: RequestHandler = async ({ params, getClientAddress }) => {
    if (params.id === undefined) {
        return new Response('Room ID is required', { status: 400 });
    }

    const room_id = get_room_id(params.id, getClientAddress());
    console.log(`room_id: '${room_id}'`);

    const room = await get_room(room_id);

    if (room === undefined) {
        return new Response('Room not found', { status: 404 });
    }

    return json({ data: room });
};

const roomDataSchema = z.discriminatedUnion('type', [
    z.object({
        'type': z.literal('offer'),
        'offer': z.any()
    }),
    z.object({
        'type': z.literal('answer'),
        'answer': z.any()
    }),
    z.object({
        'type': z.literal('iceCandidate'),
        'iceCandidate': z.any()
    })
]);

async function validateRoomData(data: any) {
    return roomDataSchema.safeParseAsync(data);
}

export const POST: RequestHandler = async ({ request, params, getClientAddress }) => {
    if (params.id === undefined) {
        return new Response('Room ID is required', { status: 400 });
    }

    const room_id = get_room_id(params.id, getClientAddress());
    const data = await validateRoomData(await request.json());
    if (!data.success) {
        return new Response('Invalid data', { status: 400 });
    }

    const value = data.data;

    let room: Room | undefined;
    if (value.type === 'offer') {
        room = await create_room(room_id);
        if (room === undefined) {
            return new Response('Room already exists', { status: 400 });
        }
        room.offer = value.offer;
        await set_room_offer(room);
    }
    else if (value.type === 'answer') {
        room = await get_room(room_id);
        if (room === undefined) {
            return new Response('Room not found', { status: 404 });
        }
        room.answer = value.answer;
        await set_room_answer(room);
    }
    else if (value.type === 'iceCandidate') {
        room = await get_room(room_id);
        if (room === undefined) {
            return new Response('Room not found', { status: 404 });
        }
        room.iceCandidates.push(value.iceCandidate);
        await add_room_candidate(room);
    }

    return json({ success: true });
};
