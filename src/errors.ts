export class FirmwareUpdaterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "FirmwareUpdaterError";
  }
}

export class DeviceNotFoundError extends FirmwareUpdaterError {
  constructor(serialNumber?: string) {
    super(
      serialNumber
        ? `No device found with serial number: ${serialNumber}`
        : "No device found",
      "DEVICE_NOT_FOUND",
    );
  }
}

export class ProtocolError extends FirmwareUpdaterError {
  constructor(message: string) {
    super(message, "PROTOCOL_ERROR");
  }
}

export class InvalidFirmwareError extends FirmwareUpdaterError {
  constructor(message: string = "Invalid firmware file") {
    super(message, "INVALID_FIRMWARE");
  }
}

export class DeviceCommunicationError extends FirmwareUpdaterError {
  constructor(message: string) {
    super(message, "COMMUNICATION_ERROR");
  }
}

export class UserCancelledError extends FirmwareUpdaterError {
  constructor() {
    super("User cancelled device selection", "USER_CANCELLED");
  }
}
