"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.YouTube = void 0;
const tslib_1 = require("tslib");
const stopwatch_1 = require("@sapphire/stopwatch");
const jaro_winkler_1 = require("@skyra/jaro-winkler");
const ffmpeg_static_1 = tslib_1.__importDefault(require("ffmpeg-static"));
const fluent_ffmpeg_1 = tslib_1.__importDefault(require("fluent-ffmpeg"));
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const sanitize_filename_1 = tslib_1.__importDefault(require("sanitize-filename"));
const undici_1 = require("undici");
const youtubei_js_1 = require("youtubei.js");
const ytdl_core_1 = tslib_1.__importStar(require("ytdl-core"));
const fs_utils_1 = require("./fs-utils");
fluent_ffmpeg_1.default.setFfmpegPath(ffmpeg_static_1.default.replace("app.asar", "app.asar.unpacked"));
const reject = [
    "(live)",
    "music video",
    "karaoke version",
    "instrumental version"
];
class YouTube {
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
        Object.defineProperty(this, "downloaded", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "stopwatch", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new stopwatch_1.Stopwatch().stop()
        });
        Object.defineProperty(this, "codec", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "bitrate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "downloadMaybe", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        this.daunroda = daunroda;
        this.downloaded = 0;
        this.codec =
            this.daunroda.config.audioContainer === "mp3"
                ? "libmp3lame"
                : this.daunroda.config.audioContainer === "flac"
                    ? "flac"
                    : "libmp3lame";
        this.bitrate =
            !isNaN(this.daunroda.config.audioBitrate) &&
                this.daunroda.config.audioBitrate <= 320
                ? `${this.daunroda.config.audioBitrate}k`
                : "320k";
    }
    async init() {
        this.client = await youtubei_js_1.Innertube.create({});
        return this;
    }
    async processSongs(processed) {
        for (const playlist of processed) {
            await (0, fs_utils_1.ensureDir)((0, node_path_1.join)(this.daunroda.config.downloadTo, (0, sanitize_filename_1.default)(playlist.name)));
            const promises = [];
            const notFound = new Set();
            const songs = [];
            this.downloaded = 0;
            this.daunroda.emit("progress", {
                playlist: playlist.name,
                downloaded: this.downloaded,
                total: playlist.songs.length,
                finished: false
            });
            this.stopwatch.restart();
            for (const song of playlist.songs) {
                if (!song.track)
                    continue;
                const { track } = song;
                const name = `${track.artists[0].name} - ${track.name}`;
                const destination = (0, node_path_1.join)(this.daunroda.config.downloadTo, (0, sanitize_filename_1.default)(playlist.name), `${(0, sanitize_filename_1.default)(name)}.${this.daunroda.config.audioContainer}`);
                // Skip searching and downloading if song is already downloaded
                if (await (0, fs_utils_1.exists)(destination)) {
                    songs.push(name);
                    this.daunroda.emit("debug", `"${name}" is already downloaded.`);
                    this.downloaded += 1;
                    this.daunroda.emit("progress", {
                        playlist: playlist.name,
                        downloaded: this.downloaded,
                        total: playlist.songs.length,
                        finished: false
                    });
                    continue;
                }
                this.daunroda.emit("debug", `Searching for "${name}"...`);
                const searched = await this.client.music.search(name, { type: "song" });
                const result = searched?.results?.length
                    ? // Find the first result that doesn't get filtered out
                        await searched.results.map((res) => this.filter(res, name, destination, track, playlist.name, notFound))[0]
                    : null;
                if (!result) {
                    this.daunroda.emit("debug", `Not found "${name}"`);
                    continue;
                }
                songs.push(name);
                // We push all the promises into an array to be able to concurrently download songs
                const promise = this.downloadSong(result.id, destination, track, playlist.name, playlist.songs.length);
                promises.push(promise);
            }
            await Promise.all(promises);
            this.daunroda.emit("progress", {
                playlist: playlist.name,
                downloaded: this.downloaded,
                total: playlist.songs.length,
                finished: true
            });
            this.stopwatch.stop();
            const m3u8 = songs
                .map((name) => (0, node_path_1.join)((0, sanitize_filename_1.default)(playlist.name), `${(0, sanitize_filename_1.default)(name)}.${this.daunroda.config.audioContainer}`))
                .join("\n");
            await (0, promises_1.writeFile)((0, node_path_1.join)(this.daunroda.config.downloadTo, `${(0, sanitize_filename_1.default)(playlist.name)}.m3u8`), m3u8);
            const songsNotFound = notFound.size;
            this.daunroda.emit("info", songsNotFound
                ? `Found and downloaded ${playlist.songs.length - songsNotFound}/${playlist.songs.length} songs from the "${playlist.name}" playlist in ${this.stopwatch.toString()}!`
                : `Found and downloaded all songs (${playlist.songs.length}) from the "${playlist.name}" playlist in ${this.stopwatch.toString()}!`);
        }
        for (const download of this.downloadMaybe) {
            if (await (0, fs_utils_1.exists)(download.destination))
                continue;
            this.daunroda.emit("downloadMaybe", download);
        }
    }
    async downloadSingle(download) {
        this.daunroda.emit("progress", {
            playlist: download.name,
            downloaded: 0,
            total: 1,
            finished: false
        });
        await this.downloadSong(download.res.id, download.destination, download.track, download.playlist, 1);
        // Add newly downloaded song to playlist file
        let m3u8 = await (0, promises_1.readFile)((0, node_path_1.join)(this.daunroda.config.downloadTo, `${(0, sanitize_filename_1.default)(download.playlist)}.m3u8`)).then((buff) => buff.toString());
        m3u8 += `${(0, sanitize_filename_1.default)(download.playlist)}/${(0, sanitize_filename_1.default)(download.name)}.${this.daunroda.config.audioContainer}`;
        await (0, promises_1.writeFile)((0, node_path_1.join)(this.daunroda.config.downloadTo, `${(0, sanitize_filename_1.default)(download.playlist)}.m3u8`), m3u8);
        this.daunroda.emit("progress", {
            playlist: download.name,
            downloaded: 1,
            total: 1,
            finished: true
        });
    }
    /** Downloads a song from YouTube and adds the metadata from Spotify to it */
    async downloadSong(id, destination, track, playlist, total) {
        const audioStream = (0, ytdl_core_1.default)(`https://youtu.be/${id}`, {
            quality: "highestaudio",
            highWaterMark: 1 << 25
        });
        audioStream.on("error", (err) => this.daunroda.emit("error", `There was an error whilst downloading "${track.name}" (YouTube ID: ${id}): ${err.message}`));
        const coverUrl = track.album.images[0]?.url;
        let tmpImg = null;
        if (coverUrl) {
            const coverStream = await (0, undici_1.request)(coverUrl).then((res) => res.body.arrayBuffer());
            tmpImg = (0, node_path_1.join)((0, node_os_1.tmpdir)(), `${(Math.random() + 1).toString(36)}.jpg`);
            await (0, promises_1.writeFile)(tmpImg, Buffer.from(coverStream));
        }
        const tmpAudio = (0, node_path_1.join)((0, node_os_1.tmpdir)(), `${(Math.random() + 1).toString(36)}.${this.daunroda.config.audioContainer}`);
        await this.saveTmpAudio(audioStream, tmpAudio);
        return new Promise((resolve, reject) => {
            try {
                const ff = (0, fluent_ffmpeg_1.default)(tmpAudio).outputOptions("-acodec", this.codec, "-b:a", this.bitrate, "-id3v2_version", "3", "-metadata", `album=${track.album.name}`, "-metadata", `title=${track.name}`, "-metadata", `artist=${track.artists.map((artist) => artist.name).join(", ")}`, "-metadata", `album_artist=${track.album.artists
                    .map((artist) => artist.name)
                    .join(", ")}`);
                if (tmpImg)
                    ff.input(tmpImg).outputOptions("-map", "0:0", "-map", "1:0", "-disposition:v", "attached_pic", "-metadata:s:v", 'title="Album cover"', "-metadata:s:v", 'comment="Cover (Front)"');
                ff.saveToFile(destination);
                ff.on("error", reject);
                ff.on("end", async () => {
                    if (tmpImg)
                        await (0, promises_1.rm)(tmpImg);
                    await (0, promises_1.rm)(tmpAudio);
                    this.downloaded += 1;
                    this.daunroda.emit("progress", {
                        playlist,
                        downloaded: this.downloaded,
                        total,
                        finished: false
                    });
                    resolve();
                });
            }
            catch (err) {
                this.daunroda.emit("error", err);
            }
        });
    }
    /** Saves the audio stream from YouTube to a temporary file */
    saveTmpAudio(audioStream, destination) {
        return new Promise((resolve) => {
            const ff = (0, fluent_ffmpeg_1.default)(audioStream)
                .outputOptions("-acodec", this.codec, "-b:a", this.bitrate)
                .saveToFile(destination);
            ff.on("end", resolve);
        });
    }
    /** Filter out unwanted results */
    async filter(res, name, destination, track, playlist, notFound) {
        if (!notFound.has(name))
            notFound.add(name);
        // Don't download age restricted songs or if you can't fet info on something
        const info = await (0, ytdl_core_1.getBasicInfo)(`https://youtu.be/${res.id}`).catch(() => null);
        if (!info || info.videoDetails.age_restricted)
            return false;
        // If none of the artist names intersect or the titles aren't similar enough then reject this entry
        if (!res.artists?.some((artist) => artist.name.toLowerCase() === track.artists[0].name.toLowerCase()) ||
            (0, jaro_winkler_1.jaroWinkler)(res.title ?? res.name ?? "", track.name) < 0.85) {
            return null;
        }
        const diff = this.difference(track.duration_ms / 1000, res.duration?.seconds ?? 0);
        if (!this.daunroda.config.allowForbiddenWording &&
            (reject.some((rej) => res.title && res.title.toLowerCase().includes(rej)) ||
                reject.some((rej) => res.name && res.name.toLowerCase().includes(rej)))) {
            this.downloadMaybe.push({
                res,
                name,
                destination,
                track,
                playlist,
                reason: "the name on YouTube contains forbidden wording"
            });
            return null;
        }
        if (Math.round(Number(diff)) >
            (isNaN(this.daunroda.config.difference)
                ? 10
                : this.daunroda.config.difference)) {
            this.daunroda.emit("debug", `The difference in duration for ${name} is too big (${diff}%)`);
            this.downloadMaybe.push({
                res,
                name,
                destination,
                track,
                playlist,
                reason: `a big difference in duration (${diff}%, threshold is ${isNaN(this.daunroda.config.difference)
                    ? 10
                    : this.daunroda.config.difference}%)`
            });
            return null;
        }
        // Remove the song from the not found set, since it was found by another entry
        if (notFound.has(name))
            notFound.delete(name);
        return res;
    }
    difference(a, b) {
        return ((100 * Math.abs(a - b)) / ((a + b) / 2)).toFixed(2);
    }
}
exports.YouTube = YouTube;
//# sourceMappingURL=YouTube.js.map