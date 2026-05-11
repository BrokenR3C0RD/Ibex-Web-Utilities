import { DeviceTypeNames, DeviceClass } from "@lib/index.js";
import { TRITON_FW_MAGIC, PROTEUS_FW_MAGIC } from "@lib/constants.js";
import type { BootloaderDevice } from "@lib/index.js";
import { TimestampValue } from "./TimestampValue";

interface BootloaderCardProps {
  device: BootloaderDevice;
}

function fwMagicName(magic: number): string {
  if (magic === TRITON_FW_MAGIC) return "IBEX";
  if (magic === PROTEUS_FW_MAGIC) return "PROTEUS";
  return `Unknown (0x${magic.toString(16).toUpperCase()})`;
}

export function BootloaderCard({ device }: BootloaderCardProps) {
  const { info, deviceType } = device;

  return (
    <div className="bg-gray-900 border border-amber-800/50 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">
          {DeviceTypeNames[deviceType]}
        </h2>
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-800 text-amber-200">
          Bootloader
        </span>
      </div>

      <p className="text-xs text-amber-400 mb-3">
        Device is in bootloader mode — ready for firmware update.
      </p>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-gray-400">Unit Serial</dt>
          <dd className="font-mono">{info.unitSerial}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-400">PCBA Serial</dt>
          <dd className="font-mono">{info.pcbaSerial}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-400">Hardware ID</dt>
          <dd className="font-mono">0x{info.hardwareId.toString(16).toUpperCase()}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-400">Bootloader Version</dt>
          <TimestampValue ts={info.bootBuildTimestamp} />
        </div>
      </dl>

      {info.installedFwMagic !== 0 && (
        <div className="mt-4 border-t border-gray-800 pt-3">
          <p className="text-xs text-gray-400 mb-2">Installed firmware</p>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-400">Target</dt>
              <dd className="font-mono text-xs">{fwMagicName(info.installedFwMagic)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">Size</dt>
              <dd className="font-mono">{(info.installedFwSize / 1024).toFixed(1)} KiB</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">Checksum</dt>
              <dd className="font-mono">0x{info.installedFwChecksum.toString(16).toUpperCase()}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
