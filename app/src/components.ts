import { createComponent, defineComponents, Types } from '@iwsdk/core';

/** A machine in the tabletop twin (asset_id → entity, C37 TwinSystem). */
export const Machine = createComponent('Machine', {
  assetId: { type: Types.String, default: '' },
});

/** A held-intent token on the desk. */
export const TokenTag = createComponent('TokenTag', {
  intentId: { type: Types.String, default: '' },
});

/** Timeline handle (scrub, C03) or parameter dial (amend, C04) belonging to a token. */
export const Control = createComponent('Control', {
  intentId: { type: Types.String, default: '' },
  kind: { type: Types.Enum, default: 'handle', enum: { handle: 'handle', dial: 'dial' } },
});

/** Fixed desk stations the gesture system tests against. */
export const Station = createComponent('Station', {
  kind: {
    type: Types.Enum,
    default: 'slot',
    enum: { slot: 'slot', pad: 'pad', chute: 'chute', rack: 'rack', shelf: 'shelf', puck: 'puck', tray: 'tray' },
  },
});

/** A seal crystal on the ledger shelf (C10, C11). */
export const SealTag = createComponent('SealTag', {
  recordId: { type: Types.String, default: '' },
});

/** An offered trust rule the user can drop on an agent (C17). */
export const RuleTag = createComponent('RuleTag', {
  ruleId: { type: Types.String, default: '' },
});

/** An agent pedestal with its sigil and trust ring. */
export const AgentTag = createComponent('AgentTag', {
  agentId: { type: Types.String, default: '' },
});

/** The decision card panel (gaze/poke target). */
export const CardTag = createComponent('CardTag', {});

export default defineComponents([Machine, TokenTag, Control, Station, SealTag, RuleTag, AgentTag, CardTag]);
