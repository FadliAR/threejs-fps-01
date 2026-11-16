// Harbour Line — HUD: health, ammo, timer, score, money, kill feed,
// buy menu, bomb status and banners. Pure DOM reads of the sim state;
// it never writes game state except through the buy callback.
import { WEAPONS, ROUND } from './config.js';

function fmtTime(s) {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export class Hud {
  constructor(doc, onBuy) {
    this.d = doc;
    this.onBuy = onBuy;
    this.el = {};
    for (const id of ['health-fill', 'health-num', 'ammo-mag', 'ammo-reserve', 'weapon-name',
      'grenades', 'timer', 'score-h', 'score-j', 'money', 'alive-h', 'alive-j',
      'feed', 'banner', 'bomb', 'defuse', 'defuse-fill', 'hurt', 'crosshair',
      'buy', 'buy-list', 'overlay', 'overlay-title', 'overlay-copy', 'play',
      'round-label', 'hitmarker', 'reload-hint']) {
      this.el[id] = doc.getElementById(id);
    }
    this.buildBuyList();
    this.lastBanner = '';
    this.bannerUntil = 0;
  }

  buildBuyList() {
    const list = this.el['buy-list'];
    list.innerHTML = '';
    for (const w of Object.values(WEAPONS)) {
      const row = this.d.createElement('button');
      row.className = 'buy-row';
      row.type = 'button';
      row.dataset.id = w.id;
      row.innerHTML = `<span class="buy-key">${w.slot}</span>
        <span class="buy-name">${w.name}</span>
        <span class="buy-stat">${w.grenade ? 'Frag · blast radius 6 m' : `${w.damage} dmg · ${w.mag} mag · ${w.rpm} rpm`}</span>
        <span class="buy-price">$${w.price}</span>`;
      row.addEventListener('click', () => this.onBuy(w.id));
      list.appendChild(row);
    }
  }

  showOverlay(title, copy, button) {
    this.el['overlay-title'].textContent = title;
    this.el['overlay-copy'].textContent = copy;
    this.el.play.textContent = button;
    this.el.overlay.hidden = false;
  }

  hideOverlay() { this.el.overlay.hidden = true; }

  showBuy(open) {
    this.el.buy.hidden = !open;
    if (open) this.refreshBuy();
  }

  refreshBuy() {
    // Affordability is re-checked every time the menu opens.
    for (const row of this.el['buy-list'].children) {
      const w = WEAPONS[row.dataset.id];
      row.classList.toggle('owned', this.money >= 0 && this.weapon === w.id);
    }
  }

  update(sim, player, now) {
    const e = this.el;
    this.money = player.money;
    this.weapon = player.weapon;
    // Health.
    e['health-fill'].style.width = `${Math.max(0, player.hp)}%`;
    e['health-fill'].classList.toggle('low', player.hp <= 30);
    e['health-num'].textContent = Math.ceil(Math.max(0, player.hp));
    // Ammo.
    const w = WEAPONS[player.weapon];
    e['ammo-mag'].textContent = player.mag;
    e['ammo-reserve'].textContent = w.reserve === Infinity ? '∞' : `/ ${player.reserve}`;
    e['ammo-mag'].parentElement.classList.toggle('empty', player.mag === 0);
    e['weapon-name'].textContent = w.name;
    e.grenades.textContent = `◉ ${player.grenades}`;
    // Timer: bomb clock overrides the round clock once planted.
    const bomb = sim.bomb.state === 'planted';
    e.timer.textContent = bomb ? fmtTime(sim.bomb.timer) : fmtTime(sim.roundTime);
    e.timer.classList.toggle('bomb', bomb);
    e['round-label'].textContent = `ROUND ${sim.round}`;
    e['score-h'].textContent = sim.score.harbour;
    e['score-j'].textContent = sim.score.jackal;
    e.money.textContent = `$${player.money}`;
    e['alive-h'].textContent = sim.actors.filter(a => a.alive && a.team === 'harbour').length;
    e['alive-j'].textContent = sim.actors.filter(a => a.alive && a.team === 'jackal').length;
    // Crosshair: gap grows with spread bloom and movement.
    const moving = Math.hypot(player.vel.x, player.vel.z);
    const gap = 4 + player.spreadBloom * 260 + (moving > 0.5 ? 5 : 0) + (player.ads ? -2 : 0);
    e.crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
    e.crosshair.classList.toggle('ads', player.ads);
    // Kill feed.
    const feedHtml = sim.feed.slice(0, 5).map(f => `<div>${f.text}</div>`).join('');
    if (feedHtml !== this.feedHtml) { e.feed.innerHTML = feedHtml; this.feedHtml = feedHtml; }
    // Banner: centre announcement, fades after 3 s.
    if (sim.banner && sim.banner !== this.lastBanner) {
      this.lastBanner = sim.banner;
      this.bannerUntil = now + 3;
      e.banner.textContent = sim.banner;
      e.banner.classList.add('show');
    }
    if (this.bannerUntil && now > this.bannerUntil) {
      e.banner.classList.remove('show');
      this.bannerUntil = 0;
    }
    // Bomb status line.
    const b = sim.bomb;
    if (b.state === 'planted') {
      e.bomb.hidden = false;
      e.bomb.textContent = `⬤ BOMB PLANTED — SITE ${b.site} — ${fmtTime(b.timer)}`;
    } else if (b.state === 'carried' || b.state === 'dropped') {
      e.bomb.hidden = false;
      e.bomb.textContent = b.state === 'carried' ? '◆ Enemy carrier is pushing a site' : '◆ Bomb dropped — carrier down';
    } else {
      e.bomb.hidden = true;
    }
    // Defuse progress.
    if (player.defusing > 0) {
      e.defuse.hidden = false;
      e['defuse-fill'].style.width = `${(player.defusing / ROUND.defuseSeconds) * 100}%`;
    } else {
      e.defuse.hidden = true;
    }
    // Damage vignette.
    e.hurt.style.opacity = sim.hurtFlash ? sim.hurtFlash * 0.55 : 0;
    // Reload hint.
    e['reload-hint'].hidden = !(player.mag === 0 && player.reserve > 0);
    // Buy menu affordability + phase gating.
    const buyOpen = sim.phase === 'buy' && !sim.matchOver;
    this.showBuy(buyOpen && this.buyWanted);
    for (const row of this.el['buy-list'].children) {
      const ww = WEAPONS[row.dataset.id];
      const afford = player.money >= ww.price || (ww.id === 's1' && player.grenades >= 2);
      row.classList.toggle('cant', !afford);
      row.classList.toggle('owned', player.weapon === ww.id && ww.id !== 's1');
    }
  }

  flashHit(head) {
    const h = this.el.hitmarker;
    h.classList.remove('on', 'head');
    void h.offsetWidth; // restart the transition
    h.classList.add('on');
    if (head) h.classList.add('head');
  }
}
