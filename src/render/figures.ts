import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from "three";

const geometry = {
  base: new CylinderGeometry(0.62, 0.72, 0.22, 18),
  body: new CylinderGeometry(0.24, 0.34, 0.85, 8),
  head: new SphereGeometry(0.22, 12, 8),
  spear: new BoxGeometry(0.05, 1.5, 0.05),
  tip: new BoxGeometry(0.12, 0.2, 0.05),
  pole: new CylinderGeometry(0.03, 0.03, 1.7, 5),
  banner: new BoxGeometry(0.62, 0.4, 0.03),
  ring: new TorusGeometry(0.9, 0.07, 8, 32),
};

const shared = {
  skin: new MeshStandardMaterial({ color: "#e3b48a", flatShading: true }),
  wood: new MeshStandardMaterial({ color: "#6b4a2b", flatShading: true }),
  metal: new MeshStandardMaterial({ color: "#c9ccd1", metalness: 0.6, roughness: 0.35 }),
  ring: new MeshStandardMaterial({ color: "#ffd54a", emissive: "#ffb800", emissiveIntensity: 0.8 }),
};

export interface ArmyFigure {
  group: Group;
  target: Vector3;
  squads: number;
  label: Sprite;
  dispose(): void;
}

function labelTexture(text: string, color: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(12, 16, 22, 0.85)";
  ctx.beginPath();
  ctx.roundRect(8, 8, 112, 48, 14);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 64, 34);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function mesh(group: Group, g: (typeof geometry)[keyof typeof geometry], m: MeshStandardMaterial, x: number, y: number, z: number): Mesh {
  const result = new Mesh(g, m);
  result.position.set(x, y, z);
  result.castShadow = true;
  group.add(result);
  return result;
}

/** A tabletop miniature: a soldier with a spear and a banner on a faction-colored base. */
export function createArmyFigure(armyId: string, color: string, squads: number): ArmyFigure {
  const group = new Group();
  const teamMaterial = new MeshStandardMaterial({ color, flatShading: true, roughness: 0.6 });
  const tunicMaterial = new MeshStandardMaterial({ color: new Color(color).multiplyScalar(0.75), flatShading: true });

  mesh(group, geometry.base, teamMaterial, 0, 0.11, 0);
  mesh(group, geometry.body, tunicMaterial, 0, 0.65, 0);
  mesh(group, geometry.head, shared.skin, 0, 1.3, 0);
  mesh(group, geometry.spear, shared.wood, 0.36, 0.95, 0.08);
  mesh(group, geometry.tip, shared.metal, 0.36, 1.78, 0.08);
  mesh(group, geometry.pole, shared.wood, -0.38, 1.05, -0.12);
  mesh(group, geometry.banner, teamMaterial, -0.08, 1.67, -0.12);

  const labelMaterial = new SpriteMaterial({ map: labelTexture(String(squads), color), depthTest: false });
  const label = new Sprite(labelMaterial);
  label.scale.set(1.3, 0.65, 1);
  label.position.set(0, 2.45, 0);
  label.renderOrder = 10;
  group.add(label);

  group.traverse((o) => (o.userData.armyId = armyId));

  return {
    group,
    target: new Vector3(),
    squads,
    label,
    dispose() {
      teamMaterial.dispose();
      tunicMaterial.dispose();
      labelMaterial.map?.dispose();
      labelMaterial.dispose();
    },
  };
}

export function updateFigureLabel(figure: ArmyFigure, squads: number, color: string): void {
  if (figure.squads === squads) return;
  figure.squads = squads;
  const material = figure.label.material;
  material.map?.dispose();
  material.map = labelTexture(String(squads), color);
  material.needsUpdate = true;
}

export function createSelectionRing(): Mesh {
  const ring = new Mesh(geometry.ring, shared.ring);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.06;
  return ring;
}
