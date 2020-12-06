import {
  assertArrayIncludes,
  assertEquals,
} from "https://deno.land/std@0.78.0/testing/asserts.ts";
import { v4 } from "https://deno.land/std@0.78.0/uuid/mod.ts";

import { id, TribleKB, TribleMQ, types } from "../mod.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.test("Check loopback.", async () => {
  // Define a context, mapping between js data and tribles.
  const knightsCtx = {
    [id]: { ...types.uuid },
    name: { id: v4.generate(), ...types.longstring },
    loves: { id: v4.generate(), isLink: true },
    titles: { id: v4.generate(), ...types.shortstring, isMany: true },
  };
  knightsCtx["lovedBy"] = { id: knightsCtx.loves.id, isInverseLink: true };
  // Add some data.
  const knightskb = new TribleKB().with(
    knightsCtx,
    (
      [romeo, juliet],
    ) => [
      {
        [id]: romeo,
        name: "Romeo",
        titles: ["idiot", "prince"],
        loves: juliet,
      },
      {
        [id]: juliet,
        name: "Juliet",
        titles: ["the lady", "princess"],
        loves: romeo,
      },
    ],
  );

  const mq = new TribleMQ();
  await mq.run();
  await mq.toOutbox(knightskb);
  await sleep(100);
  mq.stop();

  //assertEquals(mq.inbox(), mq.outbox());
});
