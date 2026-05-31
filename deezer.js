const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

const PLAYLISTS = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "deezer-playlists.json"),
    "utf8"
  )
);

const OUTPUT_FILE = path.join(
  __dirname,
  "deezer-song.json"
);

const HISTORY_FILE = path.join(
  __dirname,
  "deezer-history.json"
);

const ALL_HISTORY_FILE = path.join(
  __dirname,
  "deezer-all-history.json"
);

const GLOBAL_FILE = path.join(
  __dirname,
  "deezer-global-history.json"
);

const WORLDWIDE_PLAYLIST =
  "3155776842";

function isTargetArtist(name){

  const artist =
    String(name || "")
    .toLowerCase();

  return (
    artist.includes("jimin")
    ||
    artist === "Jimin"
  );

}

function getMovement(
  previous,
  currentRank
){

  if(!previous){
    return "NE";
  }

  const diff =
    previous.rank
    -
    currentRank;

  if(diff === 0){
    return "=";
  }

  if(diff > 0){
    return `+${diff}`;
  }

  return `${diff}`;

}

async function fetchJSON(url){

  try{

    const res = await fetch(url,{
      headers:{
        "User-Agent":"Mozilla/5.0"
      }
    });

    const text =
      await res.text();

    let cleaned = text;

    if(
      text.startsWith("try")
    ){

      cleaned =
        text
        .replace(
          "try { DZ.api_cb(",
          ""
        )
        .replace(
          "); } catch(e) { console.error(e); }",
          ""
        );

    }

    return JSON.parse(
      cleaned
    );

  }catch(err){

    console.log(
      "❌ Fetch failed:",
      url
    );

    return null;

  }

}

async function fetchPlaylist(
  playlistId
){

  return await fetchJSON(
    `https://api.deezer.com/playlist/${playlistId}`
  );

}

async function globalChanged(){

  const data =
    await fetchPlaylist(
      WORLDWIDE_PLAYLIST
    );

  if(
    !data
    ||
    !data.tracks
    ||
    !data.tracks.data
  ){
    return true;
  }

  const current =
    data.tracks.data
      .slice(0,100)
      .map(
        (
          track,
          index
        )=>
        `${track.id}-${index+1}`
      );
if(
    !fs.existsSync(
      GLOBAL_FILE
    )
  ){

    fs.writeFileSync(
      GLOBAL_FILE,
      JSON.stringify(
        current,
        null,
        2
      )
    );

    console.log(
      "🔥 First run"
    );

    return true;

  }

  const old =
    JSON.parse(
      fs.readFileSync(
        GLOBAL_FILE,
        "utf8"
      )
    );

  const changed =
    JSON.stringify(current)
    !==
    JSON.stringify(old);

  if(changed){

    fs.writeFileSync(
      GLOBAL_FILE,
      JSON.stringify(
        current,
        null,
        2
      )
    );

  }

  return changed;

}

async function buildDeezerChart(){

  const changed =
    await globalChanged();

  if(!changed){

    console.log(
      "⏭ Deezer chart unchanged"
    );

    return;

  }

  console.log(
    "🔥 Worldwide changed — rebuilding..."
  );

  const songs = [];

  let oldHistory = [];

  if(
    fs.existsSync(
      HISTORY_FILE
    )
  ){

    try{

      oldHistory =
        JSON.parse(
          fs.readFileSync(
            HISTORY_FILE,
            "utf8"
          )
        );

    }catch{

      oldHistory = [];

    }

  }

  let allHistory = [];

  if(
    fs.existsSync(
      ALL_HISTORY_FILE
    )
  ){

    try{

      allHistory =
        JSON.parse(
          fs.readFileSync(
            ALL_HISTORY_FILE,
            "utf8"
          )
        );

    }catch{

      allHistory = [];

    }

  }

  const BATCH_SIZE = 5;

  for(
    let i = 0;
    i < PLAYLISTS.length;
    i += BATCH_SIZE
  ){

    const batch =
      PLAYLISTS.slice(
        i,
        i + BATCH_SIZE
      );

    await Promise.all(

      batch.map(
        async playlist => {

          console.log(
            "🌍",
            playlist.country
          );

          const data =
            await fetchPlaylist(
              playlist.playlistId
            );

          if(
            !data
            ||
            !data.tracks
            ||
            !data.tracks.data
          ){
            return;
          }

          const tracks =
            data.tracks.data;

          tracks.forEach(
            (
              track,
              index
            )=>{
const artist =
                track.artist?.name
                || "";

              if(
                !isTargetArtist(
                  artist
                )
              ){
                return;
              }

              const previous =
                oldHistory.find(
                  x =>
                    x.country === playlist.country
                    &&
                    x.track === track.title
                );

              const existedBefore =
                allHistory.find(
                  x =>
                    x.country === playlist.country
                    &&
                    x.track === track.title
                );

              let movement;

              if(previous){

                movement =
                  getMovement(
                    previous,
                    index + 1
                  );

              }else if(existedBefore){

                movement = "RE";

              }else{

                movement = "NE";

              }

              songs.push({

                country:
                  playlist.country,

                rank:
                  index + 1,

                movement:
                  movement,

                peakRank:
                  previous
                    ? Math.min(
                        previous.peakRank
                        || previous.rank,
                        index + 1
                      )
                    : index + 1,

                appearances:
                  previous
                    ? (
                        previous.appearances
                        || 1
                      ) + 1
                    : 1,

                track:
                  track.title,

                artist:
                  artist,

                album:
                  track.album?.title
                  || null,

                image:
                  track.album?.cover_medium
                  || null,

                deezerId:
                  track.id,

                playlistId:
                  playlist.playlistId,

                link:
                  track.link
                  || null

              });

            }
          );

        }
      )

    );

    console.log(
      `✅ Batch ${
        Math.floor(
          i / BATCH_SIZE
        ) + 1
      } finished`
    );

  }
const mergedHistory = [
    ...allHistory
  ];

  songs.forEach(song=>{

    const exists =
      mergedHistory.find(
        x =>
          x.country === song.country
          &&
          x.track === song.track
      );

    if(!exists){

      mergedHistory.push({

        country:
          song.country,

        track:
          song.track

      });

    }

  });

  fs.writeFileSync(
    ALL_HISTORY_FILE,
    JSON.stringify(
      mergedHistory,
      null,
      2
    )
  );

const result = {

  success:true,

  updatedAt:
    new Date()
    .toISOString()
    .split("T")[0],

  countries:
    PLAYLISTS.length,

  songs:
    songs.sort(
      (a,b)=>
      a.rank-b.rank
    )

};

  
  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      result,
      null,
      2
    )
  );
fs.writeFileSync(
    HISTORY_FILE,
    JSON.stringify(
      songs,
      null,
      2
    )
  );

  console.log(
    "✅ Deezer updated"
  );

  console.log(
    "Songs:",
    songs.length
  );

}

buildDeezerChart();
