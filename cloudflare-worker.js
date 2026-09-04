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
 *   8. OPSIONAL -- proxy "Tanya AI"/"Tool AI" (Groq) supaya API
 *      key-nya tidak kelihatan di browser: di Worker yg SAMA, tambah
 *      Secret -> Name: GROQ_API_KEY, Value: (API key dari
 *      console.groq.com/keys, daftar gratis tanpa kartu kredit) -> Save
 *      and Deploy. Lalu di ZAYAIN: tombol Tanya AI > ikon gerigi >
 *      field "URL Cloudflare Worker" -> tempel URL worker yg sama spt
 *      langkah 7 -> Simpan. Field API Key di form yg sama boleh
 *      dikosongkan kalau sudah pakai mode Worker ini (key-nya dibaca
 *      worker dari Secret, bukan dari browser).
 *
 * Free tier Cloudflare Workers: 100.000 request/hari. Free tier
 * RapidAPI "YouTube Media Downloader": cek sendiri kuotanya di halaman
 * API tsb saat subscribe (bisa berubah sewaktu-waktu, bukan wewenang
 * ZAYAIN).
 */

const FASTSAVER_UPSTREAM = 'https://api.fastsaver.io';
const RAPIDAPI_HOST = 'youtube-media-downloader.p.rapidapi.com';

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
  'susercontent.com',   // Shopee (foto & video produk)
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
    // Nilai 'auto' (bukan 'true') dipakai krn itulah yg terkonfirmasi
    // jalan di contoh permintaan nyata pengguna lain API ini (dicek lewat
    // web search Sep 2026) -- 'true' sebelumnya cuma tebakan, belum
    // pernah dites terhadap key sungguhan.
    const qs = new URLSearchParams({ videoId, urlAccess: 'normal', videos: 'auto', audios: 'auto' });
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
      const combined = videos.filter((v) => v && v.url && v.hasAudio);
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
      || videos.find((v) => v && v.url && v.hasAudio)
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
// SENGAJA cuma ambil entri video+audio GABUNGAN (hasAudio: true -- setiap
// entri di `videos.items` sudah pasti video, jadi hasAudio saja cukup
// membedakan progressive/gabungan dari video-only; dikonfirmasi dari
// respons JSON nyata API ini, Sep 2026).
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
    const qs = new URLSearchParams({ videoId, urlAccess: 'normal', videos: 'auto', audios: 'auto' });
    const res = await fetchWithTimeout(`https://${RAPIDAPI_HOST}/v2/video/details?${qs.toString()}`, {
      headers: { 'X-RapidAPI-Key': env.RAPIDAPI_KEY, 'X-RapidAPI-Host': RAPIDAPI_HOST },
    });
    const raw = await res.json();
    const videos = Array.isArray(raw.videos) ? raw.videos : (Array.isArray(raw.videos?.items) ? raw.videos.items : []);
    const combined = videos.filter((v) => v && v.url && v.hasAudio);
    const seen = new Set();
    const out = [];
    for (const v of combined) {
      const rawLabel = v.qualityLabel || v.quality || '';
      const m = String(rawLabel).match(/\d+/);
      if (!m) continue;
      const resNum = parseInt(m[0], 10);
      if (seen.has(resNum)) continue;
      seen.add(resNum);
      // Field ukuran file di skema nyata API ini adalah `size` (angka
      // langsung) -- `contentLength`/`filesize` sebelumnya cuma tebakan
      // yang salah dan selalu kosong (dikonfirmasi dari respons JSON
      // nyata, Sep 2026).
      const size = typeof v.size === 'number' ? v.size : undefined;
      out.push({ format: `${resNum}p`, filesize: size, _res: resNum });
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

// ---- Shopee (unduh foto & video PRODUK) -- BEDA TOTAL dgn semua
// platform di atas: BUKAN lewat FastSaverAPI/RapidAPI pihak ketiga sama
// sekali. Shopee sendiri punya endpoint publik `/api/v4/pdp/get_pc` yg
// bisa diakses tanpa login/API key -- dipakai banyak tool scraper produk
// e-commerce (dikonfirmasi lewat riset publik, Sep 2026). Worker ini cuma
// jadi jembatan CORS (endpoint Shopee tidak izinkan dipanggil langsung
// dari browser lintas-origin) + header Referer/User-Agent yg realistis.
//
// CATATAN JUJUR soal video produk: field `videoInfoList` di respons
// get_pc BELUM PERNAH dikonfirmasi thd produk yg BENERAN py video (contoh
// yg dites saat riset kebetulan kosong) -- kode di bawah nebak beberapa
// nama field yg umum (mirip gaya defensif tryRapidApiYoutube di atas).
// Kalau ternyata skemanya beda, foto tetap kekirim normal, cuma video-nya
// yg terlewat -- BUKAN bikin seluruh permintaan gagal.
const SHOPEE_IMG_CDN_BY_REGION = {
  id: 'down-id.img.susercontent.com',
  sg: 'down-sg.img.susercontent.com',
  th: 'down-th.img.susercontent.com',
  my: 'down-my.img.susercontent.com',
  vn: 'down-vn.img.susercontent.com',
  ph: 'down-ph.img.susercontent.com',
  tw: 'down-tw.img.susercontent.com',
  br: 'down-br.img.susercontent.com',
};

function shopeeRegionFromHost(host) {
  // shopee.co.id -> id, shopee.com.my -> my, shopee.tw -> tw, shopee.sg -> sg, dst.
  const m = host.match(/shopee\.(?:com\.)?([a-z]{2,3})$/i);
  return m ? m[1].toLowerCase() : 'id';
}

// Ambil {shopId, itemId} dari berbagai bentuk URL produk Shopee. Link
// pendek (shp.ee/xxx, s.shopee.co.id/xxx) TIDAK ketemu di sini -- perlu
// diikuti redirect-nya dulu di tryShopeeProduct sebelum dipanggil ulang.
function parseShopeeIds(rawUrl) {
  try {
    const u = new URL(rawUrl);
    let m = u.pathname.match(/-i\.(\d+)\.(\d+)/);           // ...-i.SHOPID.ITEMID
    if (m) return { shopId: m[1], itemId: m[2], host: u.hostname };
    m = u.pathname.match(/\/product\/(\d+)\/(\d+)/);         // /product/SHOPID/ITEMID
    if (m) return { shopId: m[1], itemId: m[2], host: u.hostname };
    m = u.pathname.match(/(\d{5,})\.(\d{5,})$/);              // shopee.tw/SHOPID.ITEMID
    if (m) return { shopId: m[1], itemId: m[2], host: u.hostname };
    return null;
  } catch (e) {
    return null;
  }
}

async function tryShopeeProduct(rawUrl, env) {
  let ids = parseShopeeIds(rawUrl);
  let finalUrl = rawUrl;
  if (!ids) {
    try {
      // UA generik ('Mozilla/5.0' doang) sering dianggap bot sama short-link
      // redirector Shopee -> dibalas halaman interstitial "Buka di app" (HTTP
      // 200 biasa) BUKAN redirect 302 ke URL produk, jadi res.url tetap sama
      // dgn link pendeknya. Pakai UA browser lengkap (sama spt panggilan
      // get_pc di bawah) supaya kemungkinan besar dapat redirect HTTP normal.
      const res = await fetchWithTimeout(rawUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      }, 10000);
      finalUrl = res.url || rawUrl;
      ids = parseShopeeIds(finalUrl);
    } catch (err) {
      return { ok: false, detail: 'Gagal membuka link pendek Shopee: ' + err.message };
    }
  }
  // Sertakan finalUrl di pesan error -- kalau masih gagal, ini nunjukin
  // PERSIS link-nya nyasar ke mana stlh di-follow (mis. masih ketahan di
  // halaman interstitial shp.ee, bukan sampai ke shopee.co.id/...-i.xxx.yyy),
  // jadi lebih gampang didiagnosis drpd cuma pesan generik.
  if (!ids) return { ok: false, detail: `Tidak bisa mengenali shop_id/item_id dari link Shopee ini. URL setelah di-follow: ${finalUrl}` };

  const region = shopeeRegionFromHost(ids.host);
  const imgCdn = SHOPEE_IMG_CDN_BY_REGION[region] || SHOPEE_IMG_CDN_BY_REGION.id;
  const apiUrl = `https://${ids.host}/api/v4/pdp/get_pc?item_id=${ids.itemId}&shop_id=${ids.shopId}`;

  let json;
  try {
    const res = await fetchWithTimeout(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': finalUrl,
        'Accept-Language': 'id-ID,id;q=0.9',
      },
    }, 15000);
    json = await res.json();
  } catch (err) {
    const timedOut = err.name === 'AbortError';
    return { ok: false, detail: timedOut ? 'Shopee tidak merespons dlm 15 detik (timeout).' : 'Worker gagal menghubungi Shopee: ' + err.message };
  }

  const item = json && json.data && json.data.item;
  if (!item) {
    return { ok: false, detail: 'Shopee tidak mengembalikan data produk (mungkin produk dihapus/privat, atau permintaan diblokir Shopee).' };
  }

  const images = Array.isArray(item.images) ? item.images : [];
  if (!images.length) {
    return { ok: false, detail: 'Produk ini tidak punya foto yang bisa diambil.' };
  }
  const items = images.map((hash) => ({
    thumbnail_url: `https://${imgCdn}/file/${hash}`,
    download_url: `https://${imgCdn}/file/${hash}`,
  }));

  const videoList = Array.isArray(item.videoInfoList) ? item.videoInfoList : [];
  if (videoList.length) {
    const v = videoList[0] || {};
    const videoUrl = v.url || v.video_url
      || (Array.isArray(v.format_infos) && v.format_infos[0] && v.format_infos[0].url)
      || (Array.isArray(v.formatInfos) && v.formatInfos[0] && v.formatInfos[0].url);
    if (videoUrl) {
      items.unshift({
        thumbnail_url: v.thumb_url || v.cover_url || items[0].thumbnail_url,
        download_url: videoUrl,
      });
    }
  }

  return {
    ok: true,
    type: 'album',
    caption: item.name || 'Produk Shopee',
    thumbnail_url: items[0].thumbnail_url,
    items,
  };
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

    // ---- Shopee (foto & video produk) -- endpoint publik resmi Shopee
    // sendiri, BUKAN FastSaverAPI, lihat komentar panjang di
    // tryShopeeProduct di atas.
    if (incoming.pathname === '/v1/shopee/fetch' && request.method === 'GET') {
      const productUrl = incoming.searchParams.get('url');
      if (!productUrl) return jsonResponse({ ok: false, detail: 'Parameter "url" wajib diisi.' }, 400);
      const result = await tryShopeeProduct(productUrl, env);
      return jsonResponse(result, result.ok ? 200 : 502);
    }

    // ---- Proxy "Tanya AI" / "Tool AI" (Groq) -- MODE OPSIONAL.
    // Kalau user isi field "URL Cloudflare Worker" di Pengaturan Tanya AI
    // (script.js), permintaan AI dikirim ke sini dulu, BUKAN langsung ke
    // api.groq.com dari browser. Worker inilah yg pegang API key asli
    // (GROQ_API_KEY sbg Secret, lihat langkah deploy di atas) -- jadi key
    // TIDAK PERNAH terlihat di DevTools/Network tab milik user, beda dgn
    // mode langsung (browser -> Groq) yg tetap didukung sbg fallback
    // kalau field Worker URL dikosongkan.
    if (incoming.pathname === '/v1/ai/chat' && request.method === 'POST') {
      let body;
      try { body = JSON.parse(await request.text()); } catch (e) {
        return jsonResponse({ ok: false, detail: 'Body request tidak valid (harus JSON).' }, 400);
      }

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
