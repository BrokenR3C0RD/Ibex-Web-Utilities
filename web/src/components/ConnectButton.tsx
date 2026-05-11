interface ConnectButtonProps {
  onClick: () => void;
  loading: boolean;
}

export function ConnectButton({ onClick, loading }: ConnectButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Connecting...
        </span>
      ) : (
        "Connect Device"
      )}
    </button>
  );
}
