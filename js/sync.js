

export class SyncEngine {
  constructor(state, network, player) {
    this.state = state;
    this.network = network;
    this.player = player;
    this.emitTimer = null;
    this.onStateApplied = () => {}; 
  }

 
  localAction() {
    const S = this.state;
    if (S.applying || !S.joined || S.mode === 'camera') return;
    clearTimeout(this.emitTimer);
    this.emitTimer = setTimeout(() => this.emitNow(), 200);
  }

 
  emitNow(over) {
    const S = this.state;
    if (!S.joined) return;
    const st = Object.assign({
      url: S.cur.url, kind: S.cur.kind,
      fname: S.cur.fname || null, fsize: S.cur.fsize || null,
      playing: this.player.isPlaying(), time: this.player.getTime(), rate: this.player.getRate(),
      at: Date.now(), by: S.myId
    }, over || {});
    S.lastState = st;
    this.network.send({ t: 'state', st });
  }

  
  onState(st) {
    const S = this.state;
    if (!st || st.by === S.myId) return;
    S.lastState = st;
    this.applyState(st);
  }

  async applyState(st) {
    const S = this.state;
    if (S.mode === 'camera') return;
    if (st.url && st.url.indexOf('local:') === 0 && st.url !== S.cur.url) {
      S.pendingLocal = st.url;
      this.player.showLocalBanner(st);
      return;
    }
    S.applying = true;
    try {
      if (st.url && st.url.indexOf('local:') !== 0 && st.url !== S.cur.url) await this.player.load(st.url, true);
      if (Math.abs(this.player.getRate() - (st.rate || 1)) > 0.01) this.player.setRate(st.rate || 1);
      this.#syncClock(st, 1.2);
      if (st.playing && !this.player.isPlaying()) this.player.play();
      if (!st.playing && this.player.isPlaying()) this.player.pause();
    } catch (e) { console.warn(e); }
    setTimeout(() => { S.applying = false; }, 700);
    this.onStateApplied(st);
  }

  #syncClock(st, tol) {
    const exp = st.playing ? st.time + (Date.now() - st.at) / 1000 * (st.rate || 1) : st.time;
    if (Math.abs(this.player.getTime() - exp) > tol) this.player.seek(exp + (st.playing ? 0.25 : 0));
  }

  
  startDriftCorrection() {
    setInterval(() => {
      const S = this.state;
      if (!S.lastState || S.lastState.by === S.myId || S.applying || S.mode === 'camera') return;
      if (!S.cur.url || S.lastState.url !== S.cur.url) return;
      S.applying = true;
      this.#syncClock(S.lastState, 3);
      setTimeout(() => { S.applying = false; }, 500);
    }, 4000);
  }
}
