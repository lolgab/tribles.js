import { bigIntToBytes, bytesToBigInt } from "./util.js";

const spread = (x) => {
  let X = BigInt(x);
  X = (X | (X << 64n)) &
    0b000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111111111n;

  X = (X | (X << 32n)) &
    0b000000000000000000000000000000001111111111111111000000000000000000000000000000001111111111111111000000000000000000000000000000001111111111111111000000000000000000000000000000001111111111111111n;

  X = (X | (X << 16n)) &
    0b000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111n;

  X = (X | (X << 8n)) &
    0b000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111n;

  X = (X | (X << 4n)) &
    0b000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011n;

  X = (X | (X << 2n)) &
    0b001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001n;
  return X;
};

const unspread = (x) => {
  let X = BigInt(x);
  X = X &
    0b001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001001n;
  X = (X | (X >> 2n)) &
    0b000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011000011n;

  X = (X | (X >> 4n)) &
    0b000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111000000001111n;

  X = (X | (X >> 8n)) &
    0b000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111000000000000000011111111n;

  X = (X | (X >> 16n)) &
    0b000000000000000000000000000000001111111111111111000000000000000000000000000000001111111111111111000000000000000000000000000000001111111111111111000000000000000000000000000000001111111111111111n;

  X = (X | (X >> 32n)) &
    0b000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111111111n;

  X = (X | (X >> 64n)) &
    0b1111111111111111111111111111111111111111111111111111111111111111n;

  return X;
};

function spacetimestampEncoder(v, b) {
  const { t, x, y, z } = v;
  if (t > 0xffffffffffffffffn) {
    throw Error(
      "Error encoding spacetimestamp: Not in valid range: 0 <= t <= 2^64-1.",
    );
  }
  if (x > 0xffffffffffffffffn) {
    throw Error(
      "Error encoding spacetimestamp: Not in valid range: 0 <= x <= 2^64-1.",
    );
  }
  if (y > 0xffffffffffffffffn) {
    throw Error(
      "Error encoding spacetimestamp: Not in valid range: 0 <= y <= 2^64-1.",
    );
  }
  if (z > 0xffffffffffffffffn) {
    throw Error(
      "Error encoding spacetimestamp: Not in valid range: 0 <= z <= 2^64-1.",
    );
  }
  const xyz = (spread(x) << 2n) | (spread(y) << 1n) | spread(z);
  bigIntToBytes(t, b, 0, 8);
  bigIntToBytes(xyz, b, 8, 24);
  return null;
}

function spacetimestampDecoder(b, blob) {
  const t = bytesToBigInt(b, 0, 8);
  const xyz = bytesToBigInt(b, 8, 24);
  const x = unspread(xyz >> 2n);
  const y = unspread(xyz >> 1n);
  const z = unspread(xyz);

  return { t, x, y, z };
}

const spacetimestamp = {
  encoder: spacetimestampEncoder,
  decoder: spacetimestampDecoder,
};

export { spacetimestamp };
