import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { parseThirdPartyResponse } from "../../lib/security/third-party-response.ts";
test("validates upstream schema",async()=>{
 const schema=z.object({ok:z.boolean()});
 assert.deepEqual(await parseThirdPartyResponse(new Response('{"ok":true}'),schema),{ok:true});
 await assert.rejects(()=>parseThirdPartyResponse(new Response('{"ok":"true"}'),schema));
});
test("rejects oversized upstream body",async()=>await assert.rejects(()=>parseThirdPartyResponse(new Response("a".repeat(100)),z.string(),20)));
