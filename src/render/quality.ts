import type { Material, Mesh, Scene, WebGLRenderer } from "three";
import type { GraphicsQuality } from "../game/settings";

/** High: sharp and shadowed. Low: no shadows and native-size pixels, for weaker GPUs. */
export function applyQuality(renderer: WebGLRenderer, scene: Scene, quality: GraphicsQuality): void {
  renderer.setPixelRatio(quality === "high" ? Math.min(window.devicePixelRatio, 2) : 1);
  const shadows = quality === "high";
  if (renderer.shadowMap.enabled === shadows) return;
  renderer.shadowMap.enabled = shadows;
  // Materials compile shadow support in, so they must be rebuilt after the switch.
  scene.traverse((o) => {
    const material = (o as Mesh).material as Material | Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => (m.needsUpdate = true));
    else if (material) material.needsUpdate = true;
  });
}
