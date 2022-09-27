/// <reference types="spotify-api" />
import type { Daunroda } from "./Daunroda";
export declare class Spotify {
    private client;
    private daunroda;
    constructor(daunroda: Daunroda);
    processPlaylists(ids: string[]): Promise<Processed[]>;
    private getSpotifyTracks;
}
export interface PlaylistObject extends SpotifyApi.PlaylistTrackObject {
    youtube?: string;
}
export interface Processed {
    id: string;
    name: string;
    description: string | null;
    image: string;
    songs: PlaylistObject[];
    url: string;
}
//# sourceMappingURL=Spotify.d.ts.map