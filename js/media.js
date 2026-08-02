

import { toast } from './utils.js';

export class MediaManager {
  constructor(state) {
    this.state = state;
  }

  
  async init() {
    const S = this.state;
    if (S.local) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Bu ortamda kamera erişimi yok — izleyici olarak katılıyorsun', 5000);
      S.local = this.#dummyStream();
      return;
    }
    try {
      S.local = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user', resizeMode: 'crop-and-scale' },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      S.hasCam = true; S.hasMic = true;
    } catch (e) {
      try {
        S.local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        S.hasMic = true;
        toast('Kamera bulunamadı — sadece mikrofonla katılıyorsun', 5000);
      } catch (e2) {
        toast('Kamera ve mikrofon alınamadı — izleyici olarak katılıyorsun', 5000);
      }
    }
    if (!S.local) S.local = this.#dummyStream();
  }


  stopAll() {
    try { this.state.local && this.state.local.getTracks().forEach(t => t.stop()); } catch (e) {}
    this.stopScreenShare();
  }

  async startScreenShare() {
    const S = this.state;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      toast('Bu tarayıcıda ekran paylaşımı desteklenmiyor', 4000);
      return null;
    }
    try {
      S.screen = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      if (!S.screen.getAudioTracks().length) {
        toast('Görüntü gidiyor ama ses yok. Film sesi de gitsin istiyorsan paylaşırken "Chrome Sekmesi"ni seç ve "Sesi de paylaş" kutusunu işaretle.', 7000);
      }
      return S.screen;
    } catch (e) { return null; }
  }

  stopScreenShare() {
    const S = this.state;
    try { S.screen && S.screen.getTracks().forEach(t => t.stop()); } catch (e) {}
    S.screen = null;
  }

  toggleMic() {
    const S = this.state;
    const t = S.local && S.local.getAudioTracks()[0];
    if (!t || !S.hasMic) { toast('Kullanılabilir mikrofon yok'); return null; }
    t.enabled = !t.enabled;
    toast(t.enabled ? 'Mikrofon açık' : 'Mikrofon kapalı', 1600);
    return t.enabled;
  }

  toggleCam() {
    const S = this.state;
    const t = S.local && S.local.getVideoTracks()[0];
    if (!t || !S.hasCam) { toast('Kullanılabilir kamera yok'); return null; }
    t.enabled = !t.enabled;
    toast(t.enabled ? 'Kamera açık' : 'Kamera kapalı', 1600);
    return t.enabled;
  }

  #dummyStream() {
    const c = document.createElement('canvas'); c.width = 2; c.height = 2;
    c.getContext('2d').fillRect(0, 0, 2, 2);
    const tracks = c.captureStream(1).getVideoTracks().slice();
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = new AC(); const dst = ac.createMediaStreamDestination();
      const osc = ac.createOscillator(); const g = ac.createGain(); g.gain.value = 0;
      osc.connect(g); g.connect(dst); osc.start();
      tracks.push.apply(tracks, dst.stream.getAudioTracks());
    } catch (e) {}
    return new MediaStream(tracks);
  }
}
