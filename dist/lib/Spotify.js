"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Spotify = void 0;
const tslib_1 = require("tslib");
const spotify_web_api_node_1 = tslib_1.__importDefault(require("spotify-web-api-node"));
class Spotify {
    constructor(daunroda) {
        Object.defineProperty(this, "client", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "daunroda", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.daunroda = daunroda;
        this.client = new spotify_web_api_node_1.default({
            clientId: daunroda.config.spotifyClientID,
            clientSecret: daunroda.config.spotifySecret
        });
    }
    async init() {
        this.client.setAccessToken(this.daunroda.config.accessToken);
        return this;
    }
    async processPlaylists(ids) {
        const processed = [];
        for (const id of ids) {
            const playlist = await this.client.getPlaylist(id).catch(() => {
                this.daunroda.emit("error", `Playlist with the ID of ${id} not found.`);
            });
            if (!playlist)
                continue;
            const { name } = playlist.body;
            const { description } = playlist.body;
            const image = playlist.body.images[0].url;
            const url = playlist.body.external_urls.spotify;
            const songs = await this.getSpotifyTracks(id);
            processed.push({ id, name, description, image, songs, url });
        }
        return processed;
    }
    async getSpotifyTracks(id) {
        const songs = [];
        let next = true;
        let offset = 0;
        while (next) {
            const { body: { items, next: nextURL } } = await this.client.getPlaylistTracks(id, { offset });
            if (!nextURL)
                next = false;
            else if (nextURL)
                offset = Number(nextURL.split("offset=")[1].split("&")[0]);
            songs.push(...items);
        }
        return songs;
    }
}
exports.Spotify = Spotify;
//# sourceMappingURL=Spotify.js.map