import { useState, useEffect, useRef } from "react";
import {
  enableDebug,
  disableDebug,
  isDebugEnabled,
  onDebug,
  getDebugLog,
  clearDebugLog,
  watchInputReports,
} from "@lib/index.js";
import type { DebugEntry } from "@lib/index.js";

function formatData(data: unknown): string {
  if (data === undefined) return "";
  try {
    if (data instanceof Error) return `${data.name}: ${data.message}`;
    if (typeof data === "object") return JSON.stringify(data, null, 2);
    return String(data);
  } catch {
    return String(data);
  }
}

const STORAGE_KEY = "fwu-debug";

function loadPersistedDebug(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

// Enable debug immediately on load if persisted, so early log entries
// (like device discovery on mount) are captured.
if (loadPersistedDebug()) {
  enableDebug();
}

export function DebugPanel() {
  const [active, setActive] = useState(isDebugEnabled);
  const [entries, setEntries] = useState<DebugEntry[]>([...getDebugLog()]);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    enableDebug();
    setEntries([...getDebugLog()]);
    const unsub = onDebug(() => {
      setEntries([...getDebugLog()]);
    });
    return () => {
      unsub();
    };
  }, [active]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  const toggle = () => {
    if (active) {
      disableDebug();
      localStorage.removeItem(STORAGE_KEY);
      setActive(false);
    } else {
      enableDebug();
      localStorage.setItem(STORAGE_KEY, "1");
      setActive(true);
    }
  };

  const handleClear = () => {
    clearDebugLog();
    setEntries([]);
  };

  const [watching, setWatching] = useState(false);
  const stopWatchRef = useRef<(() => void) | null>(null);

  const toggleWatch = async () => {
    if (watching) {
      stopWatchRef.current?.();
      stopWatchRef.current = null;
      setWatching(false);
    } else {
      const stop = await watchInputReports();
      stopWatchRef.current = stop;
      setWatching(true);
    }
  };

  // Clean up watcher on unmount
  useEffect(() => {
    return () => { stopWatchRef.current?.(); };
  }, []);

  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    const text = entries
      .map((e) => {
        const dataStr = e.data !== undefined ? `\n  ${formatData(e.data)}` : "";
        return `${(e.timestamp / 1000).toFixed(3)}s ${e.message}${dataStr}`;
      })
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="border-t border-gray-800">
      <div className="px-6 py-2 flex items-center gap-3">
        <button
          onClick={toggle}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            active
              ? "bg-yellow-700 text-yellow-100"
              : "bg-gray-800 text-gray-400 hover:text-gray-200"
          }`}
        >
          {active ? "Debug ON" : "Debug OFF"}
        </button>
        {active && (
          <button
            onClick={handleClear}
            className="px-3 py-1 rounded text-xs bg-gray-800 text-gray-400 hover:text-gray-200"
          >
            Clear
          </button>
        )}
        {active && (
          <button
            onClick={toggleWatch}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              watching
                ? "bg-green-700 text-green-100"
                : "bg-gray-800 text-gray-400 hover:text-gray-200"
            }`}
          >
            {watching ? "Watching Reports" : "Watch Reports"}
          </button>
        )}
        {active && entries.length > 0 && (
          <button
            onClick={handleCopy}
            className="px-3 py-1 rounded text-xs bg-gray-800 text-gray-400 hover:text-gray-200"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        )}
        {active && (
          <span className="text-xs text-gray-500">{entries.length} entries</span>
        )}
      </div>
      {active && (
        <div className="px-6 pb-4 max-h-80 overflow-y-auto font-mono text-xs">
          {entries.length === 0 ? (
            <p className="text-gray-600">
              Debug logging active. Connect a device to see output.
            </p>
          ) : (
            entries.map((entry, i) => (
              <div key={i} className="py-0.5 border-b border-gray-900">
                <span className="text-gray-600 mr-2">
                  {(entry.timestamp / 1000).toFixed(3)}s
                </span>
                <span className="text-gray-300">{entry.message}</span>
                {entry.data !== undefined && (
                  <pre className="text-gray-500 ml-6 whitespace-pre-wrap">
                    {formatData(entry.data)}
                  </pre>
                )}
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}
