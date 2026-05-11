import {
  MESSAGE_INFO,
  MESSAGE_FW_BEGIN,
  MESSAGE_FW_DATA,
  MESSAGE_FW_END,
  MESSAGE_RESET,
  PROVISIONING_MAGIC,
} from "../constants.js";
import type { ValveSerialPort, BootloaderInfo } from "../types.js";
import { ProtocolError } from "../errors.js";
import { debug } from "../debug.js";
import { encodeMessage, decodeMessage } from "./serial-framing.js";
import { writeBytes, readUntilEof } from "./serial-transport.js";

function packU16LE(value: number): Uint8Array {
  const buf = new Uint8Array(2);
  new DataView(buf.buffer).setUint16(0, value, true);
  return buf;
}

/**
 * Send a message and wait for an ACK response.
 * Returns the response payload after the ACK byte.
 */
export async function sendAndExpectAck(
  transport: ValveSerialPort,
  payload: Uint8Array,
): Promise<Uint8Array> {
  const encoded = encodeMessage(payload);
  await writeBytes(transport, encoded);

  const raw = await readUntilEof(transport);
  const decoded = decodeMessage(raw);

  if (decoded.length < 1 || decoded[0] !== 0) {
    throw new ProtocolError(
      `Expected ACK (0x00), got: ${decoded.length ? `0x${decoded[0].toString(16)}` : "empty"}`,
    );
  }

  return decoded.subarray(1);
}

/**
 * Query bootloader INFO.
 * Returns parsed provisioning data (hwid, unit serial, pcba serial).
 */
export async function getBootloaderInfo(
  transport: ValveSerialPort,
): Promise<BootloaderInfo> {
  const msg = packU16LE(MESSAGE_INFO);
  const rsp = await sendAndExpectAck(transport, msg);

  if (rsp.length !== 164) {
    throw new ProtocolError(
      `Bad INFO response length: expected 164, got ${rsp.length}`,
    );
  }

  // Header: bootloader metadata (bytes 0-35)
  const hdrView = new DataView(rsp.buffer, rsp.byteOffset, 36);
  const bootBuildTimestamp = hdrView.getUint32(0, true);
  const installedFwMagic = hdrView.getUint32(4, true);
  const installedFwSize = hdrView.getUint32(8, true);
  const installedFwChecksum = hdrView.getUint32(12, true);

  debug(`bootloaderInfo: bootBL=${bootBuildTimestamp.toString(16).toUpperCase()} fwMagic=${installedFwMagic.toString(16).toUpperCase()} fwSize=${installedFwSize} fwCRC=${installedFwChecksum.toString(16).toUpperCase()}`);

  // Provisioning data starts at offset 36
  const prov = rsp.subarray(36);
  const provView = new DataView(
    prov.buffer,
    prov.byteOffset,
    prov.byteLength,
  );
  const magic = provView.getUint32(0, true);

  if (magic !== PROVISIONING_MAGIC) {
    throw new ProtocolError(
      `Bad provisioning magic: 0x${magic.toString(16)}`,
    );
  }

  const hardwareId = provView.getUint32(4, true);
  const decoder = new TextDecoder("utf-8");

  // Unit serial: 16 bytes at offset 8
  const unitBytes = prov.subarray(8, 24);
  const unitNull = unitBytes.indexOf(0);
  let unitSerial: string;
  try {
    unitSerial = decoder.decode(
      unitNull >= 0 ? unitBytes.subarray(0, unitNull) : unitBytes,
    );
  } catch {
    unitSerial = "None";
  }

  // PCBA serial: 16 bytes at offset 24
  const pcbaBytes = prov.subarray(24, 40);
  const pcbaNull = pcbaBytes.indexOf(0);
  let pcbaSerial: string;
  try {
    pcbaSerial = decoder.decode(
      pcbaNull >= 0 ? pcbaBytes.subarray(0, pcbaNull) : pcbaBytes,
    );
  } catch {
    pcbaSerial = "None";
  }

  return {
    bootBuildTimestamp,
    installedFwMagic,
    installedFwSize,
    installedFwChecksum,
    hardwareId,
    unitSerial,
    pcbaSerial,
  };
}

/**
 * Erase flash (FW_BEGIN).
 */
export async function eraseFlash(
  transport: ValveSerialPort,
): Promise<void> {
  await sendAndExpectAck(transport, packU16LE(MESSAGE_FW_BEGIN));
}

/**
 * Send a firmware data chunk (FW_DATA).
 */
export async function sendFirmwareChunk(
  transport: ValveSerialPort,
  chunk: Uint8Array,
): Promise<void> {
  const header = new Uint8Array(4);
  const headerView = new DataView(header.buffer);
  headerView.setUint16(0, MESSAGE_FW_DATA, true);
  headerView.setUint16(2, chunk.length, true);

  const msg = new Uint8Array(4 + chunk.length);
  msg.set(header);
  msg.set(chunk, 4);

  await sendAndExpectAck(transport, msg);
}

/**
 * Finalize firmware (FW_END) with the 32-byte metadata header.
 */
export async function finalizeFirmware(
  transport: ValveSerialPort,
  metadataHeader: Uint8Array,
): Promise<void> {
  const msgId = packU16LE(MESSAGE_FW_END);
  const msg = new Uint8Array(2 + metadataHeader.length);
  msg.set(msgId);
  msg.set(metadataHeader, 2);

  await sendAndExpectAck(transport, msg);
}

/**
 * Reset the device.
 */
export async function resetDevice(
  transport: ValveSerialPort,
): Promise<void> {
  await sendAndExpectAck(transport, packU16LE(MESSAGE_RESET));
}
