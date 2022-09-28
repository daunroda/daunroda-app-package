/// <reference types="spotify-api" />
import type { Daunroda } from "./Daunroda";
import type { Processed } from "./Spotify";
export declare class YouTube {
    private client;
    private daunroda;
    private downloaded;
    private stopwatch;
    private codec;
    private bitrate;
    private downloadMaybe;
    constructor(daunroda: Daunroda);
    init(): Promise<this>;
    processSongs(processed: Processed[]): Promise<void>;
    /** Downloads a song from YouTube and adds the metadata from Spotify to it */
    downloadSong(id: string, destination: string, track: SpotifyApi.TrackObjectFull, playlist: string, total: number): Promise<void>;
    /** Saves the audio stream from YouTube to a temporary file */
    private saveTmpAudio;
    /** Filter out unwanted results */
    private filter;
    private difference;
}
//# sourceMappingURL=YouTube.d.ts.map