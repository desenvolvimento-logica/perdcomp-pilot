import { describe, expect, test } from "bun:test";
import { permiteAcessoTemporario } from "./preview-access";

describe("acesso temporário sem Luz.IA", () => {
  test("libera a prévia durante os ajustes", () => {
    expect(permiteAcessoTemporario(true)).toBe(true);
  });
  test("não libera o acesso temporário na publicação", () => {
    expect(permiteAcessoTemporario(false)).toBe(false);
  });
});