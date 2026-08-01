
import { $, rid, toast, fmtT } from './utils.js';
import { hideGestureButton } from './gesture.js';

export class UIManager {
  constructor(state, { media, network, player, sync, subtitles, tiles }) {
    this.state = state;
    this.media = media;
    this.network = network;
    this.player = player;
    this.sync = sync;
    this.subtitles = subtitles;
    this.tiles = tiles;
    this.seeking = false;
  }

  init() {
    
    this.player.onChange = () => this.setPlayBtn();
    this.sync.onStateApplied = st => {
      const sel = $('#speedSel'); if (sel) sel.value = String(st.rate || 1);
      this.setPlayBtn();
    };

    this.#wireLobby();
    this.#wireTopbar();
    this.#wirePlayerControls();
    this.#wireGesture();
  }

 
  #wireLobby() {
    $('#createBtn').onclick = () => this.#start(true);
    $('#joinBtn').onclick = () => this.#start(false);
    $('#codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') this.#start(false); });
  }

  async #start(asHost) {
    const S = this.state;
    const name = $('#nameInput').value.trim();
    if (!name) { toast('Önce adını yaz'); $('#nameInput').focus(); return; }
    const code = asHost ? rid(5) : $('#codeInput').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!asHost && code.length < 4) { toast('Oda kodunu gir'); $('#codeInput').focus(); return; }
    S.name = name; S.mode = $('#camOnly').checked ? 'camera' : 'full';
    S.room = code; S.isHost = asHost;
    $('#lobbyBtns').style.display = 'none'; $('#lobbyWait').style.display = 'block'; $('#lobbyErr').textContent = '';
    await this.media.init();
    this.network.connect();
  }

  
  showLobbyFail(msg) {
    $('#lobbyBtns').style.display = '';
    $('#lobbyWait').style.display = 'none';
    $('#lobbyErr').textContent = msg;
  }

  
  enterRoom() {
    const S = this.state;
    if (S.joined) { this.refreshRoster(); return; }
    S.joined = true;
    $('#lobby').style.display = 'none';
    $('#topbar').hidden = false; $('#stage').hidden = false;
    $('#roomCode').textContent = S.room;
    if (S.mode === 'camera') {
      $('#playerWrap').style.display = 'none';
      $('#camModeNote').style.display = 'flex';
    }
    this.tiles.makeSelfTile();
    this.refreshRoster();
    this.#startRenderLoop();
    this.sync.startDriftCorrection();
    toast(S.isHost ? 'Oda kuruldu. Kodu paylaş: ' + S.room : 'Odaya katıldın', 4500);
    window.addEventListener('beforeunload', () => this.network.disconnect());
  }

  refreshRoster() {
    const S = this.state;
    const box = $('#peers'); box.innerHTML = '';
    Object.keys(S.roster).forEach(id => {
      const p = S.roster[id];
      const c = document.createElement('span');
      c.className = 'peerChip' + (id === S.myId ? ' me' : '');
      c.textContent = p.name + (p.mode === 'camera' ? ' 📱' : '') + (id === S.myId ? ' (sen)' : '');
      box.appendChild(c);
    });
    this.tiles.pruneAndRename(S.roster);
  }

 
  #wireTopbar() {
    $('#micBtn').onclick = () => {
      const enabled = this.media.toggleMic();
      if (enabled !== null) $('#micBtn').classList.toggle('off', !enabled);
    };
    $('#camBtn').onclick = () => {
      const enabled = this.media.toggleCam();
      if (enabled !== null) $('#camBtn').classList.toggle('off', !enabled);
    };
    $('#copyBtn').onclick = async () => {
      const room = this.state.room;
      try { await navigator.clipboard.writeText(room); toast('Oda kodu kopyalandı: ' + room, 2200); }
      catch (e) { prompt('Oda kodu:', room); }
    };
    $('#syncBtn').onclick = () => { this.sync.emitNow(); toast('Herkes senin zamanına senkronlandı', 2200); };
    $('#leaveBtn').onclick = () => {
      this.network.disconnect();
      this.media.stopAll();
      location.reload();
    };
  }

  
  #wirePlayerControls() {
    $('#loadBtn').onclick = () => {
      const u = $('#urlInput').value.trim();
      if (!u) { toast('Önce bir video bağlantısı yapıştır'); return; }
      this.player.load(u, false);
    };
    $('#urlInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#loadBtn').click(); });

    $('#vidFile').addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) this.player.loadLocalFile(f);
      e.target.value = '';
    });
    $('#pickLocalBtn').onclick = () => $('#vidFile').click();

    $('#playBtn').onclick = () => {
      if (this.player.isPlaying()) this.player.pause(); else this.player.play();
      this.sync.localAction();
      this.setPlayBtn();
    };
    $('#back10').onclick = () => { this.player.seek(this.player.getTime() - 10); this.sync.localAction(); };
    $('#fwd10').onclick = () => { this.player.seek(this.player.getTime() + 10); this.sync.localAction(); };
    $('#speedSel').onchange = e => {
      this.player.setRate(parseFloat(e.target.value));
      this.sync.localAction();
      toast('Hız: ' + e.target.value + '×', 1500);
    };

    const bar = $('#seekBar');
    bar.addEventListener('pointerdown', () => { this.seeking = true; });
    bar.addEventListener('pointerup', () => { this.seeking = false; });
    bar.addEventListener('input', e => {
      const d = this.player.getDuration(); if (!d) return;
      $('#timeLbl').textContent = fmtT(d * e.target.value / 1000) + ' / ' + fmtT(d);
    });
    bar.addEventListener('change', e => {
      const d = this.player.getDuration(); if (!d) return;
      this.seeking = false;
      this.player.seek(d * e.target.value / 1000);
      this.sync.localAction();
    });

    $('#subFile').addEventListener('change', async e => {
      const f = e.target.files[0];
      if (f) await this.subtitles.load(f);
      e.target.value = '';
    });
    $('#subToggle').onclick = () => this.subtitles.toggle();
  }

  setPlayBtn() { $('#playBtn').textContent = this.player.isPlaying() ? '⏸' : '▶'; }

  #uiTime() {
    if (this.state.mode === 'camera') return;
    const bar = $('#seekBar');
    const d = this.player.getDuration(), t = this.player.getTime();
    if (!this.seeking) {
      bar.value = d ? Math.round(t / d * 1000) : 0;
      $('#timeLbl').textContent = fmtT(t) + ' / ' + fmtT(d);
    }
  }

  #startRenderLoop() {
    setInterval(() => { this.#uiTime(); this.setPlayBtn(); }, 600);
  }

  
  #wireGesture() {
    $('#gestureBtn').onclick = () => {
      hideGestureButton();
      this.tiles.resumeAll();
      if (this.state.lastState && this.state.lastState.playing) this.player.play();
    };
  }
}
