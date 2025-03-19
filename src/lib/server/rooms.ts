import * as kv from './kv.js';
// WEBRTC ROOM

export type Room = {
    id: string;
    users: string[];
    // offer: Map<string, RTCSessionDescription>;
    // answer: Map<string, RTCSessionDescription>;
    offer: string;
    answer: string;
    iceCandidates: RTCIceCandidate[];
    created_at?: number;
    updated_at?: number;
};

// const _rooms: Room[] = [];

const ROOM_PREFIX = 'room:';

export async function get_room(roomId: string): Promise<Room | undefined> {
    const k = ROOM_PREFIX + roomId;
    const room = await kv.get_obj(k) as Room | undefined;

    // console.log('get', k, room);
    return room;
    // for (const room of _rooms) {
    //     if (room.id === roomId) {
    //         return room;
    //     }
    // }
    // return undefined;
}

export async function create_room(roomId: string): Promise<Room | undefined> {
    const k = ROOM_PREFIX + roomId;
    let room = await get_room(roomId);
    if (room !== undefined && Date.now() - room.created_at! < 1 * 60 * 1000) {
        console.log('Room already exists', room);
        return undefined;
    }

    // if (room !== undefined) {
    //     _rooms.splice(_rooms.indexOf(room), 1);
    // }

    room = {
        id: roomId,
        users: [],
        offer: '',
        answer: '',
        iceCandidates: [],
        created_at: Date.now(),
    };

    await kv.set_obj(k, room);
    // _rooms.push(room);
    // console.log('create', k, room);
    return room;
}

export async function set_room_answer(room: Room): Promise<void> {
    const k = ROOM_PREFIX + room.id;
    await kv.set_field(k, '$.answer', room.answer);

    // console.log('update', k, room);
}

export async function set_room_offer(room: Room): Promise<void> {
    const k = ROOM_PREFIX + room.id;
    await kv.set_field(k, '$.offer', room.offer);

    // console.log('update', k, room);
}

export async function add_room_candidate(room: Room): Promise<void> {
    const k = ROOM_PREFIX + room.id;
    await kv.push_field(k, '$.iceCandidates', room.iceCandidates.at(-1));

    // console.log('update', k, room);
}

export async function update_room(room: Room): Promise<void> {
    const k = ROOM_PREFIX + room.id;
    await kv.set_obj(k, room);

    // console.log('update', k, room);
}
