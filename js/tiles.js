

import { $ } from './utils.js?v=3';
import { showGestureButton } from './gesture.js?v=3';

export class TileManager {
  constructor(state) {
    this.state = state;
    this.tiles = {};
    this.tileZ = 50;
    this.tileCount = 0;
  }

  makeSelfTile() {
    const S = this.state;
    const el = this.#makeTile('self', S.name + ' (sen)', true);
    const v = el.querySelector('video');
    v.srcObject = S.local;
    v.play().catch(() => {});
    this.#matchAspect(v);
    if (!S.hasCam) this.#showAvatar(el, S.name);
  }

  attachRemote(id, stream) {
    const S = this.state;
    const el = this.#makeTile(id, S.nameOf(id), false);
    const v = el.querySelector('video');
    v.srcObject = stream;
    v.play().catch(() => showGestureButton());
    this.#matchAspect(v);
    const info = S.roster[id];
    if (info && info.cam === false) this.#showAvatar(el, info.name);
  }


  #matchAspect(v) {
    const apply = () => {
      if (!v.videoWidth || !v.videoHeight) return;
      v.style.aspectRatio = v.videoWidth + ' / ' + v.videoHeight;
      this.#cropPadding(v);
    };
    if (v.videoWidth) apply(); else v.addEventListener('loadedmetadata', apply, { once: true });
  }


  #cropPadding(v) {
    const delays = [350, 800, 1500, 2600, 4200];
    let i = 0;
    const attempt = () => {
      const ok = this.#tryCropPadding(v);
      if (!ok && ++i < delays.length && !v.paused) setTimeout(attempt, delays[i]);
    };
    setTimeout(attempt, delays[0]);
  }

  #tryCropPadding(v) {
    try {
      if (!v.videoWidth || !v.videoHeight || v.readyState < 2) return false;
      const w = 64, h = Math.max(1, Math.round(w * v.videoHeight / v.videoWidth));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(v, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      const rowVar = new Array(h);
      for (let y = 0; y < h; y++) {
        let rs = 0, gs = 0, bs = 0;
        for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; rs += data[i]; gs += data[i + 1]; bs += data[i + 2]; }
        const ra = rs / w, ga = gs / w, ba = bs / w;
        let dev = 0;
        for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; dev += Math.abs(data[i] - ra) + Math.abs(data[i + 1] - ga) + Math.abs(data[i + 2] - ba); }
        rowVar[y] = dev / w;
      }
      const topAvg = rowVar.slice(0, Math.max(1, Math.round(h * 0.15))).reduce((a, b) => a + b, 0) / Math.max(1, Math.round(h * 0.15));
      if (topAvg < 6) return false; // frame looks blank/not decoded yet — retry later

      let flatFrom = h;
      for (let y = h - 1; y >= 0; y--) { if (rowVar[y] < 6) flatFrom = y; else break; }
      const flatFrac = (h - flatFrom) / h;
      if (flatFrac > 0.1 && flatFrac < 0.65) {
        v.style.objectFit = 'cover';
        v.style.objectPosition = '50% 0%';
        v.style.aspectRatio = v.videoWidth + ' / ' + Math.round(v.videoHeight * (1 - flatFrac));
      }
      return true;
    } catch (e) { return false; }
  }

  removeTile(id) {
    if (this.tiles[id]) { this.tiles[id].remove(); delete this.tiles[id]; }
  }

 
  pruneAndRename(roster) {
    Object.keys(this.tiles).forEach(id => {
      if (id === 'self') return;
      if (!roster[id]) { this.removeTile(id); return; }
      const nm = this.tiles[id].querySelector('.tName');
      if (nm) nm.textContent = (roster[id].name || 'Misafir');
    });
  }

 
  resumeAll() {
    Object.keys(this.tiles).forEach(id => {
      const v = this.tiles[id].querySelector('video');
      if (v) v.play().catch(() => {});
    });
  }

  #makeTile(id, label, self) {
    if (this.tiles[id]) return this.tiles[id];
    const el = document.createElement('div');
    el.className = 'tile' + (self ? ' self' : '');
    el.style.zIndex = ++this.tileZ;
    el.innerHTML =
      '<div class="tHead"><span class="dot"></span><span class="tName"></span>' +
      (self ? '' : '<button class="tVol" title="Ses düzeyi">🔊</button>') +
      '<button class="tMin" title="Küçült / büyüt">–</button></div>' +
      (self ? '' : '<input type="range" class="tVolBar" min="0" max="100" value="100" title="Ses düzeyi">') +
      '<video autoplay playsinline' + (self ? ' muted' : '') + '></video>' +
      '<div class="tAvatar" hidden></div>' +
      '<div class="tGrip" title="Sürükleyerek boyutlandır"></div>';
    el.querySelector('.tName').textContent = label;
    const W = window.innerWidth < 640 ? 140 : 200;
    el.style.width = W + 'px';
    const st = $('#stage');
    el.style.left = Math.max(8, st.clientWidth - W - 22) + 'px';
    el.style.top = (14 + (this.tileCount % 4) * (W * 0.75 + 44)) + 'px';
    this.tileCount++;
    $('#tiles').appendChild(el);
    this.tiles[id] = el;

    el.querySelector('.tMin').addEventListener('click', e => { e.stopPropagation(); el.classList.toggle('mini'); });

    if (!self) {
      const volBtn = el.querySelector('.tVol');
      const volBar = el.querySelector('.tVolBar');
      const v = el.querySelector('video');
      volBtn.addEventListener('click', e => { e.stopPropagation(); el.classList.toggle('showVol'); });
      volBar.addEventListener('pointerdown', e => e.stopPropagation());
      volBar.addEventListener('input', e => {
        const vol = e.target.value / 100;
        v.volume = vol;
        volBtn.textContent = vol === 0 ? '🔇' : (vol < 0.5 ? '🔉' : '🔊');
      });
    }


    el.addEventListener('pointerdown', e => {
      if (e.target.closest('.tGrip') || e.target.closest('button')) return;
      el.setPointerCapture(e.pointerId);
      el.style.zIndex = ++this.tileZ;
      const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop;
      const mv = ev => {
        el.style.left = Math.max(-el.offsetWidth + 50, Math.min($('#stage').clientWidth - 40, ox + ev.clientX - sx)) + 'px';
        el.style.top = Math.max(0, Math.min($('#stage').clientHeight - 30, oy + ev.clientY - sy)) + 'px';
      };
      const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
      el.addEventListener('pointermove', mv);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
   
    const grip = el.querySelector('.tGrip');
    grip.addEventListener('pointerdown', e => {
      e.stopPropagation();
      grip.setPointerCapture(e.pointerId);
      const sx = e.clientX, ow = el.offsetWidth;
      const mv = ev => { el.style.width = Math.max(110, Math.min(560, ow + ev.clientX - sx)) + 'px'; };
      const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); };
      grip.addEventListener('pointermove', mv);
      grip.addEventListener('pointerup', up);
    });
    return el;
  }

  #showAvatar(el, name) {
    const v = el.querySelector('video'), a = el.querySelector('.tAvatar');
    v.style.display = 'none'; a.hidden = false;
    a.textContent = (name || '?').trim().charAt(0).toUpperCase() || '?';
  }
}
