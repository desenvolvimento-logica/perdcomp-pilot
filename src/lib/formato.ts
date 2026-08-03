export function moeda(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function dataHora(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function dataCurta(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? `${v}T12:00:00` : v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export function documento(v: string | null | undefined): string {
  if (!v) return "—";
  const d = v.replace(/\D/g, "");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return v;
}

export function emAnalise(situacao: string | null | undefined): boolean {
  const s = (situacao ?? "").toLowerCase();
  return s.includes("análise") || s.includes("analise");
}

export function tomSituacao(situacao: string | null | undefined): string {
  const s = (situacao ?? "").toLowerCase();
  if (s.includes("defer") && !s.includes("indefer")) return "bg-success/12 text-success border-success/30";
  if (s.includes("indefer") || s.includes("cancel")) return "bg-destructive/10 text-destructive border-destructive/30";
  if (s.includes("pendênc") || s.includes("pendenc") || s.includes("diligênc") || s.includes("diligenc"))
    return "bg-warning/18 text-warning-foreground border-warning/40";
  if (s.includes("análise") || s.includes("analise")) return "bg-info/10 text-info border-info/30";
  return "bg-muted text-muted-foreground border-border";
}

export function diasRestantes(prazo: string | null | undefined): number | null {
  if (!prazo) return null;
  const d = new Date(prazo.length === 10 ? `${prazo}T12:00:00` : prazo);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

/** Baixa no navegador um PDF devolvido em base64 pelo servidor. */
export function abrirPdf(base64: string, nome: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome.toLowerCase().endsWith(".pdf") ? nome : `${nome}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
