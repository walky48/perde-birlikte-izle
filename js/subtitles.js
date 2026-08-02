

import { $, toast, srtToVtt } from './utils.js?v=7';

const SUB_CHUNK = 60000;

export class SubtitleManager {
  constructor(state, network, player) {
    this.state = state;
    this.network = network;
    this.player = player;
    this.subRx = {}; 
  }

 
  async load(file) {
    const S = this.state;
    try {
      const txt = await file.text();
      const hasBom = txt.charCodeAt(0) === 0xFEFF;
      const clean = hasBom ? txt.slice(1) : txt;
      const vtt = /^\s*WEBVTT/.test(clean) ? clean : srtToVtt(txt);
      S.sub = { ver: Date.now(), name: file.name, vtt, on: true };
      if (S.cur.kind === 'yt') toast('Not: YouTube kendi CC menüsünü kullanır; bu altyazı mp4/m3u8 videolarında görünür', 5000);
      this.player.applySubtitleTrack();
      this.#syncToggleButton();
      this.#broadcast();
      toast('Altyazı yüklendi ve odaya gönderildi: ' + file.name, 3500);
    } catch (err) {
      toast('Altyazı okunamadı');
    }
  }

 
  toggle() {
    const S = this.state;
    S.sub.on = !S.sub.on;
    this.player.setSubtitleVisibility(S.sub.on);
    this.#syncToggleButton();
    toast(S.sub.on ? 'Altyazı açık' : 'Altyazı kapalı', 1500);
  }

  
  sendTo(id) { this.#chunks().forEach(m => this.network.sendTo(id, m)); }

 
  receive(d) {
    const S = this.state;
    if (!d.ver || d.ver === S.sub.ver) return;
    const buf = this.subRx[d.ver] || (this.subRx[d.ver] = { parts: [], total: d.total, name: d.name, got: 0 });
    if (buf.parts[d.seq] == null) { buf.parts[d.seq] = d.part; buf.got++; }
    if (buf.got >= buf.total) {
      S.sub = { ver: d.ver, name: buf.name, vtt: buf.parts.join(''), on: S.sub.on };
      delete this.subRx[d.ver];
      if (S.mode !== 'camera' && S.cur.kind !== 'yt') this.player.applySubtitleTrack();
      toast('Altyazı alındı: ' + buf.name, 3000);
    }
  }

  #chunks() {
    const S = this.state;
    const parts = [];
    for (let i = 0; i < S.sub.vtt.length; i += SUB_CHUNK) parts.push(S.sub.vtt.slice(i, i + SUB_CHUNK));
    return parts.map((p, i) => ({ t: 'sub', ver: S.sub.ver, name: S.sub.name, seq: i, total: parts.length, part: p }));
  }
  #broadcast() { this.#chunks().forEach(m => this.network.send(m)); }

  #syncToggleButton() {
    $('#subToggle').classList.toggle('off', !this.state.sub.on);
  }
}
