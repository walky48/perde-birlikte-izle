

import { toast } from './utils.js?v=7';
import { ROOM_PREFIX } from './state.js?v=7';

export class NetworkManager {
  constructor(state) {
    this.state = state;

    this.peer = null;
    this.hostConn = null;
    this.conns = {};
    this.calls = {};
    this.screenCalls = {};
    this.screenIn = null;

    this.ui = null;
    this.tiles = null;
    this.sync = null;
    this.subtitles = null;
  }

  bind({ ui, tiles, sync, subtitles }) {
    this.ui = ui;
    this.tiles = tiles;
    this.sync = sync;
    this.subtitles = subtitles;
  }

 
  connect() {
    const S = this.state;
    if (typeof Peer === 'undefined') {
      this.#fail('Bağlantı kütüphanesi (PeerJS) yüklenemedi. Bu sayfayı GitHub Pages gibi normal bir web adresinde açman gerekiyor — claude.ai önizlemesinde ağ kısıtlı olabilir.');
      return;
    }
    const id = S.isHost ? ROOM_PREFIX + S.room : undefined;
    this.peer = new Peer(id, { debug: 1 });

    this.peer.on('open', pid => {
      S.myId = pid;
      if (S.isHost) {
        S.roster[S.myId] = { name: S.name, mode: S.mode, cam: S.hasCam, ts: 0 };
        this.ui.enterRoom();
      } else {
        this.#connectHost();
      }
    });

    this.peer.on('error', err => {
      const t = err && err.type;
      if (t === 'unavailable-id') this.#fail('Bu oda kodu şu an kullanımda. "Oda kur" ile tekrar dene.');
      else if (t === 'peer-unavailable') this.#fail('Oda bulunamadı. Kod doğru mu? Odayı kuran kişinin sayfayı açık tutması gerekiyor.');
      else if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') {
        if (!S.joined) this.#fail('Sinyal sunucusuna ulaşılamadı. Bu dosyayı claude.ai önizlemesi yerine kendi adresinde (ör. GitHub Pages) açmayı dene.');
        else toast('Sunucu bağlantısı koptu, yeniden deneniyor…');
      } else console.warn('peer error', err);
    });

    this.peer.on('disconnected', () => { try { if (this.peer && !this.peer.destroyed) this.peer.reconnect(); } catch (e) {} });

    this.peer.on('connection', dc => {
      if (!S.isHost) { try { dc.close(); } catch (e) {} return; }
      this.#wireGuest(dc);
    });

    this.peer.on('call', call => {
      if (call.metadata && call.metadata.screen) { this.#wireScreenIn(call); return; }
      if (this.calls[call.peer]) { try { this.calls[call.peer].close(); } catch (e) {} }
      call.answer(S.local);
      this.#wireCall(call);
    });
  }

  disconnect() {
    try { this.peer && this.peer.destroy(); } catch (e) {}
  }

  #fail(msg) {
    try { if (this.peer) this.peer.destroy(); } catch (e) {}
    this.peer = null;
    this.ui.showLobbyFail(msg);
  }

  #connectHost() {
    const S = this.state;
    const dc = this.peer.connect(ROOM_PREFIX + S.room, { reliable: true, metadata: { name: S.name } });
    this.hostConn = dc;
    let opened = false;
    dc.on('open', () => { opened = true; dc.send({ t: 'hello', name: S.name, mode: S.mode, cam: S.hasCam }); });
    dc.on('data', d => this.#onData(d, 'HOST'));
    dc.on('close', () => {
      if (S.joined) { toast('Oda kurucusu ayrıldı — oda kapandı. Sayfa yenileniyor…', 5000); setTimeout(() => location.reload(), 2600); }
      else this.#fail('Odaya bağlanılamadı.');
    });
    dc.on('error', e => console.warn('dc error', e));
    setTimeout(() => { if (!opened && !S.joined && this.peer) this.#fail('Odaya bağlanılamadı. Kodu ve interneti kontrol et.'); }, 15000);
  }

  #wireGuest(dc) {
    const S = this.state;
    this.conns[dc.peer] = dc;
    dc.on('data', d => this.#onData(d, dc.peer));
    dc.on('close', () => {
      delete this.conns[dc.peer];
      if (S.roster[dc.peer]) {
        const nm = S.roster[dc.peer].name;
        delete S.roster[dc.peer];
        this.#broadcast({ t: 'roster', roster: S.roster });
        this.ui.refreshRoster();
        this.#dropPeerMedia(dc.peer);
        toast(nm + ' ayrıldı');
      }
    });
    dc.on('error', e => console.warn('dc error', e));
  }

 
  #broadcast(obj, exceptId) {
    Object.keys(this.conns).forEach(id => {
      if (id === exceptId) return;
      try { if (this.conns[id].open) this.conns[id].send(obj); } catch (e) {}
    });
  }

  
  send(obj) {
    if (this.state.isHost) this.#broadcast(obj);
    else if (this.hostConn && this.hostConn.open) { try { this.hostConn.send(obj); } catch (e) {} }
  }

  
  sendTo(id, obj) {
    const c = this.conns[id];
    if (!c) return;
    try { c.send(obj); } catch (e) {}
  }


  #onData(d, from) {
    const S = this.state;
    if (!d || !d.t) return;
    switch (d.t) {
      case 'hello': {
        if (!S.isHost) break;
        S.roster[from] = { name: d.name || 'Misafir', mode: d.mode || 'full', cam: !!d.cam, ts: Date.now() };
        try {
          this.conns[from].send({ t: 'welcome', roster: S.roster, state: S.lastState });
          if (S.sub.vtt) this.subtitles.sendTo(from);
        } catch (e) {}
        this.#broadcast({ t: 'roster', roster: S.roster }, from);
        this.ui.refreshRoster();
        this.syncScreenCalls();
        toast(S.roster[from].name + ' katıldı' + (S.roster[from].mode === 'camera' ? ' (kamera modu)' : ''));
        break;
      }
      case 'welcome': {
        S.roster = d.roster || {};
        this.ui.enterRoom();
        this.#callNewPeers();
        if (d.state) this.sync.onState(d.state);
        break;
      }
      case 'roster': {
        S.roster = d.roster || {};
        this.ui.refreshRoster();
        this.#callNewPeers();
        this.syncScreenCalls();
        break;
      }
      case 'screen': {
        if (d.by !== S.myId) this.ui.onScreenInfo(d);
        if (S.isHost) this.#broadcast(d, from);
        break;
      }
      case 'state': {
        this.sync.onState(d.st);
        if (S.isHost) this.#broadcast({ t: 'state', st: d.st }, from);
        break;
      }
      case 'sub': {
        this.subtitles.receive(d);
        if (S.isHost) this.#broadcast(d, from);
        break;
      }
    }
  }

  
  #callNewPeers() {
    const S = this.state;
    const mine = S.roster[S.myId] ? S.roster[S.myId].ts : Infinity;
    Object.keys(S.roster).forEach(id => {
      if (id === S.myId || this.calls[id]) return;
      if (S.roster[id].ts < mine) this.#makeCall(id);
    });
  }

  #makeCall(id) {
    const S = this.state;
    try {
      const call = this.peer.call(id, S.local, { metadata: { name: S.name } });
      if (call) this.#wireCall(call);
    } catch (e) { console.warn('call fail', e); }
  }

  #wireCall(call) {
    const S = this.state;
    const id = call.peer;
    this.calls[id] = call;
    call.on('stream', st => this.tiles.attachRemote(id, st));
    call.on('close', () => {
      if (this.calls[id] === call) { delete this.calls[id]; this.tiles.removeTile(id); }
      setTimeout(() => { if (S.roster[id] && !this.calls[id]) this.#callNewPeers(); }, 3000);
    });
    call.on('error', e => console.warn('call error', e));
  }

  #dropPeerMedia(id) {
    if (this.calls[id]) { try { this.calls[id].close(); } catch (e) {} delete this.calls[id]; }
    if (this.screenCalls[id]) { try { this.screenCalls[id].close(); } catch (e) {} delete this.screenCalls[id]; }
    if (this.screenIn && this.screenIn.id === id) {
      try { this.screenIn.call.close(); } catch (e) {}
      this.screenIn = null;
      this.ui.hideScreenStream();
    }
    this.tiles.removeTile(id);
  }

  startScreen() {
    this.send({ t: 'screen', on: true, by: this.state.myId, name: this.state.name });
    this.syncScreenCalls();
  }

  stopScreen() {
    Object.keys(this.screenCalls).forEach(id => { try { this.screenCalls[id].close(); } catch (e) {} });
    this.screenCalls = {};
    this.send({ t: 'screen', on: false, by: this.state.myId });
  }

  syncScreenCalls() {
    const S = this.state;
    if (!S.screen || !this.peer) return;
    Object.keys(S.roster).forEach(id => {
      if (id === S.myId || this.screenCalls[id]) return;
      try {
        const call = this.peer.call(id, S.screen, { metadata: { screen: true, name: S.name } });
        if (!call) return;
        this.screenCalls[id] = call;
        call.on('close', () => { if (this.screenCalls[id] === call) delete this.screenCalls[id]; });
        call.on('error', e => console.warn('screen call error', e));
      } catch (e) { console.warn('screen call fail', e); }
    });
  }

  #wireScreenIn(call) {
    try { call.answer(); } catch (e) {}
    if (this.screenIn) { try { this.screenIn.call.close(); } catch (e) {} }
    this.screenIn = { id: call.peer, call };
    call.on('stream', st => this.ui.showScreenStream(call.peer, st, call.metadata && call.metadata.name));
    call.on('close', () => {
      if (this.screenIn && this.screenIn.call === call) { this.screenIn = null; this.ui.hideScreenStream(); }
    });
    call.on('error', e => console.warn('screen call error', e));
  }
}
