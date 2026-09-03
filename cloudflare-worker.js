/**
 * ZAYAIN — Proxy Unduh Video (Cloudflare Worker)
 * ------------------------------------------------
 * Fungsi worker ini:
 *   1. TikTok/Instagram/Facebook/dst (GET /v1/fetch?url=...) -- proxy
 *      polos ke api.fastsaver.io lewat catch-all generik di bawah,
 *      tambah header CORS.
 *      YouTube (GET /v1/youtube/info?url=...) -- SEKARANG endpoint
 *      khusus (bukan lagi catch-all polos): tetap panggil FastSaverAPI
 *      dulu (wajib), TAPI daftar `formats`-nya dilengkapi otomatis dgn
 *      resolusi video+audio gabungan TAMBAHAN dari RapidAPI kalau ada &
 *      belum ada di daftar FastSaverAPI (lihat tryRapidApiYoutubeFormats
 *      + mergeYoutubeFormats). CATATAN: resolusi setinggi 1080p/4K yg
 *      kelihatan di player YouTube sendiri TETAP tidak akan pernah
 *      muncul di sini selama providernya tidak melakukan merge
 *      video-only+audio-only server-side (butuh ffmpeg, di luar
 *      kemampuan Worker) -- lihat komentar di tryRapidApiYoutubeFormats.
 *      /youtube/info inilah yg dipanggil frontend duluan (2 kredit) utk
 *      nampilin grid pilihan resolusi (lihat videoDlRenderYoutubeInfo di
 *      script.js) SEBELUM user pilih & baru benar2 mengunduh.
 *   2. YouTube unduh sungguhan (POST /v1/youtube/download, `format`
 *      PERSIS sesuai kartu resolusi yg diklik user, mis. "720p"/"audio")
 *      -- coba FastSaverAPI dulu dgn format itu apa adanya (SEKALI, tidak
 *      lagi menebak2 beberapa kandidat spt versi lama, krn frontend
 *      sekarang SUDAH tahu resolusi mana saja yg valid dari /youtube/info
 *      sblmnya), kalau gagal baru fallback otomatis ke RapidAPI "YouTube
 *      Media Downloader" (youtube-media-downloader.p.rapidapi.com,
 *      dicarikan entri dgn resolusi PALING DEKAT ke `format` yg diminta).
 *      Hasil dari RapidAPI dinormalisasi ke bentuk respons yg SAMA dgn
 *      FastSaverAPI ({ ok, type, title, thumbnail_url, duration,
 *      download_url }), supaya script.js di frontend TIDAK PERLU diubah
 *      sama sekali.
 *   3. Kedua API key (FastSaverAPI & RapidAPI) disimpan sbg SECRET di
 *      sisi Worker -- tidak pernah terlihat oleh browser/DevTools user.
 *
 * CARA DEPLOY (gratis, tanpa VPS, ~5 menit):
 *   1. Buka https://dash.cloudflare.com -> daftar akun gratis (kalau
 *      belum punya).
 *   2. Di menu kiri: Workers & Pages -> Create -> Create Worker.
 *   3. Kasih nama bebas, mis. "zayain-videodl" -> Deploy.
 *   4. Klik "Edit code" -> hapus semua isi default -> paste SELURUH isi
 *      file ini -> Save and Deploy.
 *   5. Balik ke halaman Worker -> tab "Settings" -> "Variables and
 *      Secrets" -> Add -> Name: FASTSAVER_API_KEY, Value: (API key
 *      FastSaverAPI Anda, dari dashboard api.fastsaver.io) -> tipe
 *      "Secret" -> Save.
 *   6. Add lagi -> Name: RAPIDAPI_KEY, Value: (X-RapidAPI-Key Anda dari
 *      rapidapi.com, setelah subscribe FREE plan ke API
 *      "YouTube Media Downloader" / host
 *      youtube-media-downloader.p.rapidapi.com) -> tipe "Secret" ->
 *      Save & Deploy.
 *      (Kalau RAPIDAPI_KEY belum diisi, fallback ini otomatis dilewati
 *      -- worker tetap jalan normal spt sebelumnya, cuma tanpa
 *      cadangan utk YouTube.)
 *   7. Salin URL worker-nya (bentuknya seperti
 *      https://zayain-videodl.NAMA-ANDA.workers.dev) -> tempel ke
 *      ZAYAIN: Fast Menu > Unduh Video > ikon gerigi > field "URL
 *      Cloudflare Worker" -> Simpan.
 *   8. OPSIONAL -- proxy "Tanya AI"/"Tool AI" (Gemini/Claude) supaya API
 *      key-nya tidak kelihatan di browser: di Worker yg SAMA, tambah
 *      Secret lagi -> Name: CLAUDE_API_KEY, Value: (API key dari
 *      console.anthropic.com/settings/keys) utk Claude, dan/atau Name:
 *      GEMINI_API_KEY, Value: (API key dari aistudio.google.com/apikey)
 *      utk Gemini -> Save and Deploy. Lalu di ZAYAIN: tombol Tanya AI >
 *      ikon gerigi > field "URL Cloudflare Worker" -> tempel URL worker
 *      yg sama spt langkah 7 -> Simpan. Field API Key di form yg sama
 *      boleh dikosongkan kalau sudah pakai mode Worker ini (key-nya
 *      dibaca worker dari Secret, bukan dari browser).
 *   9. OPSIONAL -- provider "Groq" (gratis, model open-source spt Llama,
 *      cepat) sbg alternatif Gemini/Claude: di Worker yg SAMA, tambah
 *      Secret lagi -> Name: GROQ_API_KEY, Value: (API key dari
 *      console.groq.com/keys, daftar gratis tanpa kartu kredit) -> Save
 *      and Deploy. Lalu di ZAYAIN: Tanya AI > ikon gerigi > pilih
 *      provider "Groq" > field "URL Cloudflare Worker" diisi URL worker
 *      yg sama spt langkah 7 -> Simpan.
 *
 * Free tier Cloudflare Workers: 100.000 request/hari. Free tier
 * RapidAPI "YouTube Media Downloader": cek sendiri kuotanya di halaman
 * API tsb saat subscribe (bisa berubah sewaktu-waktu, bukan wewenang
 * ZAYAIN).
 */

const FASTSAVER_UPSTREAM = 'https://api.fastsaver.io';
const RAPIDAPI_HOST = 'youtube-media-downloader.p.rapidapi.com';
const ANTHROPIC_API_VERSION = '2023-06-01';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ---- Daftar domain CDN yg BOLEH diambilkan lewat /v1/proxy-download di
// bawah -- supaya worker publik ini TIDAK jadi "open proxy" bebas (asal
// terima url APA SAJA dari browser manapun & meneruskannya balik dgn CORS
// terbuka). HANYA domain yg memang dikembalikan sbg `download_url` oleh
// FastSaverAPI (biasanya subdomain api.fastsaver.io sendiri, lihat contoh
// "/v1/tunnel?id=...") atau fallback RapidAPI YouTube (googlevideo.com)
// yg diizinkan. Kalau ada platform lain yg ternyata CDN-nya beda &
// unduhannya gagal (lihat detail error di respons), tambahkan domainnya
// ke daftar ini. ----
const ALLOWED_PROXY_HOST_SUFFIXES = [
  'fastsaver.io',
  'googlevideo.com',   // RapidAPI YouTube fallback
  'fbcdn.net',          // Facebook/Instagram
  'cdninstagram.com',
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'twimg.com',          // X/Twitter
  'pinimg.com',         // Pinterest
  'rutube.ru',
];

function isAllowedProxyUrl(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch (e) { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return ALLOWED_PROXY_HOST_SUFFIXES.some((suf) => host === suf || host.endsWith('.' + suf));
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// Bungkus fetch dgn batas waktu sendiri (AbortController) -- SEBELUM ini
// tryFastSaverYoutube/tryRapidApiYoutube fetch() polos TANPA batas waktu
// sama sekali, jadi kalau salah satu provider lambat/macet, worker bisa
// nunggu TANPA HENTI sebelum sempat coba fallback-nya (itulah "lama
// padahal videonya kecil" yg dilaporkan user -- bukan soal ukuran file,
// tapi provider pertama yg lambat merespons). 15 detik dipilih supaya
// FastSaverAPI + RapidAPI (dicoba berurutan, bukan paralel) masih total
// di bawah batas waktu 40 detik yg ditunggu frontend (lihat timeoutId di
// script.js, listener #videoDlFetchBtn/kartu pending YouTube).
async function fetchWithTimeout(url, options, ms = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// Ambil videoId YouTube dari berbagai bentuk URL (watch?v=, youtu.be/,
// /shorts/, dst).
function extractYoutubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
    if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    return null;
  } catch (e) {
    return null;
  }
}

async function tryFastSaverYoutube(url, format, env) {
  if (!env.FASTSAVER_API_KEY) return { ok: false, detail: 'FASTSAVER_API_KEY belum diatur.' };
  // Diteruskan PERSIS 1x sesuai `format` yg diminta client (kartu
  // resolusi yg diklik user di grid #videoDlResultBox, lihat
  // videoDlResolveYoutubeFormat di script.js) -- BUKAN nebak2 beberapa
  // kandidat lagi spt versi lama (1080p/1080/720p/720/best): sekarang
  // frontend SUDAH tahu persis daftar `format` yg valid utk video ini
  // (dari /youtube/info sblmnya, diteruskan apa adanya lewat proxy
  // generik di bawah -- lihat fetch()), jadi menebak2 di sini cuma
  // buang2 kredit kalau formatnya memang tidak tersedia.
  try {
    const res = await fetchWithTimeout(`${FASTSAVER_UPSTREAM}/v1/youtube/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': env.FASTSAVER_API_KEY },
      body: JSON.stringify({ url, format }),
    });
    return await res.json();
  } catch (err) {
    // AbortError (timeout 15 detik) juga masuk sini -- pesannya dibedakan
    // sedikit supaya kelihatan di log Worker kalau penyebabnya timeout,
    // bukan error lain (mis. API key salah/kuota habis).
    const timedOut = err.name === 'AbortError';
    return { ok: false, detail: timedOut ? 'FastSaverAPI tidak merespons dlm 15 detik (timeout).' : 'FastSaverAPI error: ' + err.message };
  }
}

async function tryRapidApiYoutube(url, format, env) {
  if (!env.RAPIDAPI_KEY) return { ok: false, detail: 'RAPIDAPI_KEY belum diatur -- fallback dilewati.' };
  const videoId = extractYoutubeId(url);
  if (!videoId) return { ok: false, detail: 'Tidak bisa mengenali video ID YouTube dari link ini.' };
  // Angka resolusi dari `format` (mis. "720p" -> 720) -- dipakai di bawah
  // utk MENCARI entri RapidAPI dgn `quality`/`qualityLabel` paling dekat,
  // supaya fallback ini jg menghormati kartu resolusi yg diklik user
  // (bukan cuma selalu ambil kualitas gabungan pertama apa adanya spt
  // sebelumnya). Kalau formatnya "audio" atau angkanya tidak kebaca,
  // logic lama (entri gabungan video+audio pertama) tetap dipakai.
  const wantedRes = format && format !== 'audio' ? parseInt(format, 10) : null;

  try {
    const qs = new URLSearchParams({ videoId, urlAccess: 'normal', videos: 'true', audios: 'true' });
    const res = await fetchWithTimeout(`https://${RAPIDAPI_HOST}/v2/video/details?${qs.toString()}`, {
      headers: {
        'X-RapidAPI-Key': env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    });
    const raw = await res.json();

    // CATATAN: skema respons persis dari API ini belum pernah dicek
    // langsung terhadap key sungguhan, jadi kode di bawah ditulis
    // defensif (banyak fallback nama field). Kalau ternyata bentuknya
    // beda, cek `raw` yg di-log lewat console.warn di bawah (tab "Logs"
    // di dashboard Cloudflare Worker) utk menyesuaikan.
    if (!raw || raw.status === 'ERROR' || (!raw.videos && !raw.title)) {
      console.warn('[UnduhVideo] Respons mentah RapidAPI (gagal/tak dikenali):', JSON.stringify(raw));
      return { ok: false, detail: 'RapidAPI gagal/tidak mengenali video ini.' };
    }

    const videos = Array.isArray(raw.videos) ? raw.videos : (Array.isArray(raw.videos?.items) ? raw.videos.items : []);
    // Fungsi kecil buat baca angka resolusi dari field `quality`/
    // `qualityLabel` yg mana pun tersedia di entri RapidAPI (skema
    // persisnya belum dikonfirmasi, jadi dicoba beberapa nama field).
    const resOf = (v) => {
      const raw2 = v.qualityLabel || v.quality || '';
      const m = String(raw2).match(/\d+/);
      return m ? parseInt(m[0], 10) : null;
    };
    // Kalau user minta resolusi spesifik (wantedRes), cari entri video+
    // audio gabungan dgn resolusi PALING DEKAT ke situ dulu -- baru kalau
    // tidak ketemu sama sekali, jatuh ke logic lama (entri gabungan
    // pertama apa adanya, atau entri pertama yg punya url).
    let best = null;
    if (wantedRes) {
      const combined = videos.filter((v) => v && v.url && v.hasAudio && v.hasVideo);
      if (combined.length) {
        best = combined.reduce((closest, v) => {
          const r = resOf(v);
          if (r === null) return closest;
          if (!closest) return v;
          return Math.abs(r - wantedRes) < Math.abs(resOf(closest) - wantedRes) ? v : closest;
        }, null);
      }
    }
    best = best
      || videos.find((v) => v && v.url && v.hasAudio && v.hasVideo)
      || videos.find((v) => v && v.url);

    const audios = Array.isArray(raw.audios) ? raw.audios : (Array.isArray(raw.audios?.items) ? raw.audios.items : []);
    const bestAudio = audios.find((a) => a && a.url);

    if (!best && !bestAudio) {
      console.warn('[UnduhVideo] RapidAPI tanpa link unduhan, raw:', JSON.stringify(raw));
      return { ok: false, detail: 'RapidAPI tidak mengembalikan link unduhan (mungkin perlu urlAccess=normal di plan Anda).' };
    }

    const thumbs = Array.isArray(raw.thumbnails) ? raw.thumbnails : [];
    const thumb = thumbs.length ? thumbs[thumbs.length - 1].url : undefined;

    return {
      ok: true,
      type: best ? 'video' : 'audio',
      title: raw.title || 'Video YouTube',
      thumbnail_url: thumb,
      duration: raw.lengthSeconds != null ? Number(raw.lengthSeconds) : undefined,
      download_url: best ? best.url : bestAudio.url,
      music_url: (best && bestAudio) ? bestAudio.url : undefined,
      _source: 'rapidapi-fallback',
    };
  } catch (err) {
    const timedOut = err.name === 'AbortError';
    return { ok: false, detail: timedOut ? 'RapidAPI tidak merespons dlm 15 detik (timeout).' : 'RapidAPI error: ' + err.message };
  }
}

// ---- Daftar resolusi TAMBAHAN dari RapidAPI, KHUSUS dipakai utk
// MELENGKAPI daftar `formats` yg ditampilkan di grid /v1/youtube/info --
// BUKAN sumber link unduhan (link sungguhan tetap belakangan lewat
// /v1/youtube/download spt biasa, resolusi apa pun yg diklik user
// -- termasuk yg ditambahkan fungsi ini -- tetap lewat alur
// primary(FastSaverAPI)->fallback(RapidAPI) yg SAMA spt sebelumnya).
//
// SENGAJA cuma ambil entri video+audio GABUNGAN (hasAudio && hasVideo).
// YouTube sendiri cuma nyediain file gabungan-jadi-1 (progressive) itu
// sampai res tertentu (biasanya <=720p) -- resolusi lebih tinggi
// (1080p/1440p/2160p spt di player YouTube) di sumbernya SELALU
// video-only + audio-only terpisah, digabung baru pas diputar (adaptive
// streaming/MSE). Worker Cloudflare INI TIDAK bisa gabungin dua stream
// itu jadi 1 file (butuh ffmpeg, di luar kemampuan Worker) -- kalau
// entri video-only ini ikut ditambahkan ke daftar, tombolnya nanti kalau
// diklik user cuma hasilin video TANPA suara. Jadi resolusi setinggi
// itu MEMANG tidak akan pernah muncul di grid selama providernya
// (FastSaverAPI/RapidAPI) tidak melakukan merge server-side sendiri.
async function tryRapidApiYoutubeFormats(url, env) {
  if (!env.RAPIDAPI_KEY) return [];
  const videoId = extractYoutubeId(url);
  if (!videoId) return [];
  try {
    const qs = new URLSearchParams({ videoId, urlAccess: 'normal', videos: 'true', audios: 'true' });
    const res = await fetchWithTimeout(`https://${RAPIDAPI_HOST}/v2/video/details?${qs.toString()}`, {
      headers: { 'X-RapidAPI-Key': env.RAPIDAPI_KEY, 'X-RapidAPI-Host': RAPIDAPI_HOST },
    });
    const raw = await res.json();
    const videos = Array.isArray(raw.videos) ? raw.videos : (Array.isArray(raw.videos?.items) ? raw.videos.items : []);
    const combined = videos.filter((v) => v && v.url && v.hasAudio && v.hasVideo);
    const seen = new Set();
    const out = [];
    for (const v of combined) {
      const rawLabel = v.qualityLabel || v.quality || '';
      const m = String(rawLabel).match(/\d+/);
      if (!m) continue;
      const resNum = parseInt(m[0], 10);
      if (seen.has(resNum)) continue;
      seen.add(resNum);
      const size = v.contentLength != null ? parseInt(v.contentLength, 10) : (v.filesize || undefined);
      out.push({ format: `${resNum}p`, filesize: Number.isNaN(size) ? undefined : size, _res: resNum });
    }
    return out;
  } catch (err) {
    // Diam2 saja (return kosong) kalau RapidAPI gagal/timeout di sini --
    // ini cuma PELENGKAP, daftar dari FastSaverAPI tetap harus tampil
    // normal walau bagian tambahan ini gagal.
    return [];
  }
}

// ---- Gabungkan `formats` dari respons FastSaverAPI (primary) dgn
// tambahan resolusi dari RapidAPI (extra) -- resolusi yg ANGKANYA sudah
// ada di primary TIDAK diduplikasi, sisanya disisipkan & diurutkan
// besar->kecil spy tampilannya rapi (1080p di atas, 144p di bawah). ----
function mergeYoutubeFormats(primaryFormats, extra) {
  const existing = Array.isArray(primaryFormats) ? primaryFormats.slice() : [];
  const existingRes = new Set(
    existing
      .map((f) => parseInt(String(f.format || '').match(/\d+/)?.[0], 10))
      .filter((n) => !Number.isNaN(n))
  );
  for (const item of extra) {
    if (existingRes.has(item._res)) continue;
    existingRes.add(item._res);
    existing.push({ format: item.format, filesize: item.filesize });
  }
  existing.sort((a, b) => {
    const ra = parseInt(String(a.format || '').match(/\d+/)?.[0], 10) || 0;
    const rb = parseInt(String(b.format || '').match(/\d+/)?.[0], 10) || 0;
    return rb - ra;
  });
  return existing;
}

export default {
  async fetch(request, env) {
    // Preflight CORS (browser selalu kirim OPTIONS dulu utk request
    // POST/JSON lintas-origin spt ini).
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const incoming = new URL(request.url);

    // ---- Proxy unduh file sungguhan (video/audio/thumbnail) -- INI YG
    // BIKIN link asli (mis. api.fastsaver.io/v1/tunnel?id=...) TIDAK
    // PERNAH terlihat browser user sama sekali: frontend (lihat
    // videoDlDownloadFile/videoDlDownloadThumbnail di script.js) fetch ke
    // Worker INI (bukan lagi langsung ke fastsaver.io), Worker inilah yg
    // ambil file byte-nya server-to-server lalu di-stream balik ke
    // browser. Karena request ke fastsaver.io terjadi di sisi Worker
    // (Cloudflare), URL aslinya TIDAK PERNAH muncul di tab Network/address
    // bar browser user -- beda dgn sebelumnya yg pakai <a href download
    // target="_blank"> polos ke link fastsaver.io langsung (diabaikan
    // atribut `download`-nya krn cross-origin, jadi malah NAVIGASI &
    // ketauan link aslinya). ----
    if (incoming.pathname === '/v1/proxy-download' && request.method === 'GET') {
      const target = incoming.searchParams.get('url');
      if (!target || !isAllowedProxyUrl(target)) {
        return jsonResponse({ ok: false, detail: 'URL sumber unduhan kosong/tidak diizinkan.' }, 400);
      }
      try {
        const upstreamRes = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!upstreamRes.ok || !upstreamRes.body) {
          return jsonResponse({ ok: false, detail: 'Sumber unduhan gagal diambil (status ' + upstreamRes.status + ').' }, 502);
        }
        const headers = new Headers(CORS_HEADERS);
        const ct = upstreamRes.headers.get('Content-Type');
        const cl = upstreamRes.headers.get('Content-Length');
        if (ct) headers.set('Content-Type', ct);
        if (cl) headers.set('Content-Length', cl);
        // "attachment" tanpa filename -- nama file sungguhan sudah
        // diatur sendiri di sisi frontend lewat atribut `a.download`
        // (lihat videoDlDownloadFile), header ini cuma jaga-jaga kalau
        // browser sempat menampilkan filename dari respons ini.
        headers.set('Content-Disposition', 'attachment');
        return new Response(upstreamRes.body, { status: 200, headers });
      } catch (err) {
        return jsonResponse({ ok: false, detail: 'Worker gagal mengambil file: ' + err.message }, 502);
      }
    }

    // ---- Info YouTube (dipanggil frontend LEBIH DULU, 2 kredit, utk
    // nampilin grid pilihan resolusi SEBELUM user benar2 unduh -- lihat
    // videoDlFetchYoutubeInfo di script.js). SEBELUM ini cuma proxy polos
    // ke FastSaverAPI (jatuh ke catch-all generik di paling bawah), jadi
    // daftar resolusinya PERSIS apa adanya dari FastSaverAPI -- kalau
    // videonya di FastSaverAPI cuma kebaca sampai 480p, itu doang yg
    // muncul, walau di YouTube aslinya ada sampai 4K (lihat komentar
    // panjang di tryRapidApiYoutubeFormats soal kenapa 4K/1080p+ MEMANG
    // svulit/nggak bisa ditawarkan tanpa merge ffmpeg server-side).
    // SEKARANG: tetap panggil FastSaverAPI dulu (primary, wajib -- kalau
    // ini gagal, seluruh endpoint tetap gagal spt sebelumnya), TAPI
    // hasilnya di-"lengkapi" dgn resolusi gabungan (video+audio) TAMBAHAN
    // dari RapidAPI kalau ada & belum ada di daftar FastSaverAPI. Kalau
    // RAPIDAPI_KEY belum diisi atau videonya memang tidak py resolusi
    // gabungan lebih tinggi di RapidAPI, hasilnya SAMA PERSIS spt
    // sebelumnya (tidak ada perubahan perilaku).
    if (incoming.pathname === '/v1/youtube/info' && request.method === 'GET') {
      if (!env.FASTSAVER_API_KEY) {
        return jsonResponse({ ok: false, detail: 'FASTSAVER_API_KEY belum diatur di Worker Settings > Variables and Secrets.' }, 500);
      }
      const videoUrl = incoming.searchParams.get('url');
      let primary;
      try {
        const res = await fetchWithTimeout(`${FASTSAVER_UPSTREAM}/v1/youtube/info?${incoming.searchParams.toString()}`, {
          headers: { 'X-Api-Key': env.FASTSAVER_API_KEY },
        });
        primary = await res.json();
      } catch (err) {
        const timedOut = err.name === 'AbortError';
        return jsonResponse({ ok: false, detail: timedOut ? 'FastSaverAPI tidak merespons dlm 15 detik (timeout).' : 'Worker gagal menghubungi FastSaverAPI: ' + err.message }, 502);
      }

      // Kalau FastSaverAPI sendiri sudah gagal (video privat/dihapus/dst),
      // langsung balikin apa adanya -- tidak ada gunanya coba lengkapi
      // resolusi dari RapidAPI utk video yg infonya saja gagal diambil.
      if (!primary || primary.ok === false) {
        return jsonResponse(primary || { ok: false, detail: 'FastSaverAPI tidak mengembalikan respons.' }, primary ? 502 : 502);
      }

      if (videoUrl) {
        const extra = await tryRapidApiYoutubeFormats(videoUrl, env);
        if (extra.length) {
          primary.formats = mergeYoutubeFormats(primary.formats, extra);
        }
      }
      return jsonResponse(primary);
    }

    // ---- Endpoint khusus YouTube: FastSaverAPI dulu, fallback RapidAPI ----
    if (incoming.pathname === '/v1/youtube/download' && request.method === 'POST') {
      let body;
      try {
        body = JSON.parse(await request.text());
      } catch (e) {
        return jsonResponse({ ok: false, detail: 'Body request tidak valid (harus JSON).' }, 400);
      }
      if (!body || !body.url) {
        return jsonResponse({ ok: false, detail: 'Field "url" wajib diisi.' }, 400);
      }
      if (!body.format) {
        return jsonResponse({ ok: false, detail: 'Field "format" wajib diisi (mis. "720p" atau "audio").' }, 400);
      }

      const primary = await tryFastSaverYoutube(body.url, body.format, env);
      if (primary.ok) return jsonResponse(primary);

      console.warn('[UnduhVideo] FastSaverAPI gagal utk YouTube, coba fallback RapidAPI:', JSON.stringify(primary));
      const fallback = await tryRapidApiYoutube(body.url, body.format, env);
      if (fallback.ok) return jsonResponse(fallback);

      console.warn('[UnduhVideo] RapidAPI fallback juga gagal:', JSON.stringify(fallback));
      // Balikan detail dari FastSaverAPI (percobaan utama) sbg pesan
      // utama, tapi sertakan info fallback jg di field terpisah supaya
      // kelihatan di Console kalau perlu debug.
      return jsonResponse({
        ok: false,
        detail: primary.detail || 'Gagal mengambil video YouTube (FastSaverAPI & fallback RapidAPI sama-sama gagal).',
        _fallbackDetail: fallback.detail,
      }, 502);
    }

    // ---- Proxy "Tanya AI" / "Tool AI" (Gemini & Claude) -- MODE OPSIONAL.
    // Kalau user isi field "URL Cloudflare Worker" di Pengaturan Tanya AI
    // (script.js), permintaan AI dikirim ke sini dulu, BUKAN langsung ke
    // generativelanguage.googleapis.com / api.anthropic.com dari browser.
    // Worker inilah yg pegang API key asli (CLAUDE_API_KEY / GEMINI_API_KEY
    // sbg Secret, lihat langkah deploy di atas) -- jadi key TIDAK PERNAH
    // terlihat di DevTools/Network tab milik user, beda dgn mode langsung
    // (browser -> provider) yg tetap didukung sbg fallback kalau field
    // Worker URL dikosongkan.
    // Body diteruskan APA ADANYA sesuai bentuk yg dipakai tiap provider
    // (Claude: {model,system,messages,max_tokens}; Gemini:
    // {model,contents,systemInstruction}) supaya frontend tidak perlu
    // logika terjemahan tambahan -- cukup ganti tujuan fetch-nya saja.
    if (incoming.pathname === '/v1/ai/chat' && request.method === 'POST') {
      let body;
      try { body = JSON.parse(await request.text()); } catch (e) {
        return jsonResponse({ ok: false, detail: 'Body request tidak valid (harus JSON).' }, 400);
      }
      const provider = body && (body.provider === 'claude' || body.provider === 'groq') ? body.provider : 'gemini';

      if (provider === 'groq') {
        if (!env.GROQ_API_KEY) {
          return jsonResponse({ ok: false, detail: 'GROQ_API_KEY belum diatur di Worker Settings > Variables and Secrets.' }, 500);
        }
        if (!body.messages) return jsonResponse({ ok: false, detail: 'Field "messages" wajib diisi.' }, 400);
        try {
          const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${env.GROQ_API_KEY}`,
            },
            body: JSON.stringify({
              model: body.model || 'llama-3.3-70b-versatile',
              max_tokens: body.max_tokens || 2048,
              messages: body.system
                ? [{ role: 'system', content: body.system }, ...body.messages]
                : body.messages,
            }),
          }, 30000);
          const data = await res.json();
          if (!res.ok) return jsonResponse({ ok: false, detail: data.error?.message || `HTTP ${res.status}` }, res.status);
          const text = data?.choices?.[0]?.message?.content || '';
          return jsonResponse({ ok: true, text });
        } catch (err) {
          const timedOut = err.name === 'AbortError';
          return jsonResponse({ ok: false, detail: timedOut ? 'Groq tidak merespons dlm 30 detik (timeout).' : 'Worker gagal menghubungi Groq: ' + err.message }, 502);
        }
      }

      if (provider === 'claude') {
        if (!env.CLAUDE_API_KEY) {
          return jsonResponse({ ok: false, detail: 'CLAUDE_API_KEY belum diatur di Worker Settings > Variables and Secrets.' }, 500);
        }
        if (!body.messages) return jsonResponse({ ok: false, detail: 'Field "messages" wajib diisi.' }, 400);
        try {
          const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': env.CLAUDE_API_KEY,
              'anthropic-version': ANTHROPIC_API_VERSION,
            },
            body: JSON.stringify({
              model: body.model || 'claude-sonnet-5',
              max_tokens: body.max_tokens || 2048,
              system: body.system || undefined,
              messages: body.messages,
            }),
          }, 30000);
          const data = await res.json();
          if (!res.ok) return jsonResponse({ ok: false, detail: data.error?.message || `HTTP ${res.status}` }, res.status);
          const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text || '').join('') || '';
          return jsonResponse({ ok: true, text });
        } catch (err) {
          const timedOut = err.name === 'AbortError';
          return jsonResponse({ ok: false, detail: timedOut ? 'Claude tidak merespons dlm 30 detik (timeout).' : 'Worker gagal menghubungi Claude: ' + err.message }, 502);
        }
      }

      // provider === 'gemini'
      if (!env.GEMINI_API_KEY) {
        return jsonResponse({ ok: false, detail: 'GEMINI_API_KEY belum diatur di Worker Settings > Variables and Secrets.' }, 500);
      }
      if (!body.contents) return jsonResponse({ ok: false, detail: 'Field "contents" wajib diisi.' }, 400);
      const model = body.model || 'gemini-3.7-flash';
      try {
        const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify({ contents: body.contents, systemInstruction: body.systemInstruction }),
        }, 30000);
        const data = await res.json();
        if (!res.ok) return jsonResponse({ ok: false, detail: data.error?.message || `HTTP ${res.status}` }, res.status);
        const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
        return jsonResponse({ ok: true, text });
      } catch (err) {
        const timedOut = err.name === 'AbortError';
        return jsonResponse({ ok: false, detail: timedOut ? 'Gemini tidak merespons dlm 30 detik (timeout).' : 'Worker gagal menghubungi Gemini: ' + err.message }, 502);
      }
    }

    // ---- Platform lain (TikTok/Instagram/Facebook): proxy polos spt sebelumnya ----
    if (!env.FASTSAVER_API_KEY) {
      return jsonResponse({ ok: false, detail: 'FASTSAVER_API_KEY belum diatur di Worker Settings > Variables and Secrets.' }, 500);
    }

    const targetUrl = FASTSAVER_UPSTREAM + incoming.pathname + incoming.search;
    const upstreamHeaders = { 'X-Api-Key': env.FASTSAVER_API_KEY };
    let body;
    if (request.method === 'POST') {
      upstreamHeaders['Content-Type'] = 'application/json';
      body = await request.text();
    }

    try {
      const upstreamRes = await fetch(targetUrl, {
        method: request.method,
        headers: upstreamHeaders,
        body,
      });
      const text = await upstreamRes.text();
      return new Response(text, {
        status: upstreamRes.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return jsonResponse({ ok: false, detail: 'Worker gagal menghubungi FastSaverAPI: ' + err.message }, 502);
    }
  },
};
