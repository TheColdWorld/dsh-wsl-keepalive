/**
 * Implicit-target state machine. The distro name is the unique key; the map
 * records which distros currently have an implicit keep-alive (desired or
 * observed). Explicit targets are handled by the service and never enter this
 * map, so an implicit transition cannot stop an explicitly configured target.
 * @module dsh-wsl-keepalive/core/implicit
 */

const keepAlive = new Map<string, boolean>()

export interface ImplicitChange {
  /** Implicit distro that must be stopped, or null. */
  stop: string | null
  /** Implicit distro that must be started, or null. */
  start: string | null
  /** New implicit distro after this transition. */
  next: string | null
}

/**
 * Reconcile the implicit target when the switch or the default distro changes.
 * @param previous previous implicit distro; null when there was none.
 * @param current new implicit distro; null to disable the implicit target.
 * @returns the stop/start action and the new current value.
 */
export function changeImplicitPlan(
  previous: string | null,
  current: string | null,
): ImplicitChange {
  const stop = previous !== null
    && previous !== current
    && keepAlive.get(previous) === true
    ? previous
    : null

  const start = current !== null && keepAlive.get(current) !== true
    ? current
    : null

  return { stop, start, next: current }
}

/** Update one implicit distro after a successful start or stop. */
export function markKeepAlive(name: string, alive: boolean): void {
  keepAlive.set(name, alive)
}

/** Read-only view for diagnostics and tests. */
export function implicitState(): ReadonlyMap<string, boolean> {
  return keepAlive
}

/** Clear the map, e.g. on dispose or in tests. */
export function resetKeepAlive(): void {
  keepAlive.clear()
}
