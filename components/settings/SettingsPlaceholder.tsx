type SettingsPlaceholderProps = {
  title: string;
};

export function SettingsPlaceholder({ title }: SettingsPlaceholderProps) {
  return (
    <div className="w-full pb-8 pt-4">
      <div className="rounded-lg border border-gray-200 bg-white px-5 py-10 text-center shadow-sm">
        <p className="text-base font-semibold text-black">{title}</p>
        <p className="mt-2 text-sm text-primary/65">
          This section is not available in the app yet.
        </p>
      </div>
    </div>
  );
}
