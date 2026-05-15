import { useState, useRef, useCallback } from "react";
import {
  parseFirmware,
  getFirmwareDeviceClass,
  validateFirmwareForDevice,
  flashFirmware,
  openSerialPort,
  closeSerialPort,
  DeviceClass,
} from "@lib/index.js";
import { TRITON_FW_MAGIC, PROTEUS_FW_MAGIC } from "@lib/constants.js";
import type { BootloaderDevice, FirmwareFile, UpdateEvent } from "@lib/index.js";
import type { FirmwareCatalog, FirmwareChannel, LatestFirmwareRelease } from "../firmware-catalog";
import {
  downloadFirmware,
  listFirmwareForCategory,
  lookupFirmwareByCrc,
  primaryChannel,
} from "../firmware-catalog";
import { Modal } from "./Modal";
import {
  WarningIcon,
  FlashIcon,
  SpinnerIcon,
  CheckCircleIcon,
  UploadIcon,
} from "./Icons";
import styles from "./FlashWizard.module.sass";

type WizardStep =
  | "disclaimer"
  | "catalog_select"
  | "file_select"
  | "confirm"
  | "flashing"
  | "complete"
  | "error";

export type FlashWizardMode = "catalog" | "file";

function fwMagicName(magic: number): string {
  if (magic === TRITON_FW_MAGIC) return "IBEX (Controller)";
  if (magic === PROTEUS_FW_MAGIC) return "PROTEUS (Puck)";
  return `Unknown (0x${magic.toString(16).toUpperCase()})`;
}

interface FlashWizardProps {
  device: BootloaderDevice;
  firmwareCatalog: FirmwareCatalog | null;
  mode: FlashWizardMode;
  isOpen: boolean;
  onClose: () => void;
  onFlashComplete: () => void;
  onFlashingChange: (flashing: boolean) => void;
}

export function FlashWizard({ device, firmwareCatalog, mode, isOpen, onClose, onFlashComplete, onFlashingChange }: FlashWizardProps) {
  const [step, setStep] = useState<WizardStep>("disclaimer");
  const [firmware, setFirmware] = useState<FirmwareFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [flashStatus, setFlashStatus] = useState<UpdateEvent | null>(null);
  const [flashError, setFlashError] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [downloadingFilename, setDownloadingFilename] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const flashAttempted = useRef(false);

  const reset = useCallback(() => {
    setStep("disclaimer");
    setFirmware(null);
    setFileError(null);
    setFlashStatus(null);
    setFlashError(null);
    setCatalogSearch("");
    setDownloadingFilename(null);
    flashAttempted.current = false;
  }, []);

  const handleClose = useCallback(() => {
    const needsRefresh = flashAttempted.current;
    onFlashingChange(false);
    reset();
    onClose();
    if (needsRefresh) onFlashComplete();
  }, [reset, onClose, onFlashingChange, onFlashComplete]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError(null);

    try {
      const raw = new Uint8Array(await file.arrayBuffer());
      const fw = parseFirmware(raw);
      validateFirmwareForDevice(fw, device.deviceClass);
      setFirmware(fw);
      setStep("confirm");
    } catch (err) {
      setFileError(err instanceof Error ? err.message : String(err));
      // Reset input so the same file can be re-selected after fixing
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [device.deviceClass]);

  const handleCatalogSelect = useCallback(async (release: LatestFirmwareRelease) => {
    setFileError(null);
    setDownloadingFilename(release.filename);
    try {
      const category = device.deviceClass === DeviceClass.Proteus ? "puck" : "controller";
      const bytes = await downloadFirmware(category, release.filename);
      const fw = parseFirmware(bytes);
      validateFirmwareForDevice(fw, device.deviceClass);
      setFirmware(fw);
      setStep("confirm");
    } catch (err) {
      setFileError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloadingFilename(null);
    }
  }, [device.deviceClass]);

  const handleFlash = useCallback(async () => {
    if (!firmware) return;

    setStep("flashing");
    setFlashError(null);
    flashAttempted.current = true;
    onFlashingChange(true);

    let transport;
    try {
      transport = await openSerialPort(device.port);
    } catch (err) {
      setFlashError(`Failed to open serial port: ${err instanceof Error ? err.message : String(err)}`);
      setStep("error");
      return;
    }

    try {
      await flashFirmware(transport, firmware, (event) => {
        setFlashStatus(event);
      });
      setStep("complete");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFlashError(
        `${msg}\n\nThe controller will reboot into bootloader mode automatically. Please reconnect and try again.`,
      );
      setStep("error");
    } finally {
      try {
        await closeSerialPort(transport);
      } catch {
        // Port may already be closed after reset
      }
    }
  }, [firmware, device.port, onFlashingChange]);

  const handleDone = handleClose;

  const stepTitle: Record<WizardStep, string> = {
    disclaimer: "Flash Firmware",
    catalog_select: "Select Firmware",
    file_select: "Select Firmware File",
    confirm: "Confirm Flash",
    flashing: "Flashing Firmware",
    complete: "Flash Complete",
    error: "Flash Error",
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={stepTitle[step]}
      preventClose={step === "flashing"}
    >
      {step === "disclaimer" && (
        <>
          {mode === "catalog" && (
            <p className="text-sm text-gray-400 mb-3">
              Firmware will be downloaded from the OpenSteamController index.
            </p>
          )}
          <div className={styles.warningBox}>
            <div className="flex items-start gap-2">
              <WarningIcon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm text-gray-300">
                <p className="font-medium text-amber-400 mb-2">Warning: Proceed at your own risk</p>
                <ul className="space-y-1 text-xs text-gray-400 list-disc list-inside">
                  <li>This tool is unofficial and not affiliated with Valve.</li>
                  {mode === "file" && (
                    <li>Unofficial firmware not provided by Valve may cause permanent, irreversible damage to your controller.</li>
                  )}
                  <li>You accept full responsibility for any damage to your device.</li>
                  <li>The authors accept no liability for bricked, damaged, or destroyed devices, regardless of the firmware used.</li>
                </ul>
              </div>
            </div>
          </div>

          <div className={styles.recoveryBox}>
            <p className="text-xs font-medium text-blue-400 mb-2">Recovery instructions</p>
            {device.deviceClass === DeviceClass.Triton ? (
              <div className="text-xs text-gray-400 space-y-1">
                <p>If your controller becomes unresponsive after a failed flash:</p>
                <ol className="list-decimal list-inside space-y-0.5 ml-1">
                  <li>Remove the battery</li>
                  <li>Hold <span className="font-mono text-gray-300">View + Menu + A</span> while plugging in via USB</li>
                  <li>The controller will enter bootloader mode for re-flashing</li>
                </ol>
              </div>
            ) : (
              <p className="text-xs text-gray-400">
                The Puck automatically enters bootloader mode for 4 seconds on power-up.
                If a flash fails, simply reconnect and re-flash within that window.
              </p>
            )}
          </div>

          <div className={styles.buttonRow}>
            <button className={styles.cancelButton} onClick={handleClose}>Cancel</button>
            <button
              className={styles.primaryButton}
              onClick={() => setStep(mode === "catalog" ? "catalog_select" : "file_select")}
            >
              I Understand, Continue
            </button>
          </div>
        </>
      )}

      {step === "catalog_select" && (() => {
        const category = device.deviceClass === DeviceClass.Proteus ? "puck" : "controller";
        const all = firmwareCatalog ? listFirmwareForCategory(firmwareCatalog, category) : [];
        const q = catalogSearch.trim().toLowerCase();
        const visible = q
          ? all.filter((r) => r.entry.version_hex.toLowerCase().includes(q))
          : all;
        return (
          <>
            <input
              type="text"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Search by version (e.g. 6A05E8CE)"
              className={styles.searchInput}
              autoFocus
              disabled={!!downloadingFilename}
            />

            {!firmwareCatalog ? (
              <p className="text-sm text-gray-500 italic mt-3">Catalog hasn't loaded yet.</p>
            ) : visible.length === 0 ? (
              <p className="text-sm text-gray-500 italic mt-3">
                {q ? "No matches." : "No firmwares in catalog for this device."}
              </p>
            ) : (
              <ul className={styles.catalogList}>
                {visible.map((r) => {
                  const ch = primaryChannel(r.entry);
                  const dateIso = ch ? r.entry.first_seen?.[ch]?.date : undefined;
                  const date = dateIso ? new Date(dateIso).toLocaleDateString() : "—";
                  const isDownloading = downloadingFilename === r.filename;
                  return (
                    <li key={r.filename}>
                      <button
                        type="button"
                        className={styles.catalogRow}
                        onClick={() => void handleCatalogSelect(r)}
                        disabled={!!downloadingFilename}
                      >
                        <span className={styles.catalogVersion}>{r.entry.version_hex.toUpperCase()}</span>
                        <span className={styles.catalogDate}>{date}</span>
                        {ch === "stable" && <span className={styles.channelChipStable}>Stable</span>}
                        {ch === "publicbeta" && <span className={styles.channelChipBeta}>Beta</span>}
                        {isDownloading && <SpinnerIcon className="w-3.5 h-3.5 text-amber-400" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {fileError && <p className={styles.errorText}>{fileError}</p>}

            <div className={styles.buttonRow}>
              <button
                className={styles.cancelButton}
                onClick={handleClose}
                disabled={!!downloadingFilename}
              >
                Cancel
              </button>
            </div>
          </>
        );
      })()}

      {step === "file_select" && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <UploadIcon className="w-5 h-5 text-gray-400" />
            <p className="text-sm text-gray-300">Select a <span className="font-mono text-gray-200">.fw</span> firmware file to flash.</p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".fw"
            onChange={handleFileSelect}
            className={styles.fileInput}
          />

          {fileError && <p className={styles.errorText}>{fileError}</p>}

          <div className={styles.buttonRow}>
            <button className={styles.cancelButton} onClick={handleClose}>Cancel</button>
          </div>
        </>
      )}

      {step === "confirm" && firmware && (() => {
        const hasInstalled = device.info.installedFwMagic !== 0 && device.info.installedFwMagic !== 0xFFFFFFFF;
        return (
        <>
          <p className="text-sm text-gray-400 mb-3">Review the firmware details before flashing.</p>

          <table className={styles.compareTable}>
            <thead>
              <tr>
                <th></th>
                <th>Current</th>
                <th>New</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-gray-400 !font-sans">Target</td>
                <td>{hasInstalled ? fwMagicName(device.info.installedFwMagic) : <span className="text-gray-500 italic">None</span>}</td>
                <td>{fwMagicName(firmware.metadata.magic)}</td>
              </tr>
              {firmwareCatalog && (() => {
                const currentEntry = hasInstalled
                  ? lookupFirmwareByCrc(firmwareCatalog, device.info.installedFwChecksum)
                  : null;
                const newEntry = lookupFirmwareByCrc(firmwareCatalog, firmware.metadata.payloadChecksum);
                const renderCell = (entry: ReturnType<typeof lookupFirmwareByCrc>, fallback: React.ReactNode) => {
                  if (entry) return entry.version_hex;
                  return fallback;
                };
                return (
                  <tr>
                    <td className="text-gray-400 !font-sans">Firmware</td>
                    <td>{hasInstalled
                      ? renderCell(currentEntry, <span className="text-gray-500">Unrecognized</span>)
                      : <span className="text-gray-500 italic">—</span>}</td>
                    <td>{renderCell(newEntry, <span className="text-gray-500">Unrecognized</span>)}</td>
                  </tr>
                );
              })()}
              <tr>
                <td className="text-gray-400 !font-sans">Size</td>
                <td>{hasInstalled ? `${(device.info.installedFwSize / 1024).toFixed(1)} KiB` : <span className="text-gray-500 italic">—</span>}</td>
                <td>{(firmware.metadata.payloadSize / 1024).toFixed(1)} KiB</td>
              </tr>
              <tr>
                <td className="text-gray-400 !font-sans">Checksum</td>
                <td>{hasInstalled ? `0x${device.info.installedFwChecksum.toString(16).toUpperCase()}` : <span className="text-gray-500 italic">—</span>}</td>
                <td>0x{firmware.metadata.payloadChecksum.toString(16).toUpperCase()}</td>
              </tr>
            </tbody>
          </table>

          <p className="text-xs text-gray-500 mt-3">
            Device: {device.info.unitSerial}
          </p>

          <div className={styles.buttonRow}>
            <button className={styles.cancelButton} onClick={handleClose}>Cancel</button>
            <button className={styles.primaryButton} onClick={handleFlash}>
              <FlashIcon className="w-4 h-4" />
              Flash Firmware
            </button>
          </div>
        </>
        ); })()}

      {step === "flashing" && (
        <>
          <div className={styles.statusText}>
            <SpinnerIcon className="w-4 h-4" />
            {flashStatus?.type === "erasing" && "Erasing flash..."}
            {flashStatus?.type === "programming" && `Programming... ${Math.round(flashStatus.percent)}%`}
            {flashStatus?.type === "finalizing" && "Finalizing..."}
            {flashStatus?.type === "resetting" && "Resetting device..."}
            {!flashStatus && "Preparing..."}
          </div>

          {flashStatus?.type === "programming" && (
            <div className={styles.progressBar}>
              <div className={styles.fill} style={{ width: `${flashStatus.percent}%` }} />
            </div>
          )}

          <p className="text-xs text-gray-500 mt-3">
            Do not disconnect the device during this process.
          </p>
        </>
      )}

      {step === "complete" && (
        <div className={styles.successBox}>
          <CheckCircleIcon className={styles.successIcon} />
          <p className="text-base font-medium text-gray-200 mb-1">Firmware flashed successfully!</p>
          <p className="text-sm text-gray-400">Your device will restart momentarily.</p>
          <div className={styles.buttonRow} style={{ justifyContent: "center" }}>
            <button className={styles.primaryButton} onClick={handleDone}>Done</button>
          </div>
        </div>
      )}

      {step === "error" && (
        <>
          <div className={styles.errorBox}>
            <p className="text-sm text-red-400 whitespace-pre-line">{flashError}</p>
          </div>
          <div className={styles.buttonRow}>
            <button className={styles.cancelButton} onClick={handleClose}>Close</button>
          </div>
        </>
      )}
    </Modal>
  );
}
