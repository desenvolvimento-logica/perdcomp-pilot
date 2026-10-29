export async function lerTodasPaginas<T>(
  buscar: (inicio: number, fim: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const tamanho = 500;
  const linhas: T[] = [];
  for (let inicio = 0; ; inicio += tamanho) {
    const { data, error } = await buscar(inicio, inicio + tamanho - 1);
    if (error) throw new Error(`Não foi possível carregar os registros: ${error.message}`);
    const pagina = data ?? [];
    linhas.push(...pagina);
    if (pagina.length < tamanho) return linhas;
  }
}