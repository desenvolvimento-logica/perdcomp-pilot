// The temporary entry must never be enabled in a published build.
export function permiteAcessoTemporario(development: boolean): boolean {
  return development === true;
}