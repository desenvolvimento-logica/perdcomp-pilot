import { describe, it as test } from "node:test";
import { strict as assert } from "node:assert";
import { permiteAcessoTemporario } from "./preview-access";

describe("acesso temporário sem Luz.IA", () => {
  test("libera a prévia durante os ajustes", () => {
    assert.equal(permiteAcessoTemporario(true), true);
  });
  test("não libera o acesso temporário na publicação", () => {
    assert.equal(permiteAcessoTemporario(false), false);
  });
});