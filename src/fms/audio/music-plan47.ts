/** Original RandomMusicPlayer (level0 instance): musicList in serialized order, firstTrackToPlay
 * "Land of Heroes", recentTracksToAvoid 3, minInterval 4 s, maxInterval 10 s, bgmVolume 1.
 * PlayMusicWithIntervals (0x478130):
 * - plays firstTrackToPlay once, then picks at once (no interval after it);
 * - pick: when availableIndices is empty, RefreshAvailableIndices = all indices except the
 *   recently played queue; a random entry is played, removed from availableIndices and
 *   enqueued; the queue drops its oldest entry once it holds more than recentTracksToAvoid;
 * - after each picked track: WaitForSecondsRealtime(Random.Range(min, max)), then pick again.
 * The first track is not enqueued, so the first shuffle may play it again. */
export const MUSIC_LIST47=['deplasa-pe','final-stance','guild-of-adventurers','land-of-heroes','wonders-and-mysteries-alt'] as const;
export type MusicTrack47=typeof MUSIC_LIST47[number];
export const FIRST_TRACK47:MusicTrack47='land-of-heroes';
export const RECENT_TRACKS_TO_AVOID47=3,MIN_INTERVAL47=4,MAX_INTERVAL47=10,BGM_VOLUME47=1;

export type MusicStep47={track:MusicTrack47;waitSeconds:number};
export class MusicPlan47{
  private first=true;private picked=false;
  private readonly recent:number[]=[];private available:number[]=MUSIC_LIST47.map((_,i)=>i);
  constructor(private readonly random:()=>number=Math.random){}
  /** The next track and the real-time wait before it starts. */
  next():MusicStep47{
    if(this.first){this.first=false;return {track:FIRST_TRACK47,waitSeconds:0};}
    const waitSeconds=this.picked?MIN_INTERVAL47+(MAX_INTERVAL47-MIN_INTERVAL47)*this.random():0;
    if(this.available.length===0)this.available=MUSIC_LIST47.map((_,i)=>i).filter(i=>!this.recent.includes(i));
    const at=Math.min(this.available.length-1,Math.floor(this.random()*this.available.length)),index=this.available[at];
    this.available.splice(at,1);this.recent.push(index);if(this.recent.length>RECENT_TRACKS_TO_AVOID47)this.recent.shift();
    this.picked=true;
    return {track:MUSIC_LIST47[index],waitSeconds};
  }
}
