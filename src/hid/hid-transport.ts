import { DeviceCommunicationError } from "../errors.js";
import { debug } from "../debug.js";

/**
 * Get the data size (in bytes) for a feature report from the device's
 * HID collections. WebHID requires the data buffer to exactly match
 * the size declared in the report descriptor.
 */
function getFeatureReportSize(
  device: HIDDevice,
  reportId: number,
): number | null {
  for (const collection of device.collections) {
    for (const report of collection.featureReports ?? []) {
      if (report.reportId === reportId) {
        let totalBits = 0;
        for (const item of report.items ?? []) {
          totalBits += (item.reportSize ?? 0) * (item.reportCount ?? 0);
        }
        return Math.ceil(totalBits / 8);
      }
    }
  }
  return null;
}

function hexBytes(data: Uint8Array, maxLen = 32): string {
  const slice = data.subarray(0, maxLen);
  const hex = Array.from(slice, (b) => b.toString(16).padStart(2, "0")).join(" ");
  return data.length > maxLen ? `${hex}...` : hex;
}

/**
 * Dump all HID collections for a device (report IDs, sizes, usage pages).
 */
export function dumpCollections(device: HIDDevice): void {
  for (const col of device.collections) {
    debug(`  Collection: usagePage=0x${(col.usagePage ?? 0).toString(16)} usage=0x${(col.usage ?? 0).toString(16)}`, {
      inputReports: (col.inputReports ?? []).map((r) => ({
        reportId: r.reportId,
        items: (r.items ?? []).map((it) => ({ reportSize: it.reportSize, reportCount: it.reportCount })),
      })),
      outputReports: (col.outputReports ?? []).map((r) => ({
        reportId: r.reportId,
        items: (r.items ?? []).map((it) => ({ reportSize: it.reportSize, reportCount: it.reportCount })),
      })),
      featureReports: (col.featureReports ?? []).map((r) => ({
        reportId: r.reportId,
        items: (r.items ?? []).map((it) => ({ reportSize: it.reportSize, reportCount: it.reportCount })),
        computedSize: (() => {
          let bits = 0;
          for (const it of r.items ?? []) bits += (it.reportSize ?? 0) * (it.reportCount ?? 0);
          return Math.ceil(bits / 8);
        })(),
      })),
    });
  }
}

/**
 * Open a HID device for communication.
 */
export async function openHidDevice(device: HIDDevice): Promise<void> {
  if (!device.opened) {
    debug(`Opening HID device: VID=0x${device.vendorId.toString(16)} PID=0x${device.productId.toString(16)}`);
    await device.open();
  }
}

/**
 * Close a HID device.
 */
export async function closeHidDevice(device: HIDDevice): Promise<void> {
  if (device.opened) {
    await device.close();
  }
}

/**
 * Send a feature report, padding data to match the descriptor's report size.
 *
 * WebHID difference: sendFeatureReport(reportId, data) takes the report ID
 * separately. The data buffer must NOT include the report ID byte, and its
 * length must exactly match the report size from the HID descriptor.
 */
export async function sendFeatureReport(
  device: HIDDevice,
  reportId: number,
  data: Uint8Array,
): Promise<void> {
  const reportSize = getFeatureReportSize(device, reportId);
  debug(`sendFeatureReport: reportId=${reportId}, dataLen=${data.length}, descriptorSize=${reportSize}, data=[${hexBytes(data)}]`);
  if (reportSize === null) {
    throw new DeviceCommunicationError(
      `No feature report with ID ${reportId} in device descriptor`,
    );
  }
  const padded = new Uint8Array(reportSize);
  padded.set(data.subarray(0, reportSize));
  try {
    await device.sendFeatureReport(reportId, padded);
    debug(`sendFeatureReport: success`);
  } catch (e) {
    debug(`sendFeatureReport: FAILED`, e);
    throw e;
  }
}

/**
 * Receive a feature report, retrying for up to 500ms on failure.
 *
 * Some browser/platform combinations (e.g. Chrome on Linux) include the
 * report ID as the first byte of the returned DataView, while the WebHID
 * spec says it should be excluded. We auto-detect this by checking if
 * byte[0] matches the requested reportId — our protocol opcodes (0x83,
 * 0xA4, 0xAE, 0x90, 0x95) never collide with valid report IDs (1, 2).
 */
export async function receiveFeatureReport(
  device: HIDDevice,
  reportId: number,
): Promise<{ reportType: number; reportLength: number; reportData: Uint8Array }> {
  debug(`receiveFeatureReport: reportId=${reportId}`);
  const deadline = performance.now() + 500;
  let lastError: unknown;
  let attempts = 0;

  while (performance.now() < deadline) {
    attempts++;
    try {
      const report = await device.receiveFeatureReport(reportId);

      // Auto-detect report ID prefix: if byte[0] matches the requested
      // reportId, the browser included it and we skip it.
      let offset = 0;
      if (report.getUint8(0) === reportId) {
        offset = 1;
        debug(`receiveFeatureReport: report ID prefix detected, offsetting by 1`);
      }

      const reportType = report.getUint8(offset);
      const reportLength = report.getUint8(offset + 1);
      const available = report.byteLength - (offset + 2);
      const clampedLength = Math.min(reportLength, Math.max(available, 0));
      const reportData = new Uint8Array(
        report.buffer,
        report.byteOffset + offset + 2,
        clampedLength,
      );
      debug(`receiveFeatureReport: success after ${attempts} attempt(s), offset=${offset}, type=0x${reportType.toString(16)}, len=${reportLength}, clamped=${clampedLength}, rawSize=${report.byteLength}, data=[${hexBytes(reportData)}]`);
      return { reportType, reportLength, reportData };
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  debug(`receiveFeatureReport: FAILED after ${attempts} attempts`, lastError);
  throw new DeviceCommunicationError(
    `Failed to receive feature report ${reportId}: ${lastError}`,
  );
}
