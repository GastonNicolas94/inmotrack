import { createClock, createTestClock } from "@/lib/clock";
import { createTestClockStore } from "@/lib/test-clock-store";

const store = createTestClockStore();

export const AppClock = createClock(process.env, store);
export const EditableTestClock = createTestClock(store);
