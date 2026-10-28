import type { DecisionKind } from '../contracts/intent';

export type SessionEvent = {
  t: number;
  type: 'decision' | 'beat' | 'drill' | 'expired' | 'denied' | 'refused' | 'rule';
  intent_id?: string;
  decision?: DecisionKind;
  amended?: boolean;
  drill?: 'caught' | 'missed';
  note?: string;
};

export type Summary = {
  decisions: number;
  approved: number;
  amended: number;
  vetoed: number;
  escalated: number;
  expired: number;
  auto: number;
  drillsCaught: number;
  drillsMissed: number;
};

/** This session's event log; the shift summary is computed from it (C18). */
export class SessionLog {
  private readonly events: SessionEvent[] = [];

  log(event: SessionEvent): void {
    this.events.push(event);
  }

  all(): readonly SessionEvent[] {
    return this.events;
  }

  beats(): SessionEvent[] {
    return this.events.filter((e) => e.type === 'beat');
  }

  summary(): Summary {
    const s: Summary = {
      decisions: 0,
      approved: 0,
      amended: 0,
      vetoed: 0,
      escalated: 0,
      expired: 0,
      auto: 0,
      drillsCaught: 0,
      drillsMissed: 0,
    };
    for (const e of this.events) {
      if (e.type === 'drill') {
        if (e.drill === 'caught') s.drillsCaught += 1;
        else s.drillsMissed += 1;
      }
      if (e.type === 'expired') s.expired += 1;
      if (e.type !== 'decision') continue;
      s.decisions += 1;
      if (e.amended) s.amended += 1;
      switch (e.decision) {
        case 'APPROVE':
        case 'APPROVE_AMENDED':
          s.approved += 1;
          break;
        case 'REJECT':
          s.vetoed += 1;
          break;
        case 'ESCALATE':
          s.escalated += 1;
          break;
        case 'AUTO_APPROVE_RULE':
          s.auto += 1;
          break;
      }
    }
    return s;
  }
}
