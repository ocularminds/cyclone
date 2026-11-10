import { Vector3, type Object3D } from '@iwsdk/core';

/** Reposition a reading surface only after seated translation makes it inaccessible. */
export class PanelReach {
  private readonly openedAt = new Vector3();
  private readonly corner = new Vector3();
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  placed(head: Vector3): void { this.openedAt.copy(head); }
  outside(panel: Object3D, head: Vector3, forward: Vector3, width: number, height: number): boolean {
    const moved = this.openedAt.distanceToSquared(head) > 0.0004;
    this.up.set(0, 1, 0); this.right.crossVectors(forward, this.up).normalize(); this.up.crossVectors(this.right, forward).normalize();
    for (const x of [-1, 1]) for (const y of [-1, 1]) {
      this.corner.set(x * width / 2, y * height / 2, 0).applyQuaternion(panel.quaternion).add(panel.position).sub(head);
      const depth = this.corner.dot(forward);
      if (this.corner.length() > 0.61 || moved && (depth <= 0 || Math.abs(Math.atan2(this.corner.dot(this.right), depth)) > 20 * Math.PI / 180 || Math.abs(Math.atan2(this.corner.dot(this.up), depth)) > 15 * Math.PI / 180)) return true;
    }
    return false;
  }
}
