import test from "node:test";
import assert from "node:assert/strict";
import { assertTrustedOutboundUrl } from "../../lib/security/outbound-url.ts";
test("requires exact HTTPS allowlist", () => {
  assert.equal(assertTrustedOutboundUrl("https://api.example.com/v1",["api.example.com"]).hostname,"api.example.com");
  for(const url of ["http://api.example.com","https://api.example.com.evil.test","https://127.0.0.1","https://user@api.example.com"]) assert.throws(()=>assertTrustedOutboundUrl(url,["api.example.com"]));
});
