import { ROOM_ID_MAX_LENGTH, ROOM_ID_MIN_LENGTH } from '$lib/constants.js';
import * as kv from './kv.js';


const ROOM_PREFIX = 'room:';

const ROOM_TTL = 1 * 60 * 1000;

export type Room = {
    id: string;
    offer: {
        type: "offer";
        sdp: string;
    };
    answer: null | {
        type: "answer";
        sdp: string;
    };
    offer_candidates: RTCIceCandidateInit[];
    answer_candidates: RTCIceCandidateInit[];
    created_at: number;
};

export function is_room_id(value: unknown): value is string {
    return typeof value === 'string' && value.length >= ROOM_ID_MIN_LENGTH && value.length <= ROOM_ID_MAX_LENGTH;
}

export async function get_room(room_id: string): Promise<Room | undefined> {
    const k = ROOM_PREFIX + room_id;
    const room = await kv.get_obj(k) as Room | undefined;

    if (room !== undefined && Date.now() - room.created_at > ROOM_TTL) {
        return undefined;
    }

    return room;
}

export async function create_room(room_id: string, offer: NonNullable<Room['offer']>): Promise<Room | undefined> {
    const room = {
        id: room_id,
        answer: null,
        answer_candidates: [],
        offer: offer,
        offer_candidates: [],
        created_at: Date.now(),
    };

    const k = ROOM_PREFIX + room_id;
    await kv.set_obj(k, room);
    return room;
}

export async function delete_room(room_id: string): Promise<void> {
    const k = ROOM_PREFIX + room_id;
    await kv.del_obj(k);
}

export async function delete_room_answer(room_id: string): Promise<void> {
    const k = ROOM_PREFIX + room_id;
    await kv.set_field(k, '$.answer', null);
    await kv.set_field(k, '$.answer_candidates', []);
}

export async function set_room_answer(room_id: string, answer: NonNullable<Room['answer']>): Promise<void> {
    const k = ROOM_PREFIX + room_id;
    await kv.set_field(k, '$.answer', answer);
}

export async function add_room_candidate(room_id: string, candidate: RTCIceCandidateInit, is_host: boolean): Promise<void> {
    const k = ROOM_PREFIX + room_id;
    const path = is_host ? '$.offer_candidates' : '$.answer_candidates';
    await kv.push_field(k, path, candidate);
}
