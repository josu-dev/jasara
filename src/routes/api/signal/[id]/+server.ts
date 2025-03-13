import { createRoom, getRoom } from '$lib/server/rooms';
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

export const GET: RequestHandler = async ({ request, params }) => {

    if (params.id === undefined) {
        return new Response('Room ID is required', { status: 400 });
    }

    const room = await getRoom(params.id);

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

export const POST: RequestHandler = async ({ request, params }) => {
    const room_id = params.id;
    const data = await validateRoomData(await request.json());
    if (!data.success || room_id === undefined) {
        return new Response('Invalid data', { status: 400 });
    }

    const value = data.data;

    if (value.type === 'offer') {
        const room = await createRoom(room_id);
        if (room === undefined) {
            return new Response('Room already exists', { status: 400 });
        }
        room.offer = value.offer;
    }
    else if (value.type === 'answer') {
        const room = await getRoom(room_id);
        if (room === undefined) {
            return new Response('Room not found', { status: 404 });
        }
        room.answer = value.answer;
    }
    else if (value.type === 'iceCandidate') {
        const room = await getRoom(room_id);
        if (room === undefined) {
            return new Response('Room not found', { status: 404 });
        }
        room.iceCandidates.push(value
            .iceCandidate);
    }

    return json({ success: true });
};
