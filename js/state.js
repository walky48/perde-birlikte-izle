

export const ROOM_PREFIX = 'perde26-';

export class AppState {
  constructor() {
    
    this.myId = null;
    this.isHost = false;
    this.room = '';
    this.name = '';
    this.mode = 'full'; 
    this.joined = false;

   
    this.roster = {};   

    
    this.local = null;  
    this.hasCam = false;
    this.hasMic = false;

    
    this.cur = { url: '', kind: '' };
    this.lastState = null;
    this.applying = false;
    this.pendingLocal = null;

    
    this.sub = { ver: 0, name: '', vtt: '', on: true };
  }

  nameOf(id) {
    return (this.roster[id] && this.roster[id].name) || 'Misafir';
  }
}
