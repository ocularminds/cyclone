// Clears Cyclone's persisted state so the next reload is a first visit (onboarding).
export default async function run({ frame }) {
  return frame.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('cyclone.')) localStorage.removeItem(k);
    return true;
  });
}
