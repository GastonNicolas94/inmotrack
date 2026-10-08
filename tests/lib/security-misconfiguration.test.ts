import test from "node:test";
import assert from "node:assert/strict";
import { applySecurityHeaders } from "../../lib/security/security-headers.ts";
test("adds secure headers",()=>{const h=applySecurityHeaders(new Headers()); assert.equal(h.get("x-frame-options"),"DENY");assert.equal(h.get("x-content-type-options"),"nosniff");});
