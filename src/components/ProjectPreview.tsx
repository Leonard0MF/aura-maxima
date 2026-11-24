import Image from "next/image";

import type { Project } from "@/content/profile";
import { t } from "@/lib/i18n";

/*
 * Preview 16:10 do projeto. Com `project.image`, usa next/image (lazy);
 * sem imagem, mostra um placeholder estilizado (zero bytes de imagem).
 */
export function ProjectPreview({ project, sizes }: { project: Project; sizes: string }) {
  return (
    <div className="preview relative aspect-[16/10] overflow-hidden rounded-lg border border-line bg-bg">
      <div className="preview-inner absolute inset-x-0 top-0 -bottom-2 transition-transform duration-300 ease-out">
        {project.image ? (
          <Image src={project.image.src} alt={t(project.image.alt)} fill sizes={sizes} className="object-cover object-top" />
        ) : (
          <div aria-hidden="true" className="flex size-full flex-col">
            <div className="flex h-6 shrink-0 items-center gap-1 border-b border-line bg-surface px-2.5">
              <span className="size-1.5 rounded-full bg-line" />
              <span className="size-1.5 rounded-full bg-line" />
              <span className="size-1.5 rounded-full bg-line" />
              <span className="ml-2 h-2.5 flex-1 rounded-sm bg-line/60" />
            </div>
            <div className="relative flex flex-1 flex-col justify-end bg-[linear-gradient(var(--color-line)_1px,transparent_1px),linear-gradient(90deg,var(--color-line)_1px,transparent_1px)] bg-[size:24px_24px] p-4 sm:p-5">
              <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/70 to-bg/20" />
              <p className="relative font-mono text-[11px] text-dim">{project.id}</p>
              <p className="relative text-xl font-semibold tracking-tight text-fg sm:text-2xl">{project.title}</p>
              <p className="relative mt-1 font-mono text-[11px] text-accent/80">TODO: substituir pelo print</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
