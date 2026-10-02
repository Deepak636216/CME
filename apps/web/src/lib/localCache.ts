import { get, set } from "idb-keyval";
import type { LiveState } from "@cme/shared";
import type { StateCache } from "../stream/client.ts";

const KEY = "cme:lastState:v1";

/** IndexedDB copy of the last LiveState, so a reload paints at once (no-lag rule 1). */
export const idbCache: StateCache = {
  load: async () => (await get<LiveState>(KEY)) ?? null,
  save: (s) => set(KEY, s),
};
