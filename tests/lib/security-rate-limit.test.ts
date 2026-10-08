import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceRateLimit } from '../../lib/security/rate-limit.ts';
import { HttpError } from '../../lib/http-error.ts';
test('rate limit returns 429',async()=>{
 let n=0;const store={increment:async()=>++n};
 await enforceRateLimit(store,'user:1',1,60);
 await assert.rejects(()=>enforceRateLimit(store,'user:1',1,60),e=>e instanceof HttpError&&e.status===429);
});
