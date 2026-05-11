import {
  TRITON_FW_MAGIC,
  PROTEUS_FW_MAGIC,
  FW_HEADER_SIZE,
} from "./constants.js";
import { DeviceClass } from "./types.js";
import { InvalidFirmwareError } from "./errors.js";
import type { FirmwareFile } from "./types.js";

export function parseFirmware(raw: Uint8Array): FirmwareFile {
  if (raw.byteLength < FW_HEADER_SIZE) {
    throw new InvalidFirmwareError("Firmware file too small");
  }

  const headerBytes = raw.slice(0, FW_HEADER_SIZE);
  const view = new DataView(
    headerBytes.buffer,
    headerBytes.byteOffset,
    headerBytes.byteLength,
  );
  const magic = view.getUint32(0, true);

  if (magic !== TRITON_FW_MAGIC && magic !== PROTEUS_FW_MAGIC) {
    throw new InvalidFirmwareError(
      `Invalid firmware magic: 0x${magic.toString(16)}`,
    );
  }

  return {
    metadata: { magic, headerBytes },
    data: raw.slice(FW_HEADER_SIZE),
  };
}

export function getFirmwareDeviceClass(firmware: FirmwareFile): DeviceClass {
  if (firmware.metadata.magic === TRITON_FW_MAGIC) {
    return DeviceClass.Triton;
  }
  return DeviceClass.Proteus;
}

export function validateFirmwareForDevice(
  firmware: FirmwareFile,
  deviceClass: DeviceClass,
): void {
  const fwClass = getFirmwareDeviceClass(firmware);
  if (fwClass !== deviceClass) {
    throw new InvalidFirmwareError(
      `Firmware is for ${DeviceClass[fwClass]}, but device is ${DeviceClass[deviceClass]}`,
    );
  }
}
