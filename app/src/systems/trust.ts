import { createSystem, Grabbed, OneHandGrabbable, Vector3, type Entity, type Group, type Mesh } from '@iwsdk/core';
import type { Cyclone } from '../app';
import { AgentTag, RuleTag } from '../components';
import type { RuleTemplate } from '../contracts/scenario';
import { Furniture } from '../models/desk';
import { Layout } from '../models/layout';
import { Tokens } from '../models/token';
import type { Stage } from '../stage';
import { Label } from '../ui/label';

type RuleView = { rule: RuleTemplate; entity: Entity; root: Group; label: Label; home: Vector3; absorbed: number };

/**
 * TrustSystem (C17): each agent's ring fills as its proposals pass without
 * amendment. At the threshold a rule tablet appears; grab it and drop it on
 * the agent to accept. Matching intents then auto-execute and auto-seal — the
 * desk gets quieter.
 */
export class TrustSystem extends createSystem({
  grabbedRules: { required: [RuleTag, Grabbed] },
}) {
  private app!: Cyclone;
  private stage!: Stage;
  private readonly rings = new Map<string, { ring: Mesh; root: Group; fill: number; shown: number }>();
  private readonly rules: RuleView[] = [];
  private readonly v = new Vector3();

  init(): void {
    this.app = this.globals.cyclone as Cyclone;
    this.stage = this.globals.stage as Stage;
    this.app.cast.agents.forEach((spec, i) => {
      const { root, ring } = Furniture.agent(spec, i);
      const e = this.world.createTransformEntity(root, { parent: this.stage.rootEntity!, persistent: true });
      e.addComponent(AgentTag, { agentId: spec.id });
      const fill = this.app.trust.ring(spec.id);
      Furniture.setRing(ring, fill);
      this.rings.set(spec.id, { ring, root, fill, shown: fill });
      const name = new Label(0.07, 0.014);
      name.draw([{ text: spec.label, size: 0.0085, weight: 600 }], { align: 'center', padding: 0.002 });
      name.mesh.position.set(0, 0.042, 0);
      root.add(name.mesh);
    });
    for (const rule of this.app.trust.pending()) this.offer(rule);
    const refresh = () => {
      for (const [id, r] of this.rings) r.fill = this.app.trust.ring(id);
    };
    this.cleanupFuncs.push(
      this.app.shift.events.on('sealed', refresh),
      this.app.shift.events.on('escalated', refresh),
      this.app.shift.events.on('offer', ({ rule }) => this.offer(rule)),
      this.queries.grabbedRules.subscribe('disqualify', (e) => this.drop(e)),
    );
  }

  private offer(rule: RuleTemplate): void {
    if (this.rules.some((r) => r.rule.id === rule.id)) return;
    const root = Tokens.ruleTablet();
    const entity = this.world.createTransformEntity(root, { parent: this.stage.rootEntity! });
    entity.addComponent(RuleTag, { ruleId: rule.id });
    entity.addComponent(OneHandGrabbable, { rotate: false, translate: true });
    const label = new Label(0.12, 0.03);
    const agent = this.app.cast.agents.find((a) => a.id === rule.agent_id);
    label.draw(
      [
        { text: rule.label, size: 0.0085, weight: 700 },
        { text: `Drop on ${agent?.label ?? 'the agent'} to accept`, size: 0.007, color: '#5d6b78' },
      ],
      { background: '#f6efe2', border: '#4a8fe0', padding: 0.004, radius: 0.005, align: 'center' },
    );
    label.mesh.position.set(0, 0.03, 0);
    root.add(label.mesh);
    const home = new Vector3(...Layout.RULE).add(new Vector3(this.rules.length * 0.04, 0, 0));
    root.position.copy(home).setY(home.y + 0.15);
    this.rules.push({ rule, entity, root, label, home, absorbed: 0 });
    this.app.cue('rule', `${agent?.label ?? 'Agent'} earned a rule offer: ${rule.label}`, [home.x, home.y, home.z]);
  }

  private drop(e: Entity): void {
    const view = this.rules.find((r) => r.entity === e);
    if (!view) return;
    view.root.getWorldPosition(this.v);
    this.stage.toDesk(this.v);
    for (const [agentId, r] of this.rings) {
      if (this.v.distanceTo(r.root.position) > Layout.AGENT_RADIUS * 1.6) continue;
      if (this.app.shift.acceptRule(view.rule.id, agentId)) {
        view.absorbed = 0.0001;
        this.app.cue('rule', `Rule accepted: ${view.rule.label}. Matching intents now auto-execute and auto-seal.`, [r.root.position.x, r.root.position.y, r.root.position.z]);
      } else {
        const owner = this.app.cast.agents.find((a) => a.id === view.rule.agent_id)?.label;
        this.app.bus.emit('toast', { text: `This rule belongs to ${owner}.`, tone: 'info' });
      }
      return;
    }
  }

  update(delta: number): void {
    for (const r of this.rings.values()) {
      if (Math.abs(r.shown - r.fill) > 0.001) {
        r.shown += (r.fill - r.shown) * Math.min(1, delta * 4);
        Furniture.setRing(r.ring, r.shown);
      }
    }
    for (let i = this.rules.length - 1; i >= 0; i--) {
      const view = this.rules[i];
      if (view.entity.hasComponent(Grabbed)) continue;
      if (view.absorbed > 0) {
        view.absorbed += delta * 1.5;
        const agent = this.rings.get(view.rule.agent_id)!;
        view.root.position.lerp(agent.root.position, Math.min(1, view.absorbed));
        view.root.scale.setScalar(Math.max(0.001, 1 - view.absorbed));
        if (view.absorbed >= 1) {
          view.entity.dispose();
          this.rules.splice(i, 1);
        }
        continue;
      }
      view.root.position.lerp(view.home, Math.min(1, delta * 3));
      view.root.rotation.y += delta * 0.6;
    }
  }
}
