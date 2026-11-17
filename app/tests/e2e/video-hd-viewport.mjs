// Before an HD take: resize the managed browser window so the page is 16:9 (1440×810 CSS at 2× density; the screen caps taller windows).
export default async function run({ page }) {
  const s = await page.context().newCDPSession(page);
  const { windowId } = await s.send('Browser.getWindowForTarget');
  await page.setViewportSize(null).catch(() => {});
  const want = [1440, 810];
  let inner = await page.evaluate(() => [innerWidth, innerHeight]);
  const { bounds } = await s.send('Browser.getWindowBounds', { windowId });
  let w = bounds.width + want[0] - inner[0], h = bounds.height + want[1] - inner[1];
  for (let i = 0; i < 3; i++) {
    await s.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal', left: 0, top: 0, width: w, height: h } });
    await new Promise(r => setTimeout(r, 700));
    inner = await page.evaluate(() => [innerWidth, innerHeight]);
    w += want[0] - inner[0]; h += want[1] - inner[1];
    if (inner[0] === want[0] && inner[1] === want[1]) break;
  }
  await s.detach();
  return { inner, dpr: await page.evaluate(() => devicePixelRatio) };
}
