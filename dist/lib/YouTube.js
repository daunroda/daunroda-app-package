"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.YouTube = void 0;
const tslib_1 = require("tslib");
const stopwatch_1 = require("@sapphire/stopwatch");
const jaro_winkler_1 = require("@skyra/jaro-winkler");
const ffmpeg_static_1 = tslib_1.__importDefault(require("ffmpeg-static"));
const fluent_ffmpeg_1 = tslib_1.__importDefault(require("fluent-ffmpeg"));
const promises_1 = require("fs/promises");
const os_1 = require("os");
const path_1 = require("path");
const sanitize_filename_1 = tslib_1.__importDefault(require("sanitize-filename"));
const undici_1 = require("undici");
const youtubei_js_1 = require("youtubei.js");
const ytdl_core_1 = tslib_1.__importStar(require("ytdl-core"));
const fs_utils_1 = require("./fs-utils");
fluent_ffmpeg_1.default.setFfmpegPath(ffmpeg_static_1.default);
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
        var _a;
        for (const playlist of processed) {
            await (0, fs_utils_1.ensureDir)((0, path_1.join)(this.daunroda.config.downloadTo, (0, sanitize_filename_1.default)(playlist.name)));
            const promises = [];
            const notFound = new Set();
            const songs = [];
            let downloaded = 0;
            this.daunroda.emit("progress", {
                playlist: playlist.name,
                downloaded,
                total: playlist.songs.length,
                finished: false
            });
            this.stopwatch.restart();
            for (const song of playlist.songs) {
                if (!song.track)
                    continue;
                const { track } = song;
                const name = `${track.artists[0].name} - ${track.name}`;
                const destination = (0, path_1.join)(this.daunroda.config.downloadTo, (0, sanitize_filename_1.default)(playlist.name), `${(0, sanitize_filename_1.default)(name)}.${this.daunroda.config.audioContainer}`);
                // Skip searching and downloading if song is already downloaded
                if (await (0, fs_utils_1.exists)(destination)) {
                    songs.push(name);
                    this.daunroda.emit("debug", `"${name}" is already downloaded.`);
                    downloaded++;
                    this.daunroda.emit("progress", {
                        playlist: playlist.name,
                        downloaded,
                        total: playlist.songs.length,
                        finished: false
                    });
                    continue;
                }
                this.daunroda.emit("debug", `Searching for "${name}"...`);
                const searched = await this.client.music.search(name, { type: "song" });
                const result = ((_a = searched === null || searched === void 0 ? void 0 : searched.results) === null || _a === void 0 ? void 0 : _a.length)
                    ? // Find the first result that doesn't get filtered out
                        await searched.results.map((res) => this.filter(res, name, destination, track, playlist.name, notFound))[0]
                    : null;
                if (!result) {
                    this.daunroda.emit("debug", `Not found "${name}"`);
                    continue;
                }
                songs.push(name);
                // We push all the promises into an array to be able to concurrently download songs
                const promise = this.downloadSong(result.id, destination, track, playlist.name, playlist.songs.length, downloaded);
                promises.push(promise);
            }
            await Promise.all(promises);
            this.daunroda.emit("progress", {
                playlist: playlist.name,
                downloaded,
                total: playlist.songs.length,
                finished: true
            });
            this.stopwatch.stop();
            const m3u8 = songs
                .map((name) => (0, path_1.join)((0, sanitize_filename_1.default)(playlist.name), `${(0, sanitize_filename_1.default)(name)}.${this.daunroda.config.audioContainer}`))
                .join("\n");
            await (0, promises_1.writeFile)((0, path_1.join)(this.daunroda.config.downloadTo, `${(0, sanitize_filename_1.default)(playlist.name)}.m3u8`), m3u8);
            const songsNotFound = notFound.size;
            this.daunroda.emit("info", songsNotFound
                ? `Found and downloaded ${playlist.songs.length - songsNotFound}/${playlist.songs.length} songs from the "${playlist.name}" playlist in ${this.stopwatch.toString()}!\n`
                : `Found and downloaded all songs (${playlist.songs.length}) from the "${playlist.name}" playlist in ${this.stopwatch.toString()}!\n`);
        }
        for (const download of this.downloadMaybe) {
            if (await (0, fs_utils_1.exists)(download.destination))
                continue;
            // const { answer }: { answer: boolean } = await inquirer.prompt({
            //   type: "confirm",
            //   name: "answer",
            //   default: false,
            //   message: `\nFound ${download.name} on YouTube (named ${
            //     download.res.name ?? download.res.title ?? ""
            //   }) but it was rejected because of ${
            //     download.reason
            //   }. Do you want to download this https://music.youtube.com/watch?v=${
            //     download.res.id
            //   } anyway?`
            // });
            //   if (answer) {
            //     await this.downloadSong(
            //       download.res.id!,
            //       download.destination,
            //       download.track,
            //       download.playlist,
            //       1,
            //       0
            //     );
            //     // Add newly downloaded song to playlist file
            //     let m3u8 = await readFile(
            //       join(
            //         this.daunroda.config.downloadTo,
            //         `${sanitize(download.playlist)}.m3u8`
            //       )
            //     ).then((buff) => buff.toString());
            //     m3u8 += `\n${sanitize(download.playlist)}/${sanitize(download.name)}.${
            //       this.daunroda.config.audioContainer
            //     }`;
            //     await writeFile(
            //       join(
            //         this.daunroda.config.downloadTo,
            //         `${sanitize(download.playlist)}.m3u8`
            //       ),
            //       m3u8
            //     );
            //     this.daunroda.emit("progress", {
            //       playlist: download.playlist,
            //       downloaded: 1,
            //       total: 1,
            //       finished: true
            //     });
            //   }
        }
    }
    /** Downloads a song from YouTube and adds the metadata from Spotify to it */
    async downloadSong(id, destination, track, playlist, total, downloaded) {
        var _a;
        const audioStream = (0, ytdl_core_1.default)(`https://youtu.be/${id}`, {
            quality: "highestaudio",
            highWaterMark: 1 << 25
        });
        audioStream.on("error", (err) => this.daunroda.emit("error", `There was an error whilst downloading "${track.name}" (YouTube ID: ${id}): ${err.message}`));
        const coverUrl = (_a = track.album.images[0]) === null || _a === void 0 ? void 0 : _a.url;
        let tmpImg = null;
        if (coverUrl) {
            const coverStream = await (0, undici_1.request)(coverUrl).then((res) => res.body.arrayBuffer());
            tmpImg = (0, path_1.join)((0, os_1.tmpdir)(), `${(Math.random() + 1).toString(36)}.jpg`);
            await (0, promises_1.writeFile)(tmpImg, Buffer.from(coverStream));
        }
        const tmpAudio = (0, path_1.join)((0, os_1.tmpdir)(), `${(Math.random() + 1).toString(36)}.${this.daunroda.config.audioContainer}`);
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
                    this.daunroda.emit("progress", {
                        playlist,
                        downloaded,
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
        var _a, _b, _c, _d, _e;
        if (!notFound.has(name))
            notFound.add(name);
        // Don't download age restricted songs or if you can't fet info on something
        const info = await (0, ytdl_core_1.getBasicInfo)(`https://youtu.be/${res.id}`).catch(() => null);
        if (!info || info.videoDetails.age_restricted)
            return false;
        // If none of the artist names intersect or the titles aren't similar enough then reject this entry
        if (!((_a = res.artists) === null || _a === void 0 ? void 0 : _a.some((artist) => artist.name.toLowerCase() === track.artists[0].name.toLowerCase())) ||
            (0, jaro_winkler_1.jaroWinkler)((_c = (_b = res.title) !== null && _b !== void 0 ? _b : res.name) !== null && _c !== void 0 ? _c : "", track.name) < 0.85) {
            return null;
        }
        const diff = this.difference(track.duration_ms / 1000, (_e = (_d = res.duration) === null || _d === void 0 ? void 0 : _d.seconds) !== null && _e !== void 0 ? _e : 0);
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