// Capture inline-style transforms on a design card before vs during real hover.
const CDP = require('chrome-remote-interface');

function snapshotExpr() {
  return `(() => {
    const card = document.querySelector('#selected-project .collection-item');
    const div = card.querySelector('.div-block-10');
    const img = card.querySelector('img');
    const h2 = card.querySelector('h2');
    const chips = card.querySelector('.chip-row, .design-chip-row');
    const p = card.querySelector('p.transparent-subtitle');
    return JSON.stringify({
      cardTransform: card.style.transform || '(none)',
      divTransform: div.style.transform || '(none)',
      imgTransform: img && img.style.transform || '(none)',
      imgOpacity: img && img.style.opacity || '(default)',
      h2Transform: h2 && h2.style.transform || '(none)',
      chipsTransform: chips && chips.style.transform || '(none)',
      pTransform: p && p.style.transform || '(none)',
      cardComputed: getComputedStyle(card).transform,
      divComputed: getComputedStyle(div).transform,
      divTransition: getComputedStyle(div).transitionDuration + ' ' + getComputedStyle(div).transitionTimingFunction,
    }, null, 2);
  })()`;
}

function posExpr() {
  return `(() => {
    const card = document.querySelector('#selected-project .collection-item');
    const r = card.getBoundingClientRect();
    return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  })()`;
}

(async () => {
  const ws = (await (await fetch('http://localhost:9222/json/version')).json()).webSocketDebuggerUrl;
  const browser = await CDP({ target: ws });
  const { targetId } = await browser.Target.createTarget({ url: 'about:blank' });
  const client = await CDP({ port: 9222, target: targetId });
  await client.Page.enable();
  await client.Runtime.enable();
  await client.Input.enable && await client.Input.enable().catch(() => {});
  await client.Emulation.setDeviceMetricsOverride({ width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const loaded = new Promise((r) => client.Page.loadEventFired(() => r()));
  await client.Page.navigate({ url: 'http://localhost:5173/' });
  await Promise.race([loaded, new Promise((r) => setTimeout(r, 10000))]);
  await new Promise((r) => setTimeout(r, 1500));
  await client.Runtime.evaluate({
    expression: `document.querySelector('#selected-project').scrollIntoView({block:'start'})`,
  });
  await new Promise((r) => setTimeout(r, 1500));

  const before = await client.Runtime.evaluate({ expression: snapshotExpr(), returnByValue: true });
  console.log('--- BEFORE hover ---');
  console.log(before.result.value);

  const pos = await client.Runtime.evaluate({ expression: posExpr(), returnByValue: true });
  const p = JSON.parse(pos.result.value);
  await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x: p.x, y: p.y });
  await new Promise((r) => setTimeout(r, 900));
  const after = await client.Runtime.evaluate({ expression: snapshotExpr(), returnByValue: true });
  console.log('\n--- AFTER hover ---');
  console.log(after.result.value);

  await client.close();
  await browser.Target.closeTarget({ targetId });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
