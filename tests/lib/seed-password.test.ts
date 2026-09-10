import test from "node:test";
import assert from "node:assert/strict";
import { requireSeedPassword } from "@/lib/seed-password";

test("requireSeedPassword rejects a missing or blank value", () => {
  assert.throws(() => requireSeedPassword({}), /INMOTRACK_SEED_PASSWORD/);
  assert.throws(
    () => requireSeedPassword({ INMOTRACK_SEED_PASSWORD: "   " }),
    /INMOTRACK_SEED_PASSWORD/
  );
});

test("requireSeedPassword returns a trimmed value", () => {
  assert.equal(
    requireSeedPassword({ INMOTRACK_SEED_PASSWORD: "  chosen-local-password  " }),
    "chosen-local-password"
  );
});

test("requireSeedPassword reads process.env by default", () => {
  const previous = process.env.INMOTRACK_SEED_PASSWORD;
  process.env.INMOTRACK_SEED_PASSWORD = "  default-seed-password  ";
  try {
    assert.equal(requireSeedPassword(), "default-seed-password");
  } finally {
    if (previous === undefined) delete process.env.INMOTRACK_SEED_PASSWORD;
    else process.env.INMOTRACK_SEED_PASSWORD = previous;
  }
});
