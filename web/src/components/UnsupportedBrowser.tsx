import { WarningIcon } from "./Icons";

export function UnsupportedBrowser() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-surface">
      <div className="max-w-lg w-full bg-surface-raised border border-border-subtle rounded-xl p-6 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
          <WarningIcon className="w-6 h-6 text-amber-400" />
        </div>
        <h1 className="text-lg font-semibold text-gray-100 mb-2">
          This browser isn't supported
        </h1>
        <p className="text-sm text-gray-400 mb-4">
          This tool relies on WebHID and Web Serial, which currently only
          ship enabled in Chromium-based desktop browsers — including
          Chrome, Edge, Opera, Brave, and Vivaldi. Safari, Firefox, and
          mobile browsers don't support them.
        </p>
        <p className="text-xs text-gray-500">
          Open this page in one of the supported browsers on a desktop or
          laptop to continue.
        </p>
      </div>
    </div>
  );
}

export const browserSupportsWebApis =
  typeof navigator !== "undefined" && "hid" in navigator && "serial" in navigator;
