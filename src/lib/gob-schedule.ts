export function proximaSincronizacaoDiaria(agora: number): number {
  // São Paulo is UTC-3: midnight is 03:00 UTC.
  const data = new Date(agora);
  const proxima = Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate(), 3);
  return proxima > agora ? proxima : proxima + 86400000;
}

export function diaSincronizacao(agora: number): string {
  return new Date(agora - 3 * 3600000).toISOString().slice(0, 10);
}