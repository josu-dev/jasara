import type { Actions } from '@sveltejs/kit';

export const actions: Actions = {
    get_room: async ({params}) => {
        return {
            status: 200,
            body: {
                id: params.id,
                users: [],
                offer: new Map(),
                answer: new Map(),
                iceCandidates: new Map()
            }
        };
    }
};
