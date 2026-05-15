export const FIRMWARE_CATALOG_URL =
  "https://opensteamcontroller.github.io/Ibex-Firmware/index.json";

export interface FirmwareEntry {
  version_hex: string;
  version_unix: number;
  crc32: string;
  sha256: string;
  file_size: number;
  payload_size: number;
}

export interface CrcIndexEntry {
  category: "controller" | "puck";
  path: string;
  version_hex: string;
}

export interface FirmwareCatalog {
  controller: Record<string, FirmwareEntry>;
  puck: Record<string, FirmwareEntry>;
  crc32_index: Record<string, CrcIndexEntry>;
  generated_at?: string;
}

export async function fetchFirmwareCatalog(): Promise<FirmwareCatalog> {
  const res = await fetch(FIRMWARE_CATALOG_URL);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as FirmwareCatalog;
}

export function lookupFirmwareByCrc(
  catalog: FirmwareCatalog,
  crc32: number,
): CrcIndexEntry | null {
  const key = (crc32 >>> 0).toString(16).padStart(8, "0").toLowerCase();
  return catalog.crc32_index[key] ?? null;
}
