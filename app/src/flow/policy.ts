import type { DecisionKind, Gesture, HeldIntent } from '../contracts/intent';

export type GestureContext = { eyesOnly: boolean; oneHanded: boolean; tampered: boolean };

/**
 * Which gesture may carry which decision for a given `policy.requires`
 * (BRIEF §3.5, §6). Pure: DecisionGestureSystem asks before resolving.
 */
export class GesturePolicy {
  /** Returns null when allowed, else a short, user-facing refusal. */
  static check(
    intent: HeldIntent,
    kind: DecisionKind,
    gesture: Gesture,
    ctx: GestureContext,
  ): string | null {
    const approving = kind === 'APPROVE' || kind === 'APPROVE_AMENDED';
    if (kind === 'REJECT') {
      return gesture === 'veto_push' || gesture === 'timeout' || (gesture === 'gaze_pinch' && ctx.eyesOnly)
        ? null
        : 'Veto by pushing the token off the desk edge.';
    }
    if (kind === 'ESCALATE') {
      return gesture === 'escalate_place' || (gesture === 'gaze_pinch' && ctx.eyesOnly)
        ? null
        : 'Escalate by placing the token on the escalate pad.';
    }
    if (kind === 'AUTO_APPROVE_RULE') return gesture === 'rule' ? null : 'Rules approve on their own.';
    if (!approving) return 'Unknown decision.';
    if (ctx.tampered) return 'Payload changed since it was held. Veto or escalate.';
    switch (intent.policy.requires) {
      case 'forbidden':
        return 'Execute slot locked: this action breaks a hard limit.';
      case 'single':
        if (gesture === 'place') return null;
        if (gesture === 'gaze_pinch') {
          if (!ctx.eyesOnly) return 'Turn on eyes-only mode to approve by gaze.';
          return intent.risk.level <= 1 ? null : 'Gaze approval is for low-risk actions only.';
        }
        return 'Place the token in the execute slot.';
      case 'two_hand':
        if (gesture === 'two_hand_hold') return null;
        if (gesture === 'one_hand_gaze_hold') {
          return ctx.oneHanded ? null : 'Turn on one-handed mode to hold with one hand.';
        }
        return 'Critical action: hold the token with both hands.';
    }
  }

  /** The approval gesture this token asks for, used for hints and slot state. */
  static approvalHint(intent: HeldIntent, ctx: GestureContext): string {
    switch (intent.policy.requires) {
      case 'forbidden':
        return 'Slot locked — veto or escalate';
      case 'two_hand':
        return ctx.oneHanded ? 'Hold with one hand and look at the seal' : 'Hold with both hands';
      default:
        return ctx.eyesOnly && intent.risk.level <= 1 ? 'Look and pinch to approve' : 'Place in the slot';
    }
  }
}
