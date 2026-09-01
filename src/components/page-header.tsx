export function PageHeader({
  title,
  lead,
  right,
}: {
  title: string;
  lead?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-[26px] flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <h1 className="font-display text-[28px] leading-tight font-bold tracking-[var(--tracking-tight)] text-ink-900">
          {title}
        </h1>
        {lead && <p className="mt-[7px] text-[14.5px] leading-normal text-ink-500">{lead}</p>}
      </div>
      {right}
    </div>
  );
}
