/**
 * Screenshot e validação visual da página de vendas.
 *
 *   npm run build && npm run preview      (num terminal)
 *   node screenshot.mjs                   (noutro)
 *
 * Gera os PNGs em ./screenshots e reporta erros de console,
 * assets que falharam e checagens do padrão low ticket.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:4173/';
const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const failed = [];

// O pixel da UTMify só existe em produção — não é erro da página.
const isNoise = (u) => u.includes('utmify') || u.includes('ipify') || u.includes(':3001');

async function grab(name, width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('console', (m) => { if (m.type() === 'error' && !isNoise(m.location()?.url || '')) errors.push(`[${name}] ${m.text()}`); });
  page.on('requestfailed', (r) => { if (!isNoise(r.url())) failed.push(`[${name}] ${r.url()} — ${r.failure()?.errorText}`); });

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  // fullPage captura a partir do topo: o IntersectionObserver não teria
  // disparado nas seções de baixo, então forçamos o estado final do reveal.
  await page.evaluate(() => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in')));
  await page.waitForTimeout(600);

  await page.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/${name}-hero.png` });

  // percorre a página para acionar o lazy-load antes de contar imagens quebradas
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 220));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1200);

  const info = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    imagensQuebradas: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length,
    vipCentralizado: getComputedStyle(document.querySelector('.plan.vip')).textAlign === 'center',
    listaVipAEsquerda: getComputedStyle(document.querySelector('.plan.vip ul')).textAlign === 'left',
    basicoPrimeiro: document.querySelector('.offer-grid > *').classList.contains('basic'),
  }));
  console.log(`${name}: ${JSON.stringify(info)}`);
  await page.close();
}

await grab('desktop', 1440, 900);
await grab('mobile', 390, 844);

// o botão do plano básico precisa abrir o downsell (e não ir pro checkout)
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.locator('#abrirDownsell').click();
await page.waitForTimeout(400);
console.log('modal abre no plano básico:', await page.locator('#downsellOverlay').evaluate((e) => e.classList.contains('open')));
await page.screenshot({ path: `${OUT}/modal-downsell.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
console.log('modal fecha no ESC:', await page.locator('#downsellOverlay').evaluate((e) => !e.classList.contains('open')));
await page.close();

console.log('\nerros de console:', errors.length ? `\n${errors.join('\n')}` : '(nenhum)');
console.log('assets que falharam:', failed.length ? `\n${failed.join('\n')}` : '(nenhum)');
await browser.close();
