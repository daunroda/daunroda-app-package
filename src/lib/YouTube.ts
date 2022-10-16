import { Stopwatch } from "@sapphire/stopwatch";
import { jaroWinkler } from "@skyra/jaro-winkler";
import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import sanitize from "sanitize-filename";
import { request } from "undici";
import { Innertube } from "youtubei.js";
import type MusicResponsiveListItem from "youtubei.js/dist/src/parser/classes/MusicResponsiveListItem";
import ytdl, { getBasicInfo } from "ytdl-core";
import type { Daunroda } from "./Daunroda";
import { ensureDir, exists } from "./fs-utils";
import type { Processed } from "./Spotify";

ffmpeg.setFfmpegPath(ffmpegPath!.replace("app.asar", "app.asar.unpacked"));

const reject = [
  "(live)",
  "music video",
  "karaoke version",
  "instrumental version"
];

export class YouTube {
  private client!: Innertube;
  private daunroda: Daunroda;
  private downloaded: number;
  private stopwatch = new Stopwatch().stop();
  private codec: string;
  private bitrate: string;
  private downloadMaybe: {
    res: MusicResponsiveListItem;
    name: string;
    destination: string;
    track: SpotifyApi.TrackObjectFull;
    playlist: string;
    reason: string;
  }[] = [];

  public constructor(daunroda: Daunroda) {
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

  public async init() {
    this.client = await Innertube.create({});

    return this;
  }

  public async processSongs(processed: Processed[]) {
    for (const playlist of processed) {
      await ensureDir(
        join(this.daunroda.config.downloadTo, sanitize(playlist.name))
      );
      const promises = [];

      const notFound: Set<string> = new Set();
      const songs: string[] = [];

      this.downloaded = 0;

      this.daunroda.emit("progress", {
        playlist: playlist.name,
        downloaded: this.downloaded,
        total: playlist.songs.length,
        finished: false
      });

      this.stopwatch.restart();
      for (const song of playlist.songs) {
        if (!song.track) continue;
        const { track } = song;
        const name = `${track.artists[0].name} - ${track.name}`;

        const destination = join(
          this.daunroda.config.downloadTo,
          sanitize(playlist.name),
          `${sanitize(name)}.${this.daunroda.config.audioContainer}`
        );

        // Skip searching and downloading if song is already downloaded
        if (await exists(destination)) {
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
            await searched.results.map((res) =>
              this.filter(
                res,
                name,
                destination,
                track,
                playlist.name,
                notFound
              )
            )[0]
          : null;

        if (!result) {
          this.daunroda.emit("debug", `Not found "${name}"`);
          continue;
        }

        songs.push(name);

        // We push all the promises into an array to be able to concurrently download songs
        const promise = this.downloadSong(
          result.id!,
          destination,
          track,
          playlist.name,
          playlist.songs.length
        );
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
        .map((name) =>
          join(
            sanitize(playlist.name),
            `${sanitize(name)}.${this.daunroda.config.audioContainer}`
          )
        )
        .join("\n");
      await writeFile(
        join(
          this.daunroda.config.downloadTo,
          `${sanitize(playlist.name)}.m3u8`
        ),
        m3u8
      );

      const songsNotFound = notFound.size;
      this.daunroda.emit(
        "info",
        songsNotFound
          ? `Found and downloaded ${playlist.songs.length - songsNotFound}/${
              playlist.songs.length
            } songs from the "${
              playlist.name
            }" playlist in ${this.stopwatch.toString()}!`
          : `Found and downloaded all songs (${
              playlist.songs.length
            }) from the "${
              playlist.name
            }" playlist in ${this.stopwatch.toString()}!`
      );
    }

    for (const download of this.downloadMaybe) {
      if (await exists(download.destination)) continue;
      this.daunroda.emit("downloadMaybe", download);
    }
  }

  public async downloadSingle(download: {
    res: MusicResponsiveListItem;
    name: string;
    destination: string;
    track: SpotifyApi.TrackObjectFull;
    playlist: string;
    reason: string;
  }) {
    this.daunroda.emit("progress", {
      playlist: download.name,
      downloaded: 0,
      total: 1,
      finished: false
    });

    await this.downloadSong(
      download.res.id!,
      download.destination,
      download.track,
      download.playlist,
      1,
      false
    );

    // Add newly downloaded song to playlist file
    let m3u8 = await readFile(
      join(
        this.daunroda.config.downloadTo,
        `${sanitize(download.playlist)}.m3u8`
      )
    ).then((buff) => buff.toString());
    m3u8 += `\n${sanitize(download.playlist)}/${sanitize(download.name)}.${
      this.daunroda.config.audioContainer
    }`;
    await writeFile(
      join(
        this.daunroda.config.downloadTo,
        `${sanitize(download.playlist)}.m3u8`
      ),
      m3u8
    );

    this.daunroda.emit("progress", {
      playlist: download.name,
      downloaded: 1,
      total: 1,
      finished: true
    });
  }

  /** Downloads a song from YouTube and adds the metadata from Spotify to it */
  public async downloadSong(
    id: string,
    destination: string,
    track: SpotifyApi.TrackObjectFull,
    playlist: string,
    total: number,
    emitProgress?: boolean
  ) {
    emitProgress = emitProgress ?? true;

    const audioStream = ytdl(`https://youtu.be/${id}`, {
      quality: "highestaudio",
      highWaterMark: 1 << 25
    });

    audioStream.on("error", (err: { message: string }) =>
      this.daunroda.emit(
        "error",
        `There was an error whilst downloading "${track.name}" (YouTube ID: ${id}): ${err.message}`
      )
    );

    const coverUrl = track.album.images[0]?.url;
    let tmpImg: string | null = null;

    if (coverUrl) {
      const coverStream = await request(coverUrl).then((res) =>
        res.body.arrayBuffer()
      );

      tmpImg = join(tmpdir(), `${(Math.random() + 1).toString(36)}.jpg`);
      await writeFile(tmpImg, Buffer.from(coverStream));
    }

    const tmpAudio = join(
      tmpdir(),
      `${(Math.random() + 1).toString(36)}.${
        this.daunroda.config.audioContainer
      }`
    );

    await this.saveTmpAudio(audioStream, tmpAudio);

    return new Promise<void>((resolve, reject) => {
      try {
        const ff = ffmpeg(tmpAudio).outputOptions(
          "-acodec",
          this.codec,
          "-b:a",
          this.bitrate,
          "-id3v2_version",
          "3",
          "-metadata",
          `album=${track.album.name}`,
          "-metadata",
          `title=${track.name}`,
          "-metadata",
          `artist=${track.artists.map((artist) => artist.name).join(", ")}`,
          "-metadata",
          `album_artist=${track.album.artists
            .map((artist) => artist.name)
            .join(", ")}`
        );
        if (tmpImg)
          ff.input(tmpImg).outputOptions(
            "-map",
            "0:0",
            "-map",
            "1:0",
            "-disposition:v",
            "attached_pic",
            "-metadata:s:v",
            'title="Album cover"',
            "-metadata:s:v",
            'comment="Cover (Front)"'
          );

        ff.saveToFile(destination);

        ff.on("error", reject);
        ff.on("end", async () => {
          if (tmpImg) await rm(tmpImg);
          await rm(tmpAudio);
          this.downloaded += 1;
          if (emitProgress) {
            this.daunroda.emit("progress", {
              playlist,
              downloaded: this.downloaded,
              total,
              finished: false
            });
          }
          resolve();
        });
      } catch (err) {
        this.daunroda.emit("error", err);
      }
    });
  }

  /** Saves the audio stream from YouTube to a temporary file */
  private saveTmpAudio(audioStream: Readable, destination: string) {
    return new Promise((resolve) => {
      const ff = ffmpeg(audioStream)
        .outputOptions("-acodec", this.codec, "-b:a", this.bitrate)
        .saveToFile(destination);
      ff.on("end", resolve);
    });
  }

  /** Filter out unwanted results */
  private async filter(
    res: MusicResponsiveListItem,
    name: string,
    destination: string,
    track: SpotifyApi.TrackObjectFull,
    playlist: string,
    notFound: Set<string>
  ) {
    if (!notFound.has(name)) notFound.add(name);

    // Don't download age restricted songs or if you can't fet info on something
    const info = await getBasicInfo(`https://youtu.be/${res.id}`).catch(
      () => null
    );

    if (!info || info.videoDetails.age_restricted) return false;

    // If none of the artist names intersect or the titles aren't similar enough then reject this entry
    if (
      !res.artists?.some(
        (artist) =>
          artist.name.toLowerCase() === track.artists[0].name.toLowerCase()
      ) ||
      jaroWinkler(res.title ?? res.name ?? "", track.name) < 0.85
    ) {
      return null;
    }

    const diff = this.difference(
      track.duration_ms / 1000,
      res.duration?.seconds ?? 0
    );

    if (
      !this.daunroda.config.allowForbiddenWording &&
      (reject.some(
        (rej) => res.title && res.title.toLowerCase().includes(rej)
      ) ||
        reject.some((rej) => res.name && res.name.toLowerCase().includes(rej)))
    ) {
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

    if (
      Math.round(Number(diff)) >
      (isNaN(this.daunroda.config.difference)
        ? 10
        : this.daunroda.config.difference)
    ) {
      this.daunroda.emit(
        "debug",
        `The difference in duration for ${name} is too big (${diff}%)`
      );

      this.downloadMaybe.push({
        res,
        name,
        destination,
        track,
        playlist,
        reason: `a big difference in duration (${diff}%, threshold is ${
          isNaN(this.daunroda.config.difference)
            ? 10
            : this.daunroda.config.difference
        }%)`
      });

      return null;
    }

    // Remove the song from the not found set, since it was found by another entry
    if (notFound.has(name)) notFound.delete(name);
    return res;
  }

  private difference(a: number, b: number) {
    return ((100 * Math.abs(a - b)) / ((a + b) / 2)).toFixed(2);
  }
}
