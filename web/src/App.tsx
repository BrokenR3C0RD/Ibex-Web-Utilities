import { useState, useEffect, useCallback, useRef } from "react";
import {
  requestHidDevice,
  getGrantedHidDevices,
  getConnectedControllers,
  getGrantedBootloaderDevices,
  requestSerialPort,
  watchControllerSlots,
  getDeviceInfo,
  readAllAttributes,
  UserCancelledError,
  DeviceClass,
} from "@lib/index.js";
import type { ValveHidDevice, DeviceInfo, DeviceAttributes, ConnectedController, BootloaderDevice } from "@lib/index.js";
import { ConnectButton } from "./components/ConnectButton";
import { DeviceList } from "./components/DeviceList";
import { ErrorBanner } from "./components/ErrorBanner";
import { DebugPanel } from "./components/DebugPanel";

export interface ConnectedDevice {
  hid: ValveHidDevice;
  info: DeviceInfo;
  attrs: DeviceAttributes | null;
  connectedControllers: ConnectedController[];
}

/** Debounce delay for USB hotplug events (ms).
 *  The Puck has 5 HID interfaces that enumerate/de-enumerate
 *  one at a time — we wait for them all to settle. */
const HOTPLUG_DEBOUNCE_MS = 2000;

/** Short debounce for wireless connect/disconnect (ms).
 *  Only need a brief delay since no USB re-enumeration happens. */
const WIRELESS_DEBOUNCE_MS = 500;

export function App() {
  const [devices, setDevices] = useState<Map<string, ConnectedDevice>>(new Map());
  const [bootloaderDevices, setBootloaderDevices] = useState<BootloaderDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshDevices = useCallback(async () => {
    try {
      const granted = await getGrantedHidDevices();
      const next = new Map<string, ConnectedDevice>();

      for (const hidDev of granted) {
        const info = await getDeviceInfo(hidDev);
        const key = `${info.serialNumber}:${info.type}`;
        let attrs: DeviceAttributes | null = null;
        try {
          attrs = await readAllAttributes(hidDev);
        } catch {
          // Non-critical
        }
        next.set(key, { hid: hidDev, info, attrs, connectedControllers: [] });
      }

      // Scan controller slots and attach to dongle devices
      const controllers = await getConnectedControllers();
      if (controllers.length > 0) {
        for (const [key, dev] of next) {
          if (dev.info.deviceClass === DeviceClass.Proteus) {
            next.set(key, { ...dev, connectedControllers: controllers });
          }
        }
      }

      setDevices(next);
    } catch {
      // WebHID may not be available
    }

    // Scan for bootloader devices (Web Serial)
    try {
      const blDevices = await getGrantedBootloaderDevices();
      setBootloaderDevices(blDevices);
    } catch {
      setBootloaderDevices([]);
    }
  }, []);

  /** Lightweight refresh: only rescan controller slots and update
   *  existing dongle cards. Skips re-querying the dongle itself. */
  const refreshControllers = useCallback(async () => {
    try {
      const controllers = await getConnectedControllers();
      setDevices((prev) => {
        const next = new Map(prev);
        let changed = false;
        for (const [key, dev] of next) {
          if (dev.info.deviceClass === DeviceClass.Proteus) {
            next.set(key, { ...dev, connectedControllers: controllers });
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    } catch {
      // No dongle or WebHID unavailable
    }
  }, []);

  /** Schedule a debounced callback — resets the timer on each call
   *  so rapid events coalesce into one invocation. */
  const scheduleCallback = useCallback((fn: () => void, delayMs: number) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null;
      fn();
    }, delayMs);
  }, []);

  // watchGeneration increments on USB hotplug to re-attach wireless listeners
  // when device handles change.
  const [watchGeneration, setWatchGeneration] = useState(0);

  const refreshDevicesAndRewatch = useCallback(async () => {
    await refreshDevices();
    setWatchGeneration((g) => g + 1);
  }, [refreshDevices]);

  // Initial load (no debounce)
  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  // Listen for USB device connect/disconnect with debounce (HID + Serial)
  useEffect(() => {
    const onHotplug = () => { scheduleCallback(refreshDevicesAndRewatch, HOTPLUG_DEBOUNCE_MS); };
    const cleanups: (() => void)[] = [];

    if (navigator.hid) {
      navigator.hid.addEventListener("connect", onHotplug);
      navigator.hid.addEventListener("disconnect", onHotplug);
      cleanups.push(() => {
        navigator.hid.removeEventListener("connect", onHotplug);
        navigator.hid.removeEventListener("disconnect", onHotplug);
      });
    }

    if (navigator.serial) {
      navigator.serial.addEventListener("connect", onHotplug);
      navigator.serial.addEventListener("disconnect", onHotplug);
      cleanups.push(() => {
        navigator.serial.removeEventListener("connect", onHotplug);
        navigator.serial.removeEventListener("disconnect", onHotplug);
      });
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [scheduleCallback, refreshDevicesAndRewatch]);

  useEffect(() => {
    let stopWatch: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const stop = await watchControllerSlots(() => {
          scheduleCallback(refreshControllers, WIRELESS_DEBOUNCE_MS);
        });
        if (cancelled) {
          stop();
        } else {
          stopWatch = stop;
        }
      } catch {
        // No dongle connected or WebHID unavailable
      }
    })();

    return () => {
      cancelled = true;
      stopWatch?.();
    };
  }, [scheduleCallback, refreshControllers, watchGeneration]);

  const handleConnect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await requestHidDevice();
      await refreshDevicesAndRewatch();
    } catch (e) {
      if (e instanceof UserCancelledError) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [refreshDevicesAndRewatch]);

  const handleConnectBootloader = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // requestSerialPort needs a device class, but we don't know which
      // one the user has. Use a raw requestPort with both PID filters.
      await navigator.serial.requestPort({
        filters: [
          { usbVendorId: 0x28de, usbProductId: 0x1005 },
          { usbVendorId: 0x28de, usbProductId: 0x1007 },
        ],
      });
      await refreshDevicesAndRewatch();
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotFoundError") return;
      if (e instanceof UserCancelledError) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [refreshDevicesAndRewatch]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Valve Firmware Updater</h1>
        <div className="flex items-center gap-2">
          <ConnectButton onClick={handleConnect} loading={loading} />
          <button
            onClick={handleConnectBootloader}
            disabled={loading}
            className="px-4 py-2 bg-amber-700 hover:bg-amber-600 disabled:bg-amber-900 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
          >
            Connect Bootloader
          </button>
        </div>
      </header>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <main className="p-6">
        <DeviceList devices={Array.from(devices.values())} bootloaderDevices={bootloaderDevices} />
      </main>

      <DebugPanel />
    </div>
  );
}
