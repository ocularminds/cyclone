import { VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { Cyclone } from './app';
import { Stage } from './stage';
import { SpatialAudioSystem } from './systems/audio';
import { CardSystem } from './systems/card';
import { DrillSystem } from './systems/drill';
import { DecisionGestureSystem } from './systems/gesture';
import { GhostRehearsalSystem } from './systems/ghost';
import { HudSystem } from './systems/hud';
import { OnboardingSystem } from './systems/onboarding';
import { IntentQueueSystem } from './systems/queue';
import { RiskEncodingSystem } from './systems/risk';
import { SealSystem } from './systems/seal';
import { SettingsSystem } from './systems/settings';
import { TrustSystem } from './systems/trust';
import { TwinSystem } from './systems/twin';

const params = new URLSearchParams(location.search);
if (params.get('reset') === '1') {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('cyclone.')) localStorage.removeItem(k);
  } catch {
    // storage unavailable: nothing to reset
  }
}

const app = new Cyclone(Cyclone.options(location.search));
const stage = new Stage();

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then(async (world) => {
  world.globals.cyclone = app;
  world.globals.stage = stage;
  world
    .registerSystem(TwinSystem)
    .registerSystem(IntentQueueSystem)
    .registerSystem(CardSystem)
    .registerSystem(GhostRehearsalSystem)
    .registerSystem(DecisionGestureSystem)
    .registerSystem(SealSystem)
    .registerSystem(RiskEncodingSystem)
    .registerSystem(DrillSystem)
    .registerSystem(TrustSystem)
    .registerSystem(SpatialAudioSystem)
    .registerSystem(HudSystem)
    .registerSystem(OnboardingSystem)
    .registerSystem(SettingsSystem);
  await app.start();

  world.visibilityState.subscribe((state) => {
    if (state === VisibilityState.Visible) {
      world.session?.updateTargetFrameRate?.(72);
    }
    document.body.classList.toggle('immersive', state !== VisibilityState.NonImmersive);
  });
  const enter = document.getElementById('enter');
  if (enter) {
    enter.addEventListener('click', () => world.launchXR());
    enter.toggleAttribute('disabled', !world.xrEnabled);
  }
  const mode = document.getElementById('mode');
  if (mode) {
    mode.textContent = app.gate.capabilities.source === 'live'
      ? 'Live mode: intents arrive from your policy gate through the relay.'
      : `Demo mode · ${app.scenario.title}. No login, no backend. Physical execution is simulated.`;
  }
  // debugging / emulator e2e hook (no secrets live here)
  (window as unknown as Record<string, unknown>).cyclone = { app, stage, world };
});
