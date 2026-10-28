import { Proposer } from './propose';

/**
 * Scripted demo agent (C36). Usage:
 *
 *   npm start                 four onboarding calls (dry run without DECIONIS_API_KEY)
 *   npm start -- --follow     paced like onboarding; re-proposes after a counter-offer
 *   npm start -- --dry-run    print what would be sent, even with credentials
 *
 * Env: DECIONIS_API_KEY, DECIONIS_ORG_ID, DECIONIS_API_BASE (default
 * https://api.decionis.com), CYCLONE_RELAY (default http://localhost:8787),
 * RELAY_AGENT_TOKEN.
 */
const args = process.argv.slice(2);
const env = process.env;
const apiKey = env.DECIONIS_API_KEY?.trim() || null;
const dry = !apiKey || args.includes('--dry-run');

const proposer = new Proposer({
  apiBase: env.DECIONIS_API_BASE?.trim() || 'https://api.decionis.com',
  apiKey,
  orgId: env.DECIONIS_ORG_ID?.trim() || null,
  relay: env.CYCLONE_RELAY?.trim() || 'http://localhost:8787',
  agentToken: env.RELAY_AGENT_TOKEN?.trim() || null,
  dry,
});

if (dry) console.log(`# Dry run${apiKey ? '' : ' (no DECIONIS_API_KEY)'}: nothing is sent.`);
if (args.includes('--follow')) await proposer.follow();
else await proposer.shift();
