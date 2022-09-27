/// <reference types="node" />
import { EventEmitter } from "stream";
export declare class Daunroda extends EventEmitter {
    config: Config;
    constructor(config: Config);
    run(): Promise<void>;
}
export interface Config {
    /** Spotify application Client ID */
    spotifyClientID: string;
    /** Spotify application Client Secret */
    spotifySecret: string;
    /** The folder to download the songs to */
    downloadTo: string;
    /** The audio container (extension) of the files (mp3 or flac) */
    audioContainer: "mp3" | "flac";
    /** The audio bitrate of mp3 files (anywhere from 0 to 320) */
    audioBitrate: number;
    /** The percentage number used to check against the difference between the Spotify version and YouTube Music version in duration (if higher than this it will be skipped from auto-downloading) */
    difference: number;
    /** Whether to automatically allow the downloading of songs that contain forbidden wording on YouTube (such as live, karaoke, instrumental etc), if disabled you will be prompted if you want to download anyway or not) */
    allowForbiddenWording: boolean;
    /** An array of Spotify playlist IDs */
    playlists: string[];
    accessToken: string;
}
//# sourceMappingURL=Daunroda.d.ts.map