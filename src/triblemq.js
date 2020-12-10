import { emptyTriblePART } from "./part.js";
import { isTransactionMarker, isValidTransaction } from "./trible.js";
import { EAV } from "./tribledb.js";
import { emptykb, find, TribleKB } from "./triblekb.js";
import {
  blake2s32,
  blake2sFinal,
  blake2sInit,
  blake2sUpdate,
} from "./blake2s.js";
import { contiguousTribles, TRIBLE_SIZE, VALUE_SIZE } from "./trible.js";
import { defaultBlobDB } from "./blobdb.js";

const TRIBLES_PROTOCOL = "tribles";

function buildTransaction(triblesPart) {
  const novelTriblesEager = [...triblesPart.keys()];
  const transaction = new Uint8Array(
    TRIBLE_SIZE * (novelTriblesEager.length + 1),
  );
  console.log(transaction.length);
  let i = 1;
  for (const trible of novelTriblesEager) {
    transaction.set(trible, TRIBLE_SIZE * i++);
  }
  blake2s32(
    transaction.subarray(TRIBLE_SIZE),
    transaction.subarray((TRIBLE_SIZE - VALUE_SIZE), TRIBLE_SIZE),
  );
  return transaction;
}

// TODO add attribute based filtering.
class TribleMQ {
  constructor(
    inbox = emptykb,
    outbox = emptykb,
  ) {
    this._connections = new Map();
    this._inbox = inbox;
    this._outbox = outbox;
    this._changeStream = new TransformStream();
    this._changeWriter = this._changeStream.writable.getWriter();
    this._changeReadable = this._changeStream.readable;
  }

  _onInTxn(txn) {
    console.log(`RECEIVED: ${txn}`);
    if (txn.length <= 64) {
      console.warn(`Bad transaction, too short.`);
      return;
    }
    if (txn.length % TRIBLE_SIZE !== 0) {
      console.warn(
        `Bad transaction, ${txn.length} is not a multiple of ${TRIBLE_SIZE}.`,
      );
      return;
    }
    const txnTrible = txn.subarray(0, TRIBLE_SIZE);
    if (!isTransactionMarker(txnTrible)) {
      console.warn(
        `Bad transaction, doesn't begin with transaction marker.`,
      );
      return;
    }

    const tribles = txn.subarray(TRIBLE_SIZE);
    const txnHash = blake2s32(tribles, new Uint8Array(32));
    if (!isValidTransaction(txnTrible, txnHash)) {
      console.warn("Bad transaction, hash does not match.");
      return;
    }

    const receivedTriblesBatch = emptyTriblePART.batch();
    for (const trible of contiguousTribles(tribles)) {
      receivedTriblesBatch.put(trible);
    }
    const receivedTribles = receivedTriblesBatch.complete();
    const novelTribles = receivedTribles.subtract(
      this._inbox.tribledb.index[EAV],
    );

    if (!novelTribles.isEmpty()) {
      const novel = emptykb.with(novelTribles.keys());

      const oldInbox = this._inbox;
      const nowInbox = this._inbox.withTribles(novelTribles.keys()); //TODO this could be a .union(change)

      this._inbox = nowInbox;
      this._changeWriter.write({
        inbox: {
          old: oldInbox,
          new: novel,
          all: nowInbox,
        },
        outbox: {
          old: this._outbox,
          new: emptykb,
          all: this._outbox,
        },
      });
    }
  }

  _onOutTxn(txn) {
    for (const [addr, conn] of this._connections) {
      if (conn.readyState === WebSocket.OPEN) {
        conn.send(txn);
      }
    }
  }

  async connect(addr) {
    const websocket = new WebSocket(addr, TRIBLES_PROTOCOL);
    websocket.binaryType = "arraybuffer";
    websocket.addEventListener("open", (e) => {
      console.info(`Connected to ${addr}.`);

      const novelTribles = this._outbox.tribledb.index[EAV];
      if (!novelTribles.isEmpty()) {
        const transaction = buildTransaction(novelTribles);
        websocket.send(transaction);
      }
    });
    websocket.addEventListener("message", (e) => {
      this._onInTxn(new Uint8Array(e.data));
    });
    websocket.addEventListener("close", (e) => {
      console.info(`Disconnected from ${addr}.`);
      this._connections.delete(addr, websocket);
    });
    websocket.addEventListener("error", (e) => {
      console.error(`Error on connection to ${addr}: ${e.message}`);
    });
    const openPromise = new Promise((resolve, reject) => {
      websocket.addEventListener("open", resolve);
      websocket.addEventListener("close", reject);
    });
    const closePromise = new Promise((resolve, reject) => {
      websocket.addEventListener("close", resolve);
    });
    websocket.openPromise = openPromise;
    websocket.closePromise = closePromise;
    this._connections.set(addr, websocket);

    await openPromise;
    return addr;
  }

  async disconnect(addr) {
    const ws = this._connections.get(addr);
    ws.close();
    await ws.closePromise;
    return addr;
  }

  async disconnectAll() {
    const addrs = [...this._connections.values()];
    await Promise.all([...this._connections.values()].map((conn) => {
      conn.close();
      return conn.closePromise;
    }));
    return addrs;
  }

  send(nowOutbox) {
    //TODO add size to PART, so this can be done lazily.
    console.log("Writing kb to outbox.");
    const novelTribles = nowOutbox.tribledb.index[EAV].subtract(
      this._outbox.tribledb.index[EAV],
    );
    if (!novelTribles.isEmpty()) {
      const transaction = buildTransaction(novelTribles);
      console.log(transaction);
      this._onOutTxn(transaction);

      const novel = emptykb.withTribles(novelTribles.keys());

      const oldOutbox = this._outbox;
      this._outbox = nowOutbox;

      this._changeWriter.write({
        inbox: {
          old: this._inbox,
          new: emptykb,
          all: this._inbox,
        },
        outbox: {
          old: oldOutbox,
          new: novel,
          all: nowOutbox,
        },
      });
    }

    return nowOutbox;
  }

  async *changes() {
    let readable;
    [this._changeReadable, readable] = this._changeReadable.tee();
    yield* readable.getIterator();
  }

  async *listen(ctx, query, blobdb = defaultBlobDB) {
    const transformer = {
      start(controller) {
        controller.enqueue(emptykb);
      },
      transform(changes, controller) {
        for (
          const result of find(ctx, (vars) => query(changes, vars), blobdb)
        ) {
          controller.enqueue(result);
        }
      },
    };
    let readable;
    [this._changeReadable, readable] = this._changeReadable.tee();

    const resultStream = new TransformStream(transformer);
    yield* readable.pipeThrough(resultStream).getIterator();
  }
}

/*
mq.listen(
  (change, v) => [
    change.inbox.new.where({ name: v.name, titles: [v.title.at(0).descend()] }),
  ]
);
*/

export { TribleMQ };
