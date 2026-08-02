

import { $ } from './utils.js?v=4';
import { showGestureButton } from './gesture.js?v=4';

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
      this.#autoCrop(v);
    };
    if (v.videoWidth) apply(); else v.addEventListener('loadedmetadata', apply, { once: true });
  }

  // Bazı kamera sürücüleri kareyi düz renkli bantla dolduruyor (görüntü + alt/üst boş şerit
  // aynı karede geliyor). Bu bant CSS ile kaldırılamaz — pikselleri analiz edip kırpmak gerekiyor.
  // Kamera açılışta karanlık kare gönderebildiği için tek seferlik tespit yetmiyor; sürekli
  // örnekleyip bandı bulunca kırpıyor, bant değişince (dönme, çözünürlük) kendini düzeltiyor.
  #autoCrop(v) {
    if (v._fitTimer) return;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const FLAT = 5;
    v._fit = { top: 0, bot: 0 };

    const tick = () => {
      if (!v.isConnected) { clearInterval(v._fitTimer); v._fitTimer = null; return; }
      try {
        if (!v.videoWidth || !v.videoHeight || v.readyState < 2) return;
        const w = 64, h = Math.max(12, Math.round(w * v.videoHeight / v.videoWidth));
        c.width = w; c.height = h;
        ctx.drawImage(v, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        const rowVar = new Array(h);
        for (let y = 0; y < h; y++) {
          let rs = 0, gs = 0, bs = 0;
          for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; rs += data[i]; gs += data[i + 1]; bs += data[i + 2]; }
          const ra = rs / w, ga = gs / w, ba = bs / w;
          let dev = 0;
          for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; dev += Math.abs(data[i] - ra) + Math.abs(data[i + 1] - ga) + Math.abs(data[i + 2] - ba); }
          rowVar[y] = dev / w;
        }
        let bot = 0; while (bot < h && rowVar[h - 1 - bot] < FLAT) bot++;
        let top = 0; while (top < h - bot && rowVar[top] < FLAT) top++;
        let fTop = top / h, fBot = bot / h;
        if (fTop < 0.08) fTop = 0;
        if (fBot < 0.08) fBot = 0;
        if (fTop + fBot > 0.75) return; // kare neredeyse tamamen boş — kamera daha açılmamış, bekle

        // görünür orta kısımda gerçek görüntü olduğundan emin ol, yoksa karar verme
        let midSum = 0, midN = 0;
        for (let y = top; y < h - bot; y++) { midSum += rowVar[y]; midN++; }
        if (!midN || midSum / midN < FLAT + 2) return;

        const prev = v._fit;
        if (Math.abs(prev.top - fTop) < 0.03 && Math.abs(prev.bot - fBot) < 0.03) return;
        v._fit = { top: fTop, bot: fBot };

        if (!fTop && !fBot) {
          v.style.objectFit = '';
          v.style.objectPosition = '';
          v.style.aspectRatio = v.videoWidth + ' / ' + v.videoHeight;
          return;
        }
        const keep = 1 - fTop - fBot;
        v.style.objectFit = 'cover';
        v.style.objectPosition = '50% ' + Math.round(fTop / (fTop + fBot) * 100) + '%';
        v.style.aspectRatio = v.videoWidth + ' / ' + Math.max(1, Math.round(v.videoHeight * keep));
      } catch (e) {}
    };
    v._fitTimer = setInterval(tick, 1000);
    setTimeout(tick, 300);
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
