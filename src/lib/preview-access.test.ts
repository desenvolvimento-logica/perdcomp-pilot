import { describe, it as test } from "node:test";
import { strict as assert } from "node:assert";
import { permiteAcessoTemporario } from "./preview-access";

describe("acesso temporário sem Luz.IA", () => {
  test("exige Luz.IA também na prévia após os ajustes", () => {
    assert.equal(permiteAcessoTemporario(true), false);
  });
  test("não libera o acesso temporário na publicação", () => {
    assert.equal(permiteAcessoTemporario(false), false);
  });
});