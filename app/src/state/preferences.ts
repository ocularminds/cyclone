import type { Settings } from './settings';

export type PreferencesPage = 'home' | 'input' | 'hand' | 'display' | 'comfort' | 'session' | 'advanced' | 'reset' | 'restart' | 'rules';
export type PreferencesEffect = 'close' | 'reset' | 'restart' | 'mode' | 'revoke' | null;
export type PreferenceAction = { id: string; label: string; selected?: boolean; danger?: boolean; unavailable?: boolean };
export type PreferencesInfo = { live: boolean; liveAvailable: boolean; amended: boolean; input: string; progress: string; rule: string | null };
export type PreferencesView = { title: string; note: string; actions: PreferenceAction[] };

/** Navigation and deliberate reset are independent of UIKit; hand and ray input use the same actions. */
export class Preferences {
  page: PreferencesPage = 'home';
  message = '';
  private readonly parents: Record<PreferencesPage, PreferencesPage> = {
    home: 'home', input: 'home', hand: 'input', display: 'home', comfort: 'display',
    session: 'home', advanced: 'session', reset: 'advanced', restart: 'session', rules: 'advanced',
  };
  constructor(private readonly settings: Settings, private readonly info: () => PreferencesInfo) {}

  view(): PreferencesView {
    const s = this.settings.snapshot(); const i = this.info();
    const row = (id: string, label: string, selected = false): PreferenceAction => ({ id, label, selected });
    const toggle = (id: string, label: string, on: boolean) => row(id, `${label}: ${on ? 'on' : 'off'}`, on);
    let v: PreferencesView;
    switch (this.page) {
      case 'input': v = { title: 'Input', note: i.input, actions: [
        row('hands', 'Hands', !s.eyesOnly && !s.oneHanded), row('gaze', 'Gaze + pinch', s.eyesOnly), row('onehand', 'One hand', s.oneHanded),
      ] }; break;
      case 'hand': v = { title: 'Preferred hand', note: 'Hold with this hand and look at the slot seal for 1.5 s.', actions: [
        row('left', 'Left hand', s.preferredHand === 'left'), row('right', 'Right hand', s.preferredHand === 'right'),
      ] }; break;
      case 'display': v = { title: 'Display', note: 'Opaque panels. Larger text reflows inside the same bounds.', actions: [
        row('theme', `Theme: ${s.theme === 'ink' ? 'Ink' : 'Porcelain'}`), row('text', `Text size: ${s.textScale === 1 ? '100%' : '125%'}`), row('page:comfort', 'Comfort'),
      ] }; break;
      case 'comfort': v = { title: 'Comfort', note: 'Captions start on. Reduced motion keeps hold timing visible.', actions: [
        toggle('highContrast', 'High contrast', s.highContrast), toggle('captions', 'Captions', s.captions), toggle('reducedMotion', 'Reduced motion', s.reducedMotion),
      ] }; break;
      case 'session': v = { title: 'Session', note: i.progress, actions: [
        { id: 'page:restart', label: 'Replay first shift', unavailable: i.live },
        row('passthrough', s.passthrough ? 'Passthrough: on' : 'Passthrough: off / plinth'), row('page:advanced', 'Advanced and history'),
      ] }; break;
      case 'advanced': v = { title: 'Policy gate / history', note: i.live ? 'Live source. Proof and action binding must both be checked.' : 'Demo source. Execution is simulated; signatures use a local key.', actions: [
        { id: 'amend', label: `Amend: ${i.amended ? 'direct approval' : 'counter-offer'}`, unavailable: i.live },
        { id: 'mode', label: i.live ? 'Switch to demo' : i.liveAvailable ? 'Switch to live' : 'Live: unavailable' }, row('page:rules', 'Rules and reset'),
      ] }; break;
      case 'rules': v = { title: 'Rules and local data', note: i.rule ?? 'No accepted rule. A full trust ring is a progression cue.', actions: [
        { id: 'revoke', label: i.rule ? 'Revoke accepted rule' : 'Rules: none accepted', unavailable: !i.rule }, row('page:reset', 'Reset local data'),
      ] }; break;
      case 'reset': v = { title: 'Reset local data?', note: 'Removes seals, rules, scores, preferences and the demo key.', actions: [
        row('cancel', 'Cancel reset'), { id: 'confirm-reset', label: 'Confirm reset', danger: true },
      ] }; break;
      case 'restart': v = { title: 'Restart first shift?', note: 'Starts fresh proposals. Existing seals and scores remain.', actions: [
        row('cancel', 'Keep current shift'), row('confirm-restart', 'Restart first shift'),
      ] }; break;
      default: v = { title: 'Settings', note: i.progress, actions: [row('page:input', 'Input'), row('page:display', 'Display and comfort'), row('page:session', 'Session')] };
    }
    return { ...v, note: this.message || v.note };
  }

  act(id: string): PreferencesEffect {
    this.message = '';
    if (id === 'close') return 'close';
    if (id === 'back' || id === 'cancel') {
      if (this.page === 'home') return 'close';
      this.page = this.parents[this.page]; return null;
    }
    const action = this.view().actions.find(a => a.id === id);
    if (!action || action.unavailable) return null;
    if (id.startsWith('page:')) { this.page = id.slice(5) as PreferencesPage; return null; }
    if (id === 'confirm-reset') return this.page === 'reset' ? 'reset' : null;
    if (id === 'confirm-restart') return this.page === 'restart' ? 'restart' : null;
    if (id === 'revoke') return 'revoke';
    if (id === 'mode') {
      if (!this.info().live && !this.info().liveAvailable) { this.message = 'Live requires a configured relay and session. Demo remains available.'; return null; }
      return 'mode';
    }
    const s = this.settings;
    if (id === 'hands' || id === 'gaze' || id === 'onehand') {
      s.set('eyesOnly', id === 'gaze'); s.set('oneHanded', id === 'onehand');
      if (id === 'onehand') this.page = 'hand';
    } else if (id === 'left' || id === 'right') s.set('preferredHand', id);
    else if (id === 'theme') s.set('theme', s.get('theme') === 'ink' ? 'porcelain' : 'ink');
    else if (id === 'text') s.set('textScale', s.get('textScale') === 1 ? 1.25 : 1);
    else if (id === 'amend') s.toggle('amendedApproval');
    else if (id === 'highContrast' || id === 'captions' || id === 'reducedMotion' || id === 'passthrough') s.toggle(id);
    return null;
  }
}
