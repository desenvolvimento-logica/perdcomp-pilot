import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { proximaSincronizacaoDiaria, diaSincronizacao } from "./gob-schedule";

describe("sincronização diária GOB", () => {
  it("agenda às 00:00 de São Paulo", () => {
    assert.equal(proximaSincronizacaoDiaria(Date.parse("2026-10-29T11:41:00Z")), Date.parse("2026-10-30T03:00:00Z"));
  });
  it("avança exatamente um dia depois da meia-noite", () => {
    const meiaNoite = Date.parse("2026-10-30T03:00:00Z");
    assert.equal(proximaSincronizacaoDiaria(meiaNoite), meiaNoite + 86400000);
  });
  it("usa um único dia para todas as chamadas automáticas da mesma data local", () => {
    assert.equal(diaSincronizacao(Date.parse("2026-10-30T03:00:00Z")), "2026-10-30");
    assert.equal(diaSincronizacao(Date.parse("2026-10-31T02:59:59Z")), "2026-10-30");
  });
});