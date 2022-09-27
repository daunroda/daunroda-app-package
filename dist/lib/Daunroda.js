"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Daunroda = void 0;
const tslib_1 = require("tslib");
const stream_1 = require("stream");
const fs_utils_1 = require("./fs-utils");
const Spotify_1 = require("./Spotify");
const YouTube_1 = require("./YouTube");
class Daunroda extends stream_1.EventEmitter {
    constructor(config) {
        super();
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.config = config;
    }
    run() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const spotify = yield new Spotify_1.Spotify(this);
            const youtube = yield new YouTube_1.YouTube(this).init();
            if (this.config.audioContainer !== "mp3" &&
                this.config.audioContainer !== "flac")
                throw new Error('Only "mp3" and "flac" are valid audio containers.');
            yield (0, fs_utils_1.ensureDir)(this.config.downloadTo);
            const totalPlaylists = `${this.config.playlists.length} ${this.config.playlists.length > 1 ? "playlists" : "playlist"}`;
            this.emit("info", `Processing ${totalPlaylists} on Spotify...`);
            const processed = yield spotify.processPlaylists(this.config.playlists);
            let fetchedTracks = 0;
            processed.map((val) => (fetchedTracks += val.songs.length));
            this.emit("info", `Fetched ${`${fetchedTracks} tracks`} across ${totalPlaylists} on Spotify!`);
            this.emit("info", `Searching and downloading songs from YouTube Music...\n`);
            yield youtube.processSongs(processed);
            this.emit("info", `Success! Songs downloaded to ${this.config.downloadTo}.`);
        });
    }
}
exports.Daunroda = Daunroda;
//# sourceMappingURL=Daunroda.js.map