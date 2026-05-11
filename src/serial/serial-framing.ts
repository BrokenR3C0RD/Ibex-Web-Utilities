import { SOF, EOF, ESCAPE } from "../constants.js";
import { ProtocolError } from "../errors.js";

export function encodeMessage(msg: Uint8Array): Uint8Array {
  const parts: number[] = [SOF];

  for (const byte of msg) {
    if (byte === ESCAPE) {
      parts.push(ESCAPE, 0x00);
    } else if (byte === SOF) {
      parts.push(ESCAPE, 0x01);
    } else if (byte === EOF) {
      parts.push(ESCAPE, 0x02);
    } else {
      parts.push(byte);
    }
  }

  parts.push(EOF);
  return new Uint8Array(parts);
}

export function decodeMessage(data: Uint8Array): Uint8Array {
  const sofPos = data.indexOf(SOF);
  const eofPos = data.indexOf(EOF);

  if (sofPos === -1 || eofPos === -1 || eofPos <= sofPos) {
    throw new ProtocolError("Invalid framing: missing SOF or EOF");
  }

  const inner = data.subarray(sofPos + 1, eofPos);
  const result: number[] = [];
  let escapeState = false;

  for (const byte of inner) {
    if (escapeState) {
      result.push(byte + ESCAPE);
      escapeState = false;
    } else if (byte === ESCAPE) {
      escapeState = true;
    } else {
      result.push(byte);
    }
  }

  return new Uint8Array(result);
}
