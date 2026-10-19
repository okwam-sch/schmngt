import { Link } from "@tanstack/react-router";
import { Construction, CheckCircle2 } from "lucide-react";
import { getModule } from "@/lib/access";
import { getConfigDomain, type ConfigDomainId } from "@/lib/config-domains";
import { Badge } from "@/components/ui/badge";

export function ConfigDomainPlaceholder({ domainId }: { domainId: ConfigDomainId }) {
  const domain = getConfigDomain(domainId);
  if (!domain) return null;
  const governed = domain.governs === "*" ? [] : domain.governs.map((id) => getModule(id)).filter(Boolean);

  return (
    <div className="space-y-6">
      <section className="surface p-6">
        <div className="flex items-start gap-3">
          <Construction className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
          <div>
            <h2 className="font-semibold">Stage {domain.stage} — being moved here</h2>
            <p className="mt-1 text-sm text-muted-foreground">{domain.responsibility}</p>
          </div>
        </div>
      </section>

      <section className="surface p-6">
        <h2 className="mb-3 font-semibold">Modules governed</h2>
        <div className="flex flex-wrap gap-2">
          {governed.map((m) => (
            <Link key={m!.id} to="/portal/$moduleId" params={{ moduleId: m!.id }}>
              <Badge variant="secondary">{m!.name}</Badge>
            </Link>
          ))}
        </div>
      </section>

      <section className="surface p-6">
        <h2 className="mb-3 font-semibold">Settings in this domain</h2>
        <ul className="divide-y divide-border">
          {domain.sections.map((s) => {
            const home = s.liveIn ? getConfigDomain(s.liveIn) : undefined;
            return (
              <li key={s.title} className="flex items-start justify-between gap-4 py-3">
                <div>
                  <p className="font-medium">{s.title}</p>
                  <p className="text-sm text-muted-foreground">{s.summary}</p>
                </div>
                {home ? (
                  <Link to="/portal/$moduleId" params={{ moduleId: home.id }} className="shrink-0">
                    <Badge className="gap-1"><CheckCircle2 className="size-3" aria-hidden />Currently in {home.name}</Badge>
                  </Link>
                ) : (
                  <Badge variant="outline" className="shrink-0">Planned</Badge>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
