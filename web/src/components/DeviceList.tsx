import type { BootloaderDevice } from "@lib/index.js";
import type { ConnectedDevice } from "../App";
import { DeviceCard } from "./DeviceCard";
import { BootloaderCard } from "./BootloaderCard";

interface DeviceListProps {
  devices: ConnectedDevice[];
  bootloaderDevices: BootloaderDevice[];
}

export function DeviceList({ devices, bootloaderDevices }: DeviceListProps) {
  if (devices.length === 0 && bootloaderDevices.length === 0) {
    return (
      <div className="text-center text-gray-500 py-20">
        <p className="text-lg">No devices connected</p>
        <p className="text-sm mt-1">Click "Connect Device" to get started</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {devices.map((dev, i) => (
        <DeviceCard key={`hid-${i}`} device={dev} />
      ))}
      {bootloaderDevices.map((dev, i) => (
        <BootloaderCard key={`bl-${i}`} device={dev} />
      ))}
    </div>
  );
}
