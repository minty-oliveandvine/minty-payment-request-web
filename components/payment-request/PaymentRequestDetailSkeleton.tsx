/** Lightweight static placeholder while the detail UI chunk loads (no client JS). */
export function PaymentRequestDetailSkeleton() {
  return (
    <div
      className="mx-auto w-full min-w-0 max-w-[1440px] animate-pulse px-4 py-4 sm:px-6 lg:px-8"
      aria-hidden
    >
      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2 lg:grid-rows-[auto_minmax(12rem,1fr)] lg:gap-x-6 lg:gap-y-4">
        <div className="h-10 rounded-lg bg-surface-sunk lg:col-start-1 lg:row-start-1" />
        <div className="h-10 rounded-lg bg-surface-sunk lg:col-start-2 lg:row-start-1" />
        <div className="min-h-[min(45dvh,22rem)] rounded-lg bg-surface-sunk sm:min-h-[min(55dvh,30rem)] lg:col-start-1 lg:row-start-2 lg:min-h-[min(70vh,40rem)]" />
        <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-2">
          <div className="min-h-[16rem] rounded-lg bg-surface-sunk" />
          <div className="h-12 w-full rounded-md bg-surface-sunk sm:w-[199px]" />
          <div className="h-40 rounded-lg bg-surface-sunk" />
          <div className="h-40 rounded-lg bg-surface-sunk" />
        </div>
      </div>
    </div>
  );
}
