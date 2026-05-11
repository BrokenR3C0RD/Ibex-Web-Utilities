import { useState } from "react";
import { DeviceTypeNames, DeviceClass, rebootToBootloader, getDeviceClass } from "@lib/index.js";
import type { ConnectedController, DeviceAttributes } from "@lib/index.js";
import type { ConnectedDevice } from "../App";
import { ExtraAttributes } from "./DeviceAttributes";
import { TimestampValue } from "./TimestampValue";

interface DeviceCardProps {
  device: ConnectedDevice;
}

function ControllerChild({ controller }: { controller: ConnectedController }) {
  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
      <h3 className="text-sm font-medium text-purple-300 mb-2">
        Steam Controller (Wireless) — Slot {controller.slot}
      </h3>
      <dl className="space-y-1 text-xs">
        <div className="flex justify-between">
          <dt className="text-gray-400">Serial</dt>
          <dd className="font-mono">{controller.serialNumber}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-400">Hardware ID</dt>
          <dd className="font-mono">0x{controller.hardwareId.toString(16).toUpperCase()}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-400">Firmware Version</dt>
          <TimestampValue ts={controller.buildTimestamp} />
        </div>
        {controller.bootBuildTimestamp !== 0 && (
          <div className="flex justify-between">
            <dt className="text-gray-400">Bootloader Version</dt>
            <TimestampValue ts={controller.bootBuildTimestamp} />
          </div>
        )}
        {controller.productId !== 0 && (
          <div className="flex justify-between">
            <dt className="text-gray-400">Product ID</dt>
            <dd className="font-mono">0x{controller.productId.toString(16).toUpperCase()}</dd>
          </div>
        )}
        {controller.capabilities !== 0 && (
          <div className="flex justify-between">
            <dt className="text-gray-400">Capabilities</dt>
            <dd className="font-mono">0x{controller.capabilities.toString(16).toUpperCase()}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/** Keys shown directly on the card — excluded from the expanded attributes */
const PROMOTED_KEYS = new Set([
  "buildTimestamp",
  "bootBuildTimestamp",
  "hardwareId",
  "productId",
  "capabilities",
]);

export function DeviceCard({ device }: DeviceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [rebooting, setRebooting] = useState(false);
  const [rebootError, setRebootError] = useState<string | null>(null);
  const { info, attrs, connectedControllers } = device;

  const isPuck = info.deviceClass === DeviceClass.Proteus;

  const handleRebootToBootloader = async () => {
    setRebootError(null);
    setRebooting(true);
    try {
      const deviceClass = getDeviceClass(info.type);
      await rebootToBootloader(deviceClass, device.hid);
    } catch (e) {
      setRebootError(e instanceof Error ? e.message : String(e));
    } finally {
      setRebooting(false);
    }
  };

  const hasExtras = attrs && Object.keys(attrs).some(
    (k) => !PROMOTED_KEYS.has(k) && attrs[k as keyof DeviceAttributes] !== undefined,
  );

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">
          {DeviceTypeNames[info.type]}
        </h2>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          isPuck ? "bg-teal-800 text-teal-200" : "bg-purple-800 text-purple-200"
        }`}>
          {isPuck ? "Puck" : "Controller"}
        </span>
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-gray-400">Serial</dt>
          <dd className="font-mono">{info.serialNumber}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-400">Hardware ID</dt>
          <dd className="font-mono">0x{info.hardwareId.toString(16).toUpperCase()}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-400">Firmware Version</dt>
          <TimestampValue ts={info.buildTimestamp} />
        </div>
        {attrs?.bootBuildTimestamp != null && (
          <div className="flex justify-between">
            <dt className="text-gray-400">Bootloader Version</dt>
            <TimestampValue ts={attrs.bootBuildTimestamp} />
          </div>
        )}
        {attrs?.productId != null && (
          <div className="flex justify-between">
            <dt className="text-gray-400">Product ID</dt>
            <dd className="font-mono">0x{attrs.productId.toString(16).toUpperCase()}</dd>
          </div>
        )}
        {attrs?.capabilities != null && (
          <div className="flex justify-between">
            <dt className="text-gray-400">Capabilities</dt>
            <dd className="font-mono">0x{attrs.capabilities.toString(16).toUpperCase()}</dd>
          </div>
        )}
      </dl>

      {hasExtras && (
        <div className="mt-4 border-t border-gray-800 pt-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            {expanded ? "Hide" : "Show"} all attributes
          </button>
          {expanded && <ExtraAttributes attrs={attrs!} exclude={PROMOTED_KEYS} />}
        </div>
      )}

      {isPuck && connectedControllers.length > 0 && (
        <div className="mt-4 border-t border-gray-800 pt-3">
          <p className="text-xs text-gray-400 mb-2">
            Connected controllers ({connectedControllers.length})
          </p>
          <div className="space-y-2">
            {connectedControllers.map((c) => (
              <ControllerChild key={c.serialNumber} controller={c} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-gray-800 pt-3">
        {rebootError && (
          <p className="text-xs text-red-400 mb-2">{rebootError}</p>
        )}
        <button
          onClick={handleRebootToBootloader}
          disabled={rebooting}
          className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 disabled:bg-amber-900 disabled:cursor-not-allowed rounded text-xs font-medium transition-colors"
        >
          {rebooting ? "Rebooting..." : "Reboot to Bootloader"}
        </button>
      </div>
    </div>
  );
}
