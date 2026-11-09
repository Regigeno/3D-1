import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Timer,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from "three";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { isAllied, visibleProvinces, type GameState, type Scenario } from "../engine";
import type { MoveKind, Selection } from "../game/session";
import { buildBoard, type Board } from "./board";
import { createArmyFigure, createSelectionRing, updateFigureLabel, type ArmyFigure } from "./figures";
import { HIGHLIGHT, OCEAN_COLOR, SKY_COLOR, provinceTopColor } from "./palette";

export interface MapViewModel {
  state: GameState;
  viewer: string;
  selection: Selection;
  targets: Map<string, MoveKind>;
}

export interface MapViewCallbacks {
  onProvinceClick(province: string): void;
  onArmyClick(armyId: string): void;
  onEmptyClick(): void;
  onHover(province: string | null, clientX: number, clientY: number): void;
}

const CLICK_SLOP_PX = 6;
const ARMY_SPREAD = 1.7;
const OUTLINE_COLOR: Record<MoveKind | "selected", string> = {
  selected: "#ffffff",
  move: "#7dffa8",
  capture: "#ffd27a",
  attack: "#ff6b5e",
};

export class MapView {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private controls: MapControls;
  private raycaster = new Raycaster();
  private pointer = new Vector2();
  private timer = new Timer();
  private board: Board | null = null;
  private scenarioId: string | null = null;
  private figures = new Map<string, ArmyFigure>();
  private selectionRing = createSelectionRing();
  private hovered: string | null = null;
  private model: MapViewModel | null = null;
  private frame = 0;
  private downAt: { x: number; y: number } | null = null;
  private resizeObserver: ResizeObserver;

  constructor(
    private container: HTMLElement,
    private callbacks: MapViewCallbacks,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.outputColorSpace = SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new Color(SKY_COLOR);
    this.scene.fog = new Fog(SKY_COLOR, 120, 260);

    this.camera = new PerspectiveCamera(42, 1, 0.5, 600);
    this.camera.position.set(0, 72, 58);

    this.controls = new MapControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 14;
    this.controls.maxDistance = 140;
    this.controls.minPolarAngle = 0.15;
    this.controls.maxPolarAngle = 1.15;

    this.scene.add(new HemisphereLight("#dbe9ff", "#3a4a2a", 1.1));
    const sun = new DirectionalLight("#fff4e0", 2.2);
    sun.position.set(-40, 80, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 60, bottom: -60, near: 1, far: 250 });
    this.scene.add(sun);

    const ocean = new Mesh(new PlaneGeometry(900, 900), new MeshStandardMaterial({ color: OCEAN_COLOR, roughness: 0.35, metalness: 0.1 }));
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = 0.2;
    ocean.receiveShadow = true;
    this.scene.add(ocean);

    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("pointerup", this.onPointerUp);
    el.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("pointerleave", this.onPointerLeave);
    el.addEventListener("contextmenu", this.onContextMenu);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.loop();
  }

  update(model: MapViewModel): void {
    this.model = model;
    if (this.ensureBoard(model.state.scenario)) {
      const capital = model.state.factions[model.viewer]?.capital;
      if (capital) this.focusProvince(capital);
    }
    this.syncProvinces();
    this.syncArmies();
  }

  /** Centers the camera on a province without changing zoom or angle. */
  focusProvince(province: string): void {
    const visual = this.board?.provinces.get(province);
    if (!visual) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.controls.target.copy(visual.center).setY(0);
    this.camera.position.copy(this.controls.target).add(offset);
  }

  /** Where a province's center appears on screen, in client pixels. */
  screenPosition(province: string): { x: number; y: number } | null {
    const visual = this.board?.provinces.get(province);
    if (!visual) return null;
    const p = visual.center.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onPointerDown);
    el.removeEventListener("pointerup", this.onPointerUp);
    el.removeEventListener("pointermove", this.onPointerMove);
    el.removeEventListener("pointerleave", this.onPointerLeave);
    el.removeEventListener("contextmenu", this.onContextMenu);
    this.controls.dispose();
    this.timer.dispose();
    for (const f of this.figures.values()) f.dispose();
    this.disposeBoard();
    this.renderer.dispose();
    el.remove();
  }

  /** Returns true when a new board was built. */
  private ensureBoard(scenario: Scenario): boolean {
    if (this.scenarioId === scenario.id && this.board) return false;
    this.disposeBoard();
    this.board = buildBoard(scenario);
    this.scenarioId = scenario.id;
    this.scene.add(this.board.group);
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(0, this.board.height * 0.8, this.board.height * 0.65);
    return true;
  }

  private disposeBoard(): void {
    if (!this.board) return;
    this.scene.remove(this.board.group);
    const seen = new Set<unknown>();
    this.board.group.traverse((o) => {
      const m = o as Mesh;
      if (m.geometry && !seen.has(m.geometry)) {
        seen.add(m.geometry);
        m.geometry.dispose();
      }
    });
    for (const v of this.board.provinces.values()) {
      v.topMaterial.dispose();
      v.outlineMaterial.dispose();
      v.capitalFlag?.dispose();
    }
    this.board = null;
  }

  private syncProvinces(): void {
    const model = this.model;
    const board = this.board;
    if (!model || !board) return;
    const { state, viewer, selection, targets } = model;
    const visible = visibleProvinces(state, viewer);

    for (const [id, v] of board.provinces) {
      const owner = state.provinces[id]?.owner ?? null;
      const ownerColor = owner ? state.factions[owner]?.color ?? null : null;
      v.topMaterial.color.copy(provinceTopColor(v.terrain, ownerColor, !visible.has(id)));

      const target = targets.get(id);
      const emissive = target ? HIGHLIGHT[target] : id === selection.province ? HIGHLIGHT.selected : id === this.hovered ? HIGHLIGHT.hover : HIGHLIGHT.none;
      v.topMaterial.emissive.copy(emissive);
      if (target && id === this.hovered) v.topMaterial.emissive.multiplyScalar(1.6);

      v.outline.visible = id === selection.province || target !== undefined;
      v.outlineMaterial.color.set(OUTLINE_COLOR[target ?? "selected"]);

      if (v.capitalFlag) v.capitalFlag.color.set(ownerColor ?? "#cccccc");
    }
  }

  private syncArmies(): void {
    const model = this.model;
    const board = this.board;
    if (!model || !board) return;
    const { state, viewer, selection } = model;
    const visible = visibleProvinces(state, viewer);

    const byProvince = new Map<string, string[]>();
    for (const army of Object.values(state.armies)) {
      const list = byProvince.get(army.location) ?? [];
      list.push(army.id);
      byProvince.set(army.location, list);
    }

    for (const [id, figure] of this.figures) {
      if (!state.armies[id]) {
        this.scene.remove(figure.group);
        figure.dispose();
        this.figures.delete(id);
      }
    }

    for (const army of Object.values(state.armies)) {
      const color = state.factions[army.owner]?.color ?? "#ffffff";
      const province = board.provinces.get(army.location);
      if (!province) continue;

      let figure = this.figures.get(army.id);
      const isNew = !figure;
      if (!figure) {
        figure = createArmyFigure(army.id, color, army.squads.length);
        this.figures.set(army.id, figure);
        this.scene.add(figure.group);
      }
      updateFigureLabel(figure, army.squads.length, color);

      const siblings = byProvince.get(army.location) ?? [army.id];
      const index = siblings.indexOf(army.id);
      const offset = new Vector3();
      if (siblings.length > 1) {
        const angle = (index / siblings.length) * Math.PI * 2;
        offset.set(Math.cos(angle) * ARMY_SPREAD, 0, Math.sin(angle) * ARMY_SPREAD);
      }
      figure.target.copy(province.center).add(offset);
      if (isNew) figure.group.position.copy(figure.target);
      const scale = 1.4 + Math.min(army.squads.length, 15) * 0.04;
      figure.group.scale.setScalar(scale);

      const friendly = isAllied(state, viewer, army.owner);
      figure.group.visible = friendly || visible.has(army.location);
    }

    const selected = selection.army ? this.figures.get(selection.army) : undefined;
    if (selected) {
      selected.group.add(this.selectionRing);
    } else {
      this.selectionRing.removeFromParent();
    }
  }

  private loop = (timestamp?: number): void => {
    this.frame = requestAnimationFrame(this.loop);
    this.timer.update(timestamp);
    const dt = Math.min(this.timer.getDelta(), 0.1);
    const t = this.timer.getElapsed();

    this.controls.update();
    if (this.board) {
      const halfW = this.board.width / 2;
      const halfH = this.board.height / 2;
      const target = this.controls.target;
      const clamped = new Vector3(Math.max(-halfW, Math.min(halfW, target.x)), 0, Math.max(-halfH, Math.min(halfH, target.z)));
      if (!clamped.equals(target)) {
        this.camera.position.add(clamped.clone().sub(target));
        target.copy(clamped);
      }
    }

    const k = 1 - Math.exp(-dt * 7);
    for (const figure of this.figures.values()) {
      const p = figure.group.position;
      const distance = p.distanceTo(figure.target);
      p.lerp(figure.target, k);
      // A small hop while travelling reads as "marching" on the tabletop.
      p.y = figure.target.y + Math.min(distance, 4) * 0.25;
    }
    const pulse = 1 + Math.sin(t * 4) * 0.08;
    this.selectionRing.scale.set(pulse, pulse, pulse);

    this.renderer.render(this.scene, this.camera);
  };

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private pick(clientX: number, clientY: number): { army: string | null; province: string | null } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const figures: Object3D[] = [...this.figures.values()].filter((f) => f.group.visible).map((f) => f.group);
    const armyHit = this.raycaster.intersectObjects(figures, true).find((h) => h.object.userData.armyId);
    const provinceHit = this.board ? this.raycaster.intersectObjects(this.board.pickables, false)[0] : undefined;
    return {
      army: (armyHit?.object.userData.armyId as string | undefined) ?? null,
      province: (provinceHit?.object.userData.provinceId as string | undefined) ?? null,
    };
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button === 0) this.downAt = { x: e.clientX, y: e.clientY };
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.button !== 0 || !this.downAt) return;
    const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
    this.downAt = null;
    if (moved > CLICK_SLOP_PX) return;

    const { army, province } = this.pick(e.clientX, e.clientY);
    const clickedArmy = army ? this.model?.state.armies[army] : undefined;
    // Clicking an enemy figure in a province you can attack means "attack", not "select that enemy".
    const attackingFigure =
      clickedArmy !== undefined &&
      clickedArmy.owner !== this.model?.state.activeFaction &&
      this.model?.targets.has(clickedArmy.location) === true;

    if (clickedArmy && !attackingFigure) this.callbacks.onArmyClick(clickedArmy.id);
    else if (attackingFigure) this.callbacks.onProvinceClick(clickedArmy.location);
    else if (province) this.callbacks.onProvinceClick(province);
    else this.callbacks.onEmptyClick();
  };

  private onPointerMove = (e: PointerEvent): void => {
    const { province } = this.pick(e.clientX, e.clientY);
    if (province !== this.hovered) {
      this.hovered = province;
      this.syncProvinces();
    }
    this.callbacks.onHover(province, e.clientX, e.clientY);
  };

  private onPointerLeave = (): void => {
    this.hovered = null;
    this.syncProvinces();
    this.callbacks.onHover(null, 0, 0);
  };

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };
}
