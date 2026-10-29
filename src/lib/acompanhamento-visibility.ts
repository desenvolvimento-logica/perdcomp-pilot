export function visivelNaAba(aba: string, registro: { terceiro: boolean; encerrado: boolean }): boolean {
  if (aba === "encerradas") return registro.encerrado;
  if (aba === "terceiros") return registro.terceiro;
  if (registro.terceiro) return false;
  if (aba === "ativas") return !registro.encerrado;
  return true;
}

export function correspondeAoStatus(status: string, registro: { situacao: string | null; encerrado: boolean }): boolean {
  if (status === "todas") return true;
  if (status === "concluido") return registro.encerrado;
  return registro.situacao === status;
}