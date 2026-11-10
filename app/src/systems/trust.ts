import { createSystem, Grabbed, OneHandGrabbable, Vector3, type Entity, type Group, type Mesh } from '@iwsdk/core';
import type { Cyclone } from '../app';
import { AgentTag, RuleTag } from '../components';
import type { RuleTemplate } from '../contracts/scenario';
import { Furniture } from '../models/desk';
import { Layout } from '../models/layout';
import { Tokens } from '../models/token';
import { Palette } from '../models/palette';
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
  private readonly rings = new Map<string, { ring: Mesh; root: Group; fill: number; shown: number; label: Label; name: string }>();
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
      const name = new Label(0.07, 0.024);
      name.mesh.name = `agent-label:${spec.id}`;
      this.rings.set(spec.id, { ring, root, fill, shown: fill, label: name, name: spec.label.replace(/ Agent$/, '') });
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
    if (this.app.gate.capabilities.source !== 'demo' || this.app.trust.status(rule.id) !== 'offered') return;
    if (this.rules.some((r) => r.rule.id === rule.id)) return;
    const root = Tokens.ruleTablet();
    const entity = this.world.createTransformEntity(root, { parent: this.stage.rootEntity! });
    entity.addComponent(RuleTag, { ruleId: rule.id });
    entity.addComponent(OneHandGrabbable, { rotate: false, translate: true });
    const label = new Label(0.20, 0.075);
    const agent = this.app.cast.agents.find((a) => a.id === rule.agent_id);
    label.mesh.name = 'rule-label';
    label.mesh.position.set(0, 0.055, 0);
    root.add(label.mesh);
    const home = new Vector3(...Layout.RULE).add(new Vector3(this.rules.length * 0.04, 0, 0));
    root.position.copy(home).setY(home.y + (this.app.settings.get('reducedMotion') ? 0 : 0.15));
    this.rules.push({ rule, entity, root, label, home, absorbed: 0 });
    this.app.cue('rule', `${agent?.label ?? 'Agent'} earned a rule offer: ${rule.label}`, [home.x, home.y, home.z]);
  }

  private drop(e: Entity): void {
    if (this.stage.settingsOpen || this.app.clock.isPaused) return;
    const view = this.rules.find((r) => r.entity === e);
    if (!view) return;
    view.root.getWorldPosition(this.v);
    this.stage.toDesk(this.v);
    for (const [agentId, r] of this.rings) {
      if (this.v.distanceTo(r.root.position) > Layout.AGENT_RADIUS * 1.6) continue;
      if (this.app.shift.acceptRule(view.rule.id, agentId)) {
        view.absorbed = 0.0001;
        this.app.cue('rule', `Demo rule accepted: ${view.rule.label}. Revoke it in Settings.`, [r.root.position.x, r.root.position.y, r.root.position.z]);
      } else {
        const owner = this.app.cast.agents.find((a) => a.id === view.rule.agent_id)?.label;
        this.app.bus.emit('toast', { text: `This rule belongs to ${owner}.`, tone: 'info' });
      }
      return;
    }
  }

  update(delta: number): void {
    for (const r of this.rings.values()) {
      r.label.draw([{ text: r.name, size: 0.009, weight: 600 }], { background: Palette.ui.surface, align: 'center', padding: 0.002 });
      if (Math.abs(r.shown - r.fill) > 0.001) {
        r.shown += (r.fill - r.shown) * (this.app.settings.get('reducedMotion') ? 1 : Math.min(1, delta * 4));
        Furniture.setRing(r.ring, r.shown);
      }
    }
    for (let i = this.rules.length - 1; i >= 0; i--) {
      const view = this.rules[i];
      if (this.app.trust.status(view.rule.id) !== 'offered' && view.absorbed === 0) { view.entity.dispose(); this.rules.splice(i, 1); continue; }
      const agentName = this.app.cast.agents.find(a => a.id === view.rule.agent_id)?.label ?? 'the agent';
      view.label.draw([
        { text: view.rule.label, size: 0.009, weight: 700 },
        { text: `Drop on ${agentName} to accept.`, size: 0.009, color: Palette.ui.muted },
        { text: 'Revoke in Settings.', size: 0.009, color: Palette.ui.muted },
      ], { background: Palette.ui.surface, border: Palette.ui.border, padding: 0.004, radius: 0.005, align: 'center' });
      view.label.mesh.lookAt(this.v.copy(this.stage.head).applyMatrix4(this.stage.root.matrixWorld));
      if (view.entity.hasComponent(Grabbed)) continue;
      if (view.absorbed > 0) {
        view.absorbed += this.app.settings.get('reducedMotion') ? 1 : delta * 1.5;
        const agent = this.rings.get(view.rule.agent_id)!;
        view.root.position.lerp(agent.root.position, Math.min(1, view.absorbed));
        view.root.scale.setScalar(Math.max(0.001, 1 - view.absorbed));
        if (view.absorbed >= 1) {
          view.entity.dispose();
          this.rules.splice(i, 1);
        }
        continue;
      }
      view.root.position.lerp(view.home, this.app.settings.get('reducedMotion') ? 1 : Math.min(1, delta * 3));
    }
  }
}
