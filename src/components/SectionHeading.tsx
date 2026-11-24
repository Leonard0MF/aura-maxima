import { Dual } from "./Dual";

export function SectionHeading({
  id,
  index,
  command,
  title,
  lead,
}: {
  id: string;
  index: string;
  command: string;
  title: string;
  lead?: string;
}) {
  return (
    <div className="mb-10 max-w-2xl">
      <p className="mb-3 font-mono text-xs text-dim">
        <Dual term={<><span className="text-accent">$</span> {command}</>} clean={index} />
      </p>
      <h2 id={id} className="scroll-mt-24 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
        {title}
      </h2>
      {lead ? <p className="mt-3 text-muted">{lead}</p> : null}
    </div>
  );
}
