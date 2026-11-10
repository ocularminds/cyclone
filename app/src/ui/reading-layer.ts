import type { Material, Mesh, Object3D } from '@iwsdk/core';

/** Keep critical reading surfaces ahead of miniature geometry without changing hit targets or poses. */
export class ReadingLayer {
  static readonly ORDER = 1000;
  private static readonly originalOrder = new WeakMap<Object3D, number>();
  private static readonly visit = (object: Object3D): void => {
    if (!ReadingLayer.originalOrder.has(object)) ReadingLayer.originalOrder.set(object, object.renderOrder);
    object.renderOrder = ReadingLayer.ORDER + ReadingLayer.originalOrder.get(object)!;
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) {
      for (const material of mesh.material) ReadingLayer.material(material);
    } else ReadingLayer.material(mesh.material);
  };

  private static material(material: Material): void {
    material.depthTest = false;
    material.depthWrite = false;
  }

  static apply(root: Object3D): void {
    // UIKit creates/recycles its batched meshes as pages and font atlases change.
    // Apply to the actual Three.js objects, preserving their relative ordering.
    root.traverse(ReadingLayer.visit);
  }
}
