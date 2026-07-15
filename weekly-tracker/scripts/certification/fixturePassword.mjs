export const DEFAULT_LOCAL_FIXTURE_PASSWORD = 'Cert-Test-Pass-1!';

export function getLocalFixturePassword(env = process.env) {
  const explicit = env.LOCAL_FIXTURE_PASSWORD?.trim();
  return explicit || DEFAULT_LOCAL_FIXTURE_PASSWORD;
}
