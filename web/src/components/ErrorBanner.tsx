interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div className="mx-6 mt-4 px-4 py-3 bg-red-900/50 border border-red-700 rounded-lg flex items-center justify-between">
      <span className="text-red-200 text-sm">{message}</span>
      <button
        onClick={onDismiss}
        className="text-red-400 hover:text-red-200 ml-4 text-lg leading-none"
      >
        &times;
      </button>
    </div>
  );
}
