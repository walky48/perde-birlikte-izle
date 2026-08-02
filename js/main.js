

import { AppState } from './state.js?v=7';
import { MediaManager } from './media.js?v=7';
import { NetworkManager } from './network.js?v=7';
import { VideoPlayer } from './player.js?v=7';
import { TileManager } from './tiles.js?v=7';
import { SubtitleManager } from './subtitles.js?v=7';
import { SyncEngine } from './sync.js?v=7';
import { UIManager } from './ui.js?v=7';

const state = new AppState();
const media = new MediaManager(state);
const network = new NetworkManager(state);
const player = new VideoPlayer(state);
const tiles = new TileManager(state);
const subtitles = new SubtitleManager(state, network, player);
const sync = new SyncEngine(state, network, player);


player.bind({ sync });

const ui = new UIManager(state, { media, network, player, sync, subtitles, tiles });
network.bind({ ui, tiles, sync, subtitles });

ui.init();
