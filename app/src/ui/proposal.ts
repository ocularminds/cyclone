import type { Cyclone } from '../app';
import type { Token } from '../flow/shift';
import { GesturePolicy } from '../flow/policy';
import { Palette } from '../models/palette';
import type { Stage } from '../stage';
import type { Line } from './label';

export type ReviewPage = 'review' | 'rationale' | 'adjust' | 'compare' | 'tools';
export class Proposal {
  static value(token: Token): { original: number; current: number; unit: string } {
    const spec = token.intent.amend;
    const key = spec?.param ?? (token.intent.tool === 'set_oven_setpoint' ? 'setpoint_c' : 'height_mm');
    return { original: Number(token.intent.args[key]), current: Number(token.args[key]), unit: spec?.unit ?? (key === 'setpoint_c' ? '°C' : 'mm') };
  }
  static short(text: string, max = 65): string { return text.length > max ? `${text.slice(0, max - 3).replace(/\s+\S*$/, '')}...` : text; }
  static result(token: Token): string {
    return token.rehearsal.breach ? `Rehearsal: ${token.rehearsal.breach.zone_label} crossed` : 'Within rehearsal envelope';
  }
  static lines(app: Cyclone, stage: Stage, token: Token, page: ReviewPage): Line[] {
    const i = token.intent, ui = Palette.ui, value = Proposal.value(token);
    const title = app.rehearsal.asset(i.target.asset_id)?.label ?? i.target.asset_id;
    const assets = token.rehearsal.affected.map(a => app.rehearsal.asset(a)?.label ?? app.rehearsal.zone(a)?.label ?? a).join(', ');
    const context = { eyesOnly: app.settings.get('eyesOnly'), oneHanded: app.settings.get('oneHanded'), tampered: token.tampered };
    const seconds = Math.max(0, Math.ceil((app.gate.capabilities.source === 'live' ? Date.parse(i.expires_at) - Date.now() : token.deadlineMs - app.clock.ms) / 1000));
    const source = app.gate.capabilities.source === 'demo' ? 'Demo / simulated' : 'Live / policy gate';
    const line = (text: string, size = 0.009, color = ui.text, weight: 400 | 600 | 700 = 400): Line => ({ text, size, color, weight });
    const header: Line[] = [{ text: title, size: 0.015, weight: 700, display: true }, line(`${i.agent.label} / ${Palette.RISK_NAMES[i.risk.level]}`, 0.009, ui.muted)];
    if (page === 'tools') return [...header, line(`${value.current} ${value.unit}`, 0.018, ui.text, 700), line(Proposal.result(token)), line(GesturePolicy.approvalHint(i, context)), line('Choose a review tool below.')];
    if (page === 'rationale') return [
      ...header, line('Full rationale', 0.012, ui.text, 700), line(i.rationale ?? 'No rationale supplied.'),
      line(`Rule: ${i.policy.rule_id}`), line(`Why held: ${i.risk.reasons.join('; ')}`), line(`Affected: ${assets}`),
      ...(token.denial ? [line(`Policy gate: ${token.denial}`, 0.009, ui.danger)] : []),
      line(`Action glyph: ${token.glyph.label}`, 0.0075, ui.muted), line('A rehearsal is a model, not a prediction.', 0.009, ui.muted),
    ];
    if (page === 'compare') {
      const original = app.rehearsal.run(i.tool, i.target.asset_id, i.args);
      return [...header, line(`${value.original} → ${value.current} ${value.unit}`, 0.018, ui.text, 700),
        line('Original → proposed', 0.009, ui.muted),
        line(original.breach ? `Original crosses ${original.breach.zone_label}.` : 'Original stays within the envelope.'),
        line(`Proposed: ${Proposal.result(token)}`, 0.009, token.rehearsal.breach ? ui.danger : ui.accent),
        line(`Active rehearsal: ${stage.comparison === 'original' ? 'original' : 'proposed'} / ${Math.round(stage.scrub * 100)}%`),
        line('Dashed = original. Solid = proposed.'),
        line('Same start and model. Pull the timeline; switch the active ghost below.'),
      ];
    }
    if (page === 'adjust') return [
      ...header, line(`${value.current} ${value.unit}`, 0.018, ui.text, 700), line(`Original: ${value.original} ${value.unit}`),
      line(i.amend ? `Range ${i.amend.min} to ${i.amend.max} ${value.unit}; step ${i.amend.step} ${value.unit}.` : 'This proposal has no editable parameter.'),
      line('Twist the dial, or use the step controls below. An edit cancels an active hold.'),
      line(Proposal.result(token), 0.01, token.rehearsal.breach ? ui.danger : ui.accent, 700),
      ...(token.validation ? [line(token.validation, 0.009, ui.danger, 700)] : []),
      line(i.amend?.safe_max !== undefined ? `Policy ceiling: ${i.amend.safe_max} ${value.unit}. Approval is checked again.` : 'A model result does not grant policy permission.'),
    ];
    const parked = token.status === 'escalated' || token.status === 'unverified';
    const feedback = token.status === 'deciding' ? 'Decision sent. Checking the record.' : token.status === 'escalated' ? 'Escalated. Held for another reviewer.' : token.status === 'unverified' ? 'Response unverified. The decision was sent.' : token.amending ? 'Updating rehearsal...' : token.validation ?? token.denial;
    return [
      ...header,
      line(token.amended ? `${value.original} → ${value.current} ${value.unit}` : `${value.current} ${value.unit}`, 0.018, ui.text, 700),
      line(token.amended ? 'Original → proposed' : 'Requested change', 0.0075, ui.muted),
      line(Proposal.short(i.rationale ?? i.summary ?? i.tool, 55)),
      line(feedback ? Proposal.short(feedback, 95) : Proposal.result(token), 0.01, feedback ? ui.warning : token.rehearsal.breach ? ui.danger : ui.accent, 700),
      line(parked ? token.status === 'escalated' ? 'Awaiting another reviewer. No execution.' : 'Do not repeat the decision. No execution confirmed.' : stage.holding || stage.holdFeedback.startsWith('Tracking') || stage.holdFeedback.startsWith('Hold cancelled') ? stage.holdFeedback : GesturePolicy.approvalHint(i, context), 0.01, ui.text, 700),
      line(`Rule: ${i.policy.rule_id}`, 0.0075, ui.muted),
      line(`Affected: ${Proposal.short(assets, 60)}`, 0.0075, ui.muted),
      line(`${source} / ${seconds} s. Edge = veto.`, 0.009, ui.muted),
    ];
  }
}
