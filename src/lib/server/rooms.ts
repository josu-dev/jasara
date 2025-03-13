import {object, z} from 'zod';

// WEBRTC ROOM

type Room = {
    id: string;
    users: string[];
    // offer: Map<string, RTCSessionDescription>;
    // answer: Map<string, RTCSessionDescription>;
    offer: string;
    answer: string;
    iceCandidates: RTCIceCandidate[];
    created_at?: number;
    updated_at?: number;
}

const _rooms: Room[] = [];

export async function getRoom(roomId: string): Promise<Room | undefined> {
    for (const room of _rooms) {
        if (room.id === roomId) {
            return room;
        }
    }
    return undefined;
}

export async function createRoom(roomId: string): Promise<Room | undefined> {
    let room = await getRoom(roomId);
    if (room!==undefined && Date.now() - room.created_at! < 2*60*1000) {
        console.log('Room already exists', await getRoom(roomId));
        return undefined;
    }

    room = {
        id: roomId,
        users: [],
        offer: '',
        answer: '',
        iceCandidates: [],
        created_at: Date.now(),
    }
    
    _rooms.push(room);
    
    return room;
}
