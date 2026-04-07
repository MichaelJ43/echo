/** OS keychain storage key; must match `secrets.rs` `compose_storage_key`. */
export function composeSecretStorageKey(
  environmentId: string,
  logicalName: string
): string {
  return `echo_${environmentId}_${logicalName}`;
}
