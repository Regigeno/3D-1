export type Rapier = typeof import("@dimforge/rapier3d-deterministic-compat").default;

let loading: Promise<Rapier> | null = null;

/**
 * Loads the Rapier physics engine (deterministic build, WebAssembly inlined).
 * It is a separate chunk of a few megabytes, so the menu shows before it arrives.
 */
export function loadRapier(): Promise<Rapier> {
  loading ??= import("@dimforge/rapier3d-deterministic-compat").then(async (module) => {
    const rapier = module.default;
    await rapier.init();
    return rapier;
  });
  return loading;
}
