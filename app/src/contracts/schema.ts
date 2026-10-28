/**
 * JSON Schemas (draft 2020-12 compatible subset) for the data contracts.
 * Tests validate every scenario file and every generated HeldIntent (C38).
 */
const str = { type: 'string', minLength: 1 } as const;
const requirement = { enum: ['single', 'two_hand', 'forbidden'] } as const;
const risk = {
  type: 'object',
  required: ['level', 'reasons'],
  additionalProperties: false,
  properties: {
    level: { enum: [0, 1, 2, 3] },
    reasons: { type: 'array', items: str },
  },
} as const;
const policy = {
  type: 'object',
  required: ['rule_id', 'requires'],
  additionalProperties: false,
  properties: { rule_id: str, requires: requirement },
} as const;
const amend = {
  type: 'object',
  required: ['param', 'min', 'max', 'step', 'unit'],
  additionalProperties: false,
  properties: {
    param: str,
    min: { type: 'number' },
    max: { type: 'number' },
    step: { type: 'number', exclusiveMinimum: 0 },
    safe_max: { type: 'number' },
    unit: str,
  },
} as const;
const target = {
  type: 'object',
  required: ['asset_id'],
  additionalProperties: false,
  properties: { asset_id: str },
} as const;

export const bindingSchema = {
  $id: 'cyclone/binding',
  type: 'object',
  required: [
    'protocol_version',
    'tenant_id',
    'intent_id',
    'captured_at',
    'expires_at',
    'actor',
    'action',
    'context',
    'downstream_target',
  ],
  additionalProperties: false,
  properties: {
    protocol_version: { const: 'agent-safe.intent/1' },
    tenant_id: str,
    intent_id: str,
    captured_at: str,
    expires_at: str,
    actor: { type: 'object', required: ['id', 'type'] },
    action: { type: 'object', required: ['type', 'resource', 'parameters'] },
    context: { type: 'object', required: ['idempotency_key'] },
    downstream_target: { type: 'object', required: ['system', 'operation'] },
    expected_effect_digest: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
  },
} as const;

export const heldIntentSchema = {
  $id: 'cyclone/held-intent',
  type: 'object',
  required: ['intent_id', 'agent', 'tool', 'args', 'target', 'policy', 'risk', 'expires_at', 'intent_hash'],
  additionalProperties: false,
  properties: {
    intent_id: str,
    agent: {
      type: 'object',
      required: ['id', 'label'],
      additionalProperties: false,
      properties: { id: str, label: str },
    },
    tool: str,
    args: { type: 'object' },
    target,
    policy,
    risk,
    rationale: { type: 'string' },
    summary: { type: 'string' },
    expires_at: str,
    intent_hash: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
    binding: bindingSchema,
    is_drill: { type: 'boolean' },
    amend,
    supersedes: str,
  },
} as const;

const template = {
  type: 'object',
  required: [
    'key',
    'agent_id',
    'tool',
    'args',
    'target',
    'policy',
    'risk',
    'summary',
    'rationale',
    'ttl_s',
    'downstream',
  ],
  additionalProperties: false,
  properties: {
    key: str,
    agent_id: str,
    tool: { type: 'string', pattern: '^[a-z][a-z0-9._:-]*$' },
    args: { type: 'object' },
    target,
    policy,
    risk,
    summary: str,
    rationale: str,
    ttl_s: { type: 'number', exclusiveMinimum: 0 },
    amend,
    is_drill: { type: 'boolean' },
    downstream: {
      type: 'object',
      required: ['system', 'operation'],
      additionalProperties: false,
      properties: { system: str, operation: str },
    },
  },
} as const;

export const scenarioSchema = {
  $id: 'cyclone/scenario',
  type: 'object',
  required: ['id', 'title', 'templates', 'beats'],
  additionalProperties: false,
  properties: {
    id: str,
    title: str,
    ends_with_summary: { type: 'boolean' },
    templates: { type: 'array', items: template },
    beats: {
      type: 'array',
      items: {
        type: 'object',
        required: ['beat', 'template'],
        additionalProperties: false,
        properties: {
          beat: str,
          template: str,
          at: { type: 'number', minimum: 0 },
          after: str,
          delay_s: { type: 'number', minimum: 0 },
          hints: {
            type: 'array',
            items: { enum: ['glow', 'pinch', 'handle', 'dial', 'lock', 'hold', 'push'] },
          },
        },
      },
    },
    counter_offers: { type: 'object', additionalProperties: { type: 'string' } },
  },
} as const;
