

import { $, toast, fmtMB, escapeHtml } from './utils.js?v=7';
import { showGestureButton } from './gesture.js?v=7';

export class VideoPlayer {
  constructor(state) {
    this.state = state;
    this.sync = null; 

    this.vid = $('#vid');
    this.yt = null;
    this.ytReady = false;
    this.ytApiPromise = null;
    this.hls = null;
    this.hlsLibPromise = null;
    this.localObjUrl = null;
    this.subUrl = null;

    this.onChange = () => {}; 

    this.#wireVideoEvents();
  }

  bind({ sync }) {
    this.sync = sync;
  }

  
  usingYT() { return this.state.cur.kind === 'yt' && this.yt && this.ytReady; }

  isPlaying() {
    if (this.usingYT()) { try { return this.yt.getPlayerState() === 1; } catch (e) { return false; } }
    return !this.vid.paused && !this.vid.ended && this.vid.readyState > 1;
  }
  getTime() {
    if (this.usingYT()) { try { return this.yt.getCurrentTime() || 0; } catch (e) { return 0; } }
    return this.vid.currentTime || 0;
  }
  getDuration() {
    if (this.usingYT()) { try { return this.yt.getDuration() || 0; } catch (e) { return 0; } }
    return isFinite(this.vid.duration) ? this.vid.duration : 0;
  }
  getRate() {
    if (this.usingYT()) { try { return this.yt.getPlaybackRate() || 1; } catch (e) { return 1; } }
    return this.vid.playbackRate || 1;
  }
  setRate(r) {
    if (this.usingYT()) { try { this.yt.setPlaybackRate(r); } catch (e) {} }
    else this.vid.playbackRate = r;
  }
  play() {
    if (this.usingYT()) { try { this.yt.playVideo(); } catch (e) {} }
    else this.vid.play().catch(() => showGestureButton());
  }
  pause() {
    if (this.usingYT()) { try { this.yt.pauseVideo(); } catch (e) {} }
    else this.vid.pause();
  }
  seek(t) {
    if (this.usingYT()) { try { this.yt.seekTo(Math.max(0, t), true); } catch (e) {} }
    else { try { this.vid.currentTime = Math.max(0, t); } catch (e) {} }
  }

  
  detectKind(url) {
    const yt = url.match(/(?:youtube\.com\/(?:watch\?[^#]*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/);
    if (yt) return { kind: 'yt', id: yt[1] };
    if (/\.m3u8($|[?#])/i.test(url)) return { kind: 'hls' };
    return { kind: 'file' };
  }

  async load(url, fromRemote) {
    const S = this.state;
    const d = this.detectKind(url);
    S.cur = { url, kind: d.kind };
    $('#urlInput').value = url;
    $('#playerMsg').textContent = '';
    this.#destroyYT(); this.#destroyHls(); this.#clearLocal();
    this.vid.pause(); this.vid.removeAttribute('src'); this.vid.load();

    if (d.kind === 'yt') {
      this.vid.style.display = 'none';
      $('#ytWrap').style.display = 'block';
      await this.#setupYT(d.id);
    } else {
      $('#ytWrap').style.display = 'none';
      this.vid.style.display = 'block';
      if (d.kind === 'hls' && !this.vid.canPlayType('application/vnd.apple.mpegurl')) {
        const ok = await this.#loadHlsLib();
        if (ok && window.Hls && Hls.isSupported()) {
          this.hls = new Hls();
          this.hls.loadSource(url);
          this.hls.attachMedia(this.vid);
          this.hls.on(Hls.Events.ERROR, (ev, data) => { if (data && data.fatal) $('#playerMsg').textContent = 'Yayın açılamadı. Bağlantı doğrudan bir m3u8 dosyasına gitmeli.'; });
        } else {
          $('#playerMsg').textContent = 'HLS bu tarayıcıda oynatılamadı.';
        }
      } else {
        this.vid.src = url;
      }
      if (S.sub.vtt) this.applySubtitleTrack();
      this.vid.addEventListener('error', () => this.#onVidError(), { once: true });
    }
    if (!fromRemote) this.sync.emitNow({ playing: false, time: 0, rate: 1 });
    this.onChange();
  }

  #onVidError() {
    const S = this.state;
    if (S.cur.kind === 'file' && !S.cur.local) {
      $('#playerMsg').innerHTML = 'Bu bağlantı doğrudan açılamadı — dizi/film siteleri video dosyası değil sayfa linki verir, tarayıcı güvenliği bunu engeller.<br><b>Çözüm:</b> Filmi kendi sekmende aç, üstteki <b>🖥 Ekran paylaş</b> ile o sekmeyi sesiyle birlikte paylaş.<br>Alternatif: İki taraf da bölümü indirip "Dosya aç" ile seçsin — otomatik senkronlanır.';
    }
  }

 
  #loadYTApi() {
    if (window.YT && window.YT.Player) return Promise.resolve(true);
    if (this.ytApiPromise) return this.ytApiPromise;
    this.ytApiPromise = new Promise(res => {
      const t = setTimeout(() => res(!!(window.YT && window.YT.Player)), 8000);
      window.onYouTubeIframeAPIReady = () => { clearTimeout(t); res(true); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { clearTimeout(t); res(false); };
      document.head.appendChild(s);
    });
    return this.ytApiPromise;
  }

  async #setupYT(videoId) {
    const ok = await this.#loadYTApi();
    if (!ok) { $('#playerMsg').textContent = 'YouTube oynatıcısı yüklenemedi (bu ortamda engelli olabilir). Sayfayı kendi adresinde açmayı ya da mp4/m3u8 bağlantısı kullanmayı dene.'; return; }
    await new Promise(res => {
      let done = false;
      const fin = () => { if (!done) { done = true; res(); } };
      this.yt = new YT.Player('ytBox', {
        videoId: videoId, width: '100%', height: '100%',
        playerVars: { rel: 0, playsinline: 1, controls: 1 },
        events: {
          onReady: () => { this.ytReady = true; fin(); },
          onStateChange: e => {
            if (!this.state.applying && (e.data === 1 || e.data === 2)) this.sync.localAction();
            this.onChange();
          }
        }
      });
      setTimeout(fin, 7000);
    });
  }

  #destroyYT() {
    try { if (this.yt) this.yt.destroy(); } catch (e) {}
    this.yt = null; this.ytReady = false;
    $('#ytWrap').innerHTML = '<div id="ytBox"></div>';
  }

  
  #loadHlsLib() {
    if (window.Hls) return Promise.resolve(true);
    if (this.hlsLibPromise) return this.hlsLibPromise;
    this.hlsLibPromise = new Promise(res => {
      const t = setTimeout(() => res(!!window.Hls), 9000);
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.12/hls.min.js';
      s.onload = () => { clearTimeout(t); res(true); };
      s.onerror = () => { clearTimeout(t); res(false); };
      document.head.appendChild(s);
    });
    return this.hlsLibPromise;
  }

  #destroyHls() {
    try { if (this.hls) this.hls.destroy(); } catch (e) {}
    this.hls = null;
  }

  
  localIdOf(f) { return 'local:' + f.name + ':' + f.size; }

  loadLocalFile(f) {
    const S = this.state;
    this.#destroyYT(); this.#destroyHls();
    $('#ytWrap').style.display = 'none';
    this.vid.style.display = 'block';
    if (this.localObjUrl) URL.revokeObjectURL(this.localObjUrl);
    this.localObjUrl = URL.createObjectURL(f);
    S.cur = { url: this.localIdOf(f), kind: 'file', local: true, fname: f.name, fsize: f.size };
    this.vid.src = this.localObjUrl;
    $('#playerMsg').textContent = '';
    $('#urlInput').value = '📁 ' + f.name;
    if (S.sub.vtt) this.applySubtitleTrack();
    this.hideLocalBanner();

    if (S.pendingLocal) {
      const match = S.pendingLocal === S.cur.url;
      if (!match) toast('Seçtiğin dosya karşı taraftakiyle birebir aynı görünmüyor (ad/boyut farklı). Senkron yine zamana göre çalışır ama görüntü kayabilir.', 7000);
      S.pendingLocal = null;
      if (S.lastState && S.lastState.by !== S.myId) {
        if (!match) S.lastState.url = S.cur.url; 
        this.sync.applyState(S.lastState);
      }
    } else {
      this.sync.emitNow({ playing: false, time: 0, rate: 1 });
    }
    this.onChange();
    toast('Dosya açıldı: ' + f.name, 2500);
  }

  showLocalBanner(st) {
    $('#localBannerTxt').innerHTML =
      '<b>' + escapeHtml(this.state.nameOf(st.by)) + '</b> bir video dosyası açtı:<br><b>' +
      escapeHtml(st.fname || 'video') + '</b>' + (st.fsize ? ' (' + fmtMB(st.fsize) + ')' : '') +
      '<br>Birlikte izlemek için aynı dosyayı bu cihazdan da seç — sonrası otomatik senkron.';
    $('#localBanner').hidden = false;
  }
  hideLocalBanner() { $('#localBanner').hidden = true; }

  #clearLocal() {
    if (this.localObjUrl) { URL.revokeObjectURL(this.localObjUrl); this.localObjUrl = null; }
    this.state.pendingLocal = null;
    this.hideLocalBanner();
  }

  
  applySubtitleTrack() {
    const S = this.state;
    Array.prototype.forEach.call(this.vid.querySelectorAll('track'), t => t.remove());
    if (this.subUrl) { URL.revokeObjectURL(this.subUrl); this.subUrl = null; }
    if (!S.sub.vtt) return;
    this.subUrl = URL.createObjectURL(new Blob([S.sub.vtt], { type: 'text/vtt' }));
    const tr = document.createElement('track');
    tr.kind = 'subtitles'; tr.label = S.sub.name || 'Altyazı'; tr.srclang = 'tr'; tr.src = this.subUrl; tr.default = true;
    this.vid.appendChild(tr);
    setTimeout(() => this.setSubtitleVisibility(S.sub.on), 250);
  }

  setSubtitleVisibility(on) {
    try { if (this.vid.textTracks[0]) this.vid.textTracks[0].mode = on ? 'showing' : 'hidden'; } catch (e) {}
  }

  
  #wireVideoEvents() {
    ['play', 'pause', 'seeked', 'ratechange'].forEach(ev =>
      this.vid.addEventListener(ev, () => {
        if (!this.state.applying) this.sync.localAction();
        this.onChange();
      })
    );
  }
}
