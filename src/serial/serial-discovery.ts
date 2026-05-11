import { VALVE_VID, BOOTLOADER_PIDS } from "../constants.js";
import { DeviceType, DeviceClass } from "../types.js";
import type { BootloaderInfo } from "../types.js";
import { debug } from "../debug.js";
import { openSerialPort, closeSerialPort } from "./serial-transport.js";
import { getBootloaderInfo } from "./serial-protocol.js";

export interface BootloaderDevice {
  port: SerialPort;
  deviceType: DeviceType;
  deviceClass: DeviceClass;
  info: BootloaderInfo;
}

const PID_TO_BL_TYPE: Record<number, { type: DeviceType; class: DeviceClass }> = {
  [BOOTLOADER_PIDS.TRITON]: { type: DeviceType.TritonBootloader, class: DeviceClass.Triton },
  [BOOTLOADER_PIDS.PROTEUS]: { type: DeviceType.ProteusBootloader, class: DeviceClass.Proteus },
};

function getPortInfo(port: SerialPort): { vid: number; pid: number } | null {
  const info = port.getInfo();
  if (info.usbVendorId !== undefined && info.usbProductId !== undefined) {
    return { vid: info.usbVendorId, pid: info.usbProductId };
  }
  return null;
}

/**
 * Get all previously-granted serial ports that are Valve bootloader devices.
 * Opens each port, queries INFO, then closes it.
 * No user gesture needed.
 */
export async function getGrantedBootloaderDevices(): Promise<BootloaderDevice[]> {
  if (!navigator.serial) return [];

  const ports = await navigator.serial.getPorts();
  const results: BootloaderDevice[] = [];

  for (const port of ports) {
    const portInfo = getPortInfo(port);
    if (!portInfo || portInfo.vid !== VALVE_VID) continue;

    const blType = PID_TO_BL_TYPE[portInfo.pid];
    if (!blType) continue;

    debug(`getGrantedBootloaderDevices: found port VID=0x${portInfo.vid.toString(16)} PID=0x${portInfo.pid.toString(16)}`);

    try {
      const transport = await openSerialPort(port);
      try {
        const info = await getBootloaderInfo(transport);
        debug(`getGrantedBootloaderDevices: ${DeviceType[blType.type]} serial=${info.unitSerial} hwid=${info.hardwareId}`);
        results.push({
          port,
          deviceType: blType.type,
          deviceClass: blType.class,
          info,
        });
      } finally {
        await closeSerialPort(transport);
      }
    } catch (e) {
      debug(`getGrantedBootloaderDevices: failed to query port`, e);
    }
  }

  return results;
}
