<script lang="ts">
  import {
    decode_message,
    encode_file_abort,
    encode_file_chunk,
    encode_file_meta,
    encode_text,
    type ChannelMessage
  } from '$lib/core/message';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const cases = [
    {
      type: 1,
      id: '1',
      ts: new Date().toISOString(),
      sender: 'hola',
      text: "// new File([], 'hola').arrayBuffer().then(t => new Uint8Array(t))"
    },
    {
      type: 2,
      id: '723687163',
      ts: new Date().toISOString(),
      sender: 'hola',
      f_id: '723687163',
      f_name: 'hola.txt',
      f_size: 98332,
      f_type: '',
      f_total_chunks: 2
    },
    { type: 3, id: '723687163', n: 8, c: new Uint8Array([1, 2, 3, 4]) },
    { type: 4, id: '723687163' }
  ] as const satisfies ChannelMessage[];

  const e1_encoded = encode_text(cases[0]);
  const e2_encoded = encode_file_meta(cases[1]);
  const e3_encoded = encode_file_chunk(cases[2]);
  const e4_encoded = encode_file_abort(cases[3]);

  for (const e of [e1_encoded, e2_encoded, e3_encoded, e4_encoded]) {
    if (e === undefined) {
      console.log(e, undefined);
      continue;
    }
    console.log(e, decode_message(e));
  }
</script>

hola
