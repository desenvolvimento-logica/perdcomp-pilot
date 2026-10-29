import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { lerTodasPaginas } from "./read-all";

describe("leitura completa das declarações", () => {
  it("não limita a contagem a mil quando existem 1600 registros", async () => {
    const registros = Array.from({ length: 1600 }, (_, id) => ({ id }));
    const resultado = await lerTodasPaginas(async (inicio, fim) => ({ data: registros.slice(inicio, fim + 1), error: null }));
    assert.equal(resultado.length, 1600);
    assert.equal(resultado[1599]?.id, 1599);
    assert.equal(new Set(resultado.map(r => r.id)).size, 1600);
  });
  it("não retorna um total parcial quando uma página falha", async () => {
    await assert.rejects(lerTodasPaginas(async (inicio) => inicio === 0
      ? { data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null }
      : { data: null, error: { message: "falha" } }));
  });
});