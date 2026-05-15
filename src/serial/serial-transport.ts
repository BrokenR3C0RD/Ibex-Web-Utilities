import { VALVE_VID, BOOTLOADER_PIDS, EOF } from "../constants.js";
import { DeviceClass } from "../types.js";
import type { ValveSerialPort } from "../types.js";
import { UserCancelledError, DeviceCommunicationError } from "../errors.js";
import { debug } from "../debug.js";

function hexdump(data: Uint8Array, maxBytes = 64): string {
  const hex = Array.from(data.subarray(0, maxBytes), b => b.toString(16).padStart(2, '0')).join(' ');
  return data.length > maxBytes ? `${hex}... (${data.length} bytes total)` : hex;
}

/**
 * Request user to select a serial port for a bootloader device.
 * Must be called from a user gesture handler.
 */
export async function requestSerialPort(
  deviceClass: DeviceClass,
): Promise<SerialPort> {
  const pid =
    deviceClass === DeviceClass.Triton
      ? BOOTLOADER_PIDS.TRITON
      : BOOTLOADER_PIDS.PROTEUS;

  let port: SerialPort;
  try {
    port = await navigator.serial.requestPort({
      filters: [{ usbVendorId: VALVE_VID, usbProductId: pid }],
    });
  } catch {
    throw new UserCancelledError();
  }
  return port;
}

/**
 * Open a serial port and acquire reader/writer locks.
 */
export async function openSerialPort(
  port: SerialPort,
): Promise<ValveSerialPort> {
  await port.open({ baudRate: 115200 });

  if (!port.readable || !port.writable) {
    throw new DeviceCommunicationError("Serial port streams not available");
  }

  const reader = port.readable.getReader();
  const writer = port.writable.getWriter();
  return { port, reader, writer };
}

/**
 * Release reader/writer locks and close the serial port.
 */
export async function closeSerialPort(
  transport: ValveSerialPort,
): Promise<void> {
  try {
    transport.reader.releaseLock();
  } catch {
    // Already released
  }
  try {
    transport.writer.releaseLock();
  } catch {
    // Already released
  }
  await transport.port.close();
}

/**
 * Read bytes from serial until the EOF framing byte (0xAE) is encountered.
 *
 * This is safe to use as a delimiter because in the wire encoding,
 * any literal 0xAE within the payload is escaped as [0xAC, 0x02],
 * so a raw 0xAE always means end-of-frame.
 */
export async function readUntilEof(
  transport: ValveSerialPort,
  timeoutMs: number = 60_000,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  const timeoutId = setTimeout(() => {
    transport.reader.cancel();
  }, timeoutMs);

  try {
    while (true) {
      const { value, done } = await transport.reader.read();
      if (done || !value) {
        throw new DeviceCommunicationError("Serial read ended unexpectedly");
      }

      // Check if this chunk contains EOF
      const eofIdx = value.indexOf(EOF);
      if (eofIdx !== -1) {
        chunks.push(value.subarray(0, eofIdx + 1));
        totalLength += eofIdx + 1;
        if (eofIdx + 1 < value.length) {
          debug(`readUntilEof: ${value.length - eofIdx - 1} bytes after EOF discarded: ${hexdump(value.subarray(eofIdx + 1))}`);
        }
        break;
      }

      chunks.push(value);
      totalLength += value.length;
    }
  } finally {
    clearTimeout(timeoutId);
  }

  // Concatenate all chunks
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  debug(`serial:read ${hexdump(result)}`);
  return result;
}

/**
 * Write raw bytes to the serial port.
 */
export async function writeBytes(
  transport: ValveSerialPort,
  data: Uint8Array,
): Promise<void> {
  debug(`serial:write ${hexdump(data)}`);
  await transport.writer.write(data);
}
