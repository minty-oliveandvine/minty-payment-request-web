type SettingsPlaceholderProps = {
  title: string;
};

export function SettingsPlaceholder({ title }: SettingsPlaceholderProps) {
  return (
    <div className="w-full pb-8 pt-4">
      <div className="rounded-lg border border-border-default bg-surface-card px-5 py-10 text-center">
        <p className="text-base font-semibold text-text-primary">{title}</p>
        <p className="mt-2 text-sm text-text-muted">This section is not available in the app yet.</p>
      </div>
    </div>
  );
}
