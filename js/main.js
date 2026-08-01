

import { AppState } from './state.js';
import { MediaManager } from './media.js';
import { NetworkManager } from './network.js';
import { VideoPlayer } from './player.js';
import { TileManager } from './tiles.js';
import { SubtitleManager } from './subtitles.js';
import { SyncEngine } from './sync.js';
import { UIManager } from './ui.js';

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
