import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { visivelNaAba } from "./acompanhamento-visibility";

describe("PERDCOMP de terceiros com acompanhamento encerrado", () => {
  const encerradoTerceiro = { terceiro: true, encerrado: true };
  it("aparece entre os encerrados", () => {
    assert.equal(visivelNaAba("encerradas", encerradoTerceiro), true);
  });
  it("permanece disponível na aba de terceiros", () => {
    assert.equal(visivelNaAba("terceiros", encerradoTerceiro), true);
  });
  it("não retorna ao acompanhamento ativo", () => {
    assert.equal(visivelNaAba("ativas", encerradoTerceiro), false);
  });
  it("não considera terceiro aberto como encerrado", () => {
    assert.equal(visivelNaAba("encerradas", { terceiro: true, encerrado: false }), false);
  });
});