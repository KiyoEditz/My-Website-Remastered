// Gambar cadangan saat lagu tidak punya albumArt.
const FALLBACK_ART = 'assets/img/brand/logo-160.webp';

const NO_LYRICS_TEXT = 'Lirik tidak tersedia';

// Volume diingat antar kunjungan; 30% supaya pemutaran pertama tidak mengagetkan.
const VOLUME_KEY = 'kiyo:volume';
const MUTE_KEY = 'kiyo:muted';
const DEFAULT_VOLUME = 30;

// Setiap pemutaran naik dari 0 ke volume target selama ini. Tanpa ramp,
// volume tersimpan 100% dari sesi lama tetap meledak begitu play ditekan.
const FADE_MS = 700;

// Ikon diambil dari sprite inline di music.html (menggantikan Font Awesome).
const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}" /></svg>`;

// Pemutar ini khusus playlist internal (file lokal di assets/audio/).
// Dukungan YouTube sudah dihapus: satu-satunya sumber audio adalah <audio>.
class MusicPlayer {
    constructor() {
        this.audio = document.getElementById('audio');
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.progressBar = document.getElementById('progressBar');
        this.volumeBar = document.getElementById('volumeBar');
        this.volumeValue = document.getElementById('volumeValue');
        this.muteBtn = document.getElementById('muteBtn');
        this.currentTimeDisplay = document.getElementById('currentTime');
        this.durationDisplay = document.getElementById('duration');
        this.songTitle = document.getElementById('songTitle');
        this.artist = document.getElementById('artist');
        this.albumArt = document.getElementById('albumArt');
        this.backgroundBlur = document.getElementById('backgroundBlur');
        this.currentLyric = document.getElementById('currentLyric');
        this.nextLyric = document.getElementById('nextLyric');
        this.futureLyric = document.getElementById('futureLyric');
        this.playlistSelect = document.getElementById('playlistSelect');
        this.playlistTitle = document.getElementById('playlistTitle');
        this.welcomePanel = document.getElementById('welcomePanel');
        this.startButton = document.getElementById('startButton');

        this.currentSongIndex = 0;
        this.isPlaying = false;
        this.targetVolume = DEFAULT_VOLUME / 100;
        this.fadeFrame = null;
        this.allPlaylists = {};
        this.playlist = [];
        this.lyrics = [];
        this.currentLyricIndex = 0;

        this.init();
    }

    async init() {
        this.setupWelcomePanel();
        await this.loadConfig();
        this.setupEventListeners();
        this.restoreVolume();
        const defaultPlaylistName = (this.allPlaylists && (this.allPlaylists.defaultPlaylist || Object.keys(this.allPlaylists.playlists || {})[0]));
        if (defaultPlaylistName) {
            this.loadSpecificPlaylist(defaultPlaylistName);
        } else {
            console.error('No playlists found in config.');
        }
    }

    // Dialog sambutan: kunci fokus di dalamnya sampai pengguna menekan tombol,
    // lalu kembalikan fokus ke tombol putar. `inert` mencegah Tab keluar.
    setupWelcomePanel() {
        if (!this.welcomePanel || !this.startButton) return;

        this.backgroundBlur?.setAttribute('aria-hidden', 'true');
        this.setBackgroundInert(true);
        this.startButton.focus();

        this.startButton.addEventListener('click', () => this.dismissWelcome());
        // Escape menutup panel. Aman: panel tidak pernah memutar audio.
        this.welcomePanel.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            this.dismissWelcome();
        });
    }

    setBackgroundInert(isInert) {
        const targets = [
            document.querySelector('.site-header'),
            document.getElementById('main')
        ];
        targets.forEach((el) => {
            if (!el) return;
            if (isInert) el.setAttribute('inert', '');
            else el.removeAttribute('inert');
        });
    }

    dismissWelcome() {
        if (!this.welcomePanel || this.welcomePanel.classList.contains('hidden')) return;
        this.welcomePanel.classList.add('hidden');
        this.setBackgroundInert(false);
        // Tanpa autoplay: pengguna menekan Putar sendiri saat sudah siap.
        this.playPauseBtn.focus();
    }

    async loadConfig() {
        try {
            const response = await fetch('assets/data/config.json');
            const config = await response.json();
            this.allPlaylists = config;

            const playlistNames = Object.keys(config.playlists || {});
            this.playlistSelect.innerHTML = '';
            playlistNames.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                this.playlistSelect.appendChild(option);
            });

            if (config.defaultPlaylist) {
                this.playlistSelect.value = config.defaultPlaylist;
            }

            if (config.playlistName) {
                this.playlistTitle.textContent = config.playlistName;
            } else if (config.defaultPlaylist) {
                this.playlistTitle.textContent = config.defaultPlaylist;
            }
        } catch (error) {
            console.error('Error loading config:', error);
        }
    }

    setupEventListeners() {
        this.playPauseBtn.addEventListener('click', () => this.togglePlay());
        this.prevBtn.addEventListener('click', () => this.playPrevious());
        this.nextBtn.addEventListener('click', () => this.playNext());

        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('loadedmetadata', () => this.updateDuration());
        this.audio.addEventListener('ended', () => this.playNext());

        this.progressBar.addEventListener('input', () => this.seek());
        this.volumeBar.addEventListener('input', () => this.setVolume());
        this.muteBtn?.addEventListener('click', () => this.toggleMute());

        this.playlistSelect.addEventListener('change', (event) => {
            this.loadSpecificPlaylist(event.target.value);
        });
    }

    // Tombol putar/jeda: ikon, label aksesibel, dan aria-pressed ikut berubah.
    setPlayingState(isPlaying) {
        this.isPlaying = isPlaying;
        this.playPauseBtn.innerHTML = isPlaying ? icon('pause') : icon('play');
        this.playPauseBtn.setAttribute('aria-label', isPlaying ? 'Jeda' : 'Putar');
        this.playPauseBtn.setAttribute('aria-pressed', String(isPlaying));
    }

    
    loadSpecificPlaylist(playlistName) {
        if (this.allPlaylists.playlists && this.allPlaylists.playlists[playlistName]) {
            this.playlist = this.allPlaylists.playlists[playlistName];
            this.currentSongIndex = 0;
            this.loadSong(this.currentSongIndex);
            this.playlistTitle.textContent = playlistName;
        } else {
            console.error(`Playlist "${playlistName}" not found.`);
        }
    }

    loadSong(index) {
        if (this.playlist.length === 0) {
            this.songTitle.textContent = 'No songs in playlist';
            this.artist.textContent = '';
            this.albumArt.src = FALLBACK_ART;
            this.albumArt.alt = 'Sampul album';
            this.audio.src = '';
            this.clearLyrics();
            return;
        }

        this.currentSongIndex = index;
        const song = this.playlist[index];
        const albumArt = song.albumArt || FALLBACK_ART;

        this.audio.src = song.path || '';
        this.songTitle.textContent = song.title || 'Unknown';
        this.artist.textContent = song.artist || '';
        this.albumArt.src = albumArt;
        this.albumArt.alt = `Sampul album ${song.title || 'lagu'}`;
        this.backgroundBlur.style.backgroundImage = `url(${albumArt})`;

        if (song.lyricsPath) this.loadLyrics(song.lyricsPath);
        else this.clearLyrics();

        if (this.isPlaying) this.playWithFade();
    }

    clearLyrics() {
        this.lyrics = [];
        this.currentLyricIndex = 0;
        this.currentLyric.textContent = NO_LYRICS_TEXT;
        this.nextLyric.textContent = '';
        this.futureLyric.textContent = '';
    }

    async loadLyrics(lyricsPath) {
        if (!lyricsPath) {
            this.clearLyrics();
            return;
        }
        try {
            const response = await fetch(lyricsPath);
            if (!response.ok) throw new Error('Lyrics file not found or could not be loaded.');
            const lrcText = await response.text();
            this.lyrics = this.parseLRC(lrcText);
            this.currentLyricIndex = 0;
            if (this.lyrics.length === 0) this.clearLyrics();
        } catch (error) {
            console.error('Error loading lyrics:', error);
            this.clearLyrics();
        }
    }

    parseLRC(lrcText) {
        const lines = lrcText.split('\n');
        const lyrics = [];
        // Menerima [m:ss], [mm:ss], [mm:ss.xx] dan [mm:ss.xxx].
        // Pemisah pecahan boleh '.' atau ':' (varian LRC yang umum di luar sana).
        const stampRegex = /\[(\d{1,3}):(\d{2})(?:[.:](\d{2,3}))?\]/g;
        lines.forEach(line => {
            stampRegex.lastIndex = 0;
            const stamps = [...line.matchAll(stampRegex)];
            if (stamps.length === 0) return;

            // Tag metadata seperti [ti:...] / [ar:...] tidak akan cocok karena
            // grup pertama hanya menerima angka.
            const last = stamps[stamps.length - 1];
            const text = line.slice(last.index + last[0].length).trim();

            // Satu baris bisa punya beberapa timestamp (lirik berulang).
            stamps.forEach(stamp => {
                const minutes = parseInt(stamp[1], 10);
                const seconds = parseInt(stamp[2], 10);
                const fraction = stamp[3] || '0';
                // 2 digit = ratusan detik (x10), 3 digit = milidetik apa adanya.
                const milliseconds = fraction.length === 3
                    ? parseInt(fraction, 10)
                    : parseInt(fraction, 10) * 10;
                const time = minutes * 60 + seconds + milliseconds / 1000;
                lyrics.push({ time, text });
            });
        });
        return lyrics.sort((a, b) => a.time - b.time);
    }

    updateLyrics() {
        if (this.lyrics.length === 0) {
            this.currentLyric.textContent = NO_LYRICS_TEXT;
            this.nextLyric.textContent = '';
            this.futureLyric.textContent = '';
            return;
        }
        const currentTime = this.getCurrentTime();
        let found = false;
        for (let i = 0; i < this.lyrics.length; i++) {
            if (currentTime < this.lyrics[i].time) {
                this.currentLyricIndex = Math.max(0, i - 1);
                found = true;
                break;
            }
        }
        if (!found) this.currentLyricIndex = this.lyrics.length - 1;
        this.currentLyric.textContent = this.lyrics[this.currentLyricIndex]?.text || '';
        this.nextLyric.textContent = this.lyrics[this.currentLyricIndex + 1]?.text || '';
        this.futureLyric.textContent = this.lyrics[this.currentLyricIndex + 2]?.text || '';
    }

    // Satu-satunya jalur pemutaran. Volume selalu mulai dari 0 lalu naik,
    // jadi tidak ada skenario yang bisa menghentak telinga.
    playWithFade() {
        this.cancelFade();
        const target = this.audio.muted ? 0 : this.targetVolume;
        this.audio.volume = 0;

        const started = this.audio.play();
        if (!started || typeof started.then !== 'function') {
            this.audio.volume = target;
            return;
        }

        started.then(() => {
            const beganAt = performance.now();
            const step = (now) => {
                const progress = Math.min(1, (now - beganAt) / FADE_MS);
                this.audio.volume = Math.min(target, target * progress);
                this.fadeFrame = progress < 1 ? requestAnimationFrame(step) : null;
            };
            this.fadeFrame = requestAnimationFrame(step);
        }).catch(() => {
            // Autoplay diblokir atau file gagal dimuat; jangan biarkan volume 0.
            this.audio.volume = target;
        });
    }

    cancelFade() {
        if (this.fadeFrame === null) return;
        cancelAnimationFrame(this.fadeFrame);
        this.fadeFrame = null;
    }

    togglePlay() {
        if (this.isPlaying) {
            this.cancelFade();
            this.audio.pause();
            this.setPlayingState(false);
        } else {
            this.playWithFade();
            this.setPlayingState(true);
        }
    }

    playPrevious() {
        if (this.playlist.length === 0) return;
        this.currentSongIndex = (this.currentSongIndex - 1 + this.playlist.length) % this.playlist.length;
        this.loadSong(this.currentSongIndex);
    }

    playNext() {
        if (this.playlist.length === 0) return;
        this.currentSongIndex = (this.currentSongIndex + 1) % this.playlist.length;
        this.loadSong(this.currentSongIndex);
    }

    getCurrentTime() {
        return this.audio.currentTime || 0;
    }

    getDuration() {
        const duration = this.audio.duration;
        return isFinite(duration) ? duration : 0;
    }

    updateProgress() {
        const currentTime = this.getCurrentTime();
        const duration = this.getDuration();
        const progress = (duration > 0) ? (currentTime / duration) * 100 : 0;
        this.progressBar.value = progress || 0;
        this.currentTimeDisplay.textContent = this.formatTime(currentTime);
        // Pembaca layar menerima waktu yang bisa dibaca, bukan persen mentah.
        this.progressBar.setAttribute(
            'aria-valuetext',
            `${this.formatTime(currentTime)} dari ${this.formatTime(duration)}`
        );
        this.updateLyrics();
    }

    updateDuration() {
        this.durationDisplay.textContent = this.formatTime(this.getDuration());
    }

    seek() {
        const duration = this.getDuration();
        if (duration <= 0) return;
        this.audio.currentTime = (this.progressBar.value / 100) * duration;
    }

    // Volume selalu di-clamp 0-100 dan disimpan, supaya reload berikutnya
    // tidak kembali ke 100% (penyebab "jump scare" sebelumnya).
    setVolume(persist = true) {
        const val = Math.min(100, Math.max(0, parseInt(this.volumeBar.value, 10) || 0));
        this.volumeBar.value = String(val);
        // Ramp yang sedang berjalan akan menimpa nilai baru; hentikan dulu.
        this.cancelFade();
        // targetVolume adalah acuan playWithFade(). Tanpa ini, fade selalu
        // naik ke 30% berapa pun posisi slider — memutar ulang setelah
        // pengguna mengecilkan volume jadi lebih keras dari yang dipilih.
        this.targetVolume = val / 100;
        this.audio.volume = this.targetVolume;
        this.updateVolumeLabel(val);
        if (persist) {
            try { localStorage.setItem(VOLUME_KEY, String(val)); } catch (error) { /* mode privat */ }
        }
    }

    // Urutan prioritas: volume terakhir yang dipilih pengguna, lalu
    // DEFAULT_VOLUME (30%). Tidak pernah jatuh ke 100%.
    // Status bisu ikut diingat: kalau pengguna sudah membisukan, reload
    // berikutnya tetap sunyi, bukan tiba-tiba bersuara.
    restoreVolume() {
        let stored = null;
        let storedMute = null;
        try {
            stored = localStorage.getItem(VOLUME_KEY);
            storedMute = localStorage.getItem(MUTE_KEY);
        } catch (error) {
            stored = null;
        }
        const parsed = parseInt(stored, 10);
        this.volumeBar.value = String(
            Number.isFinite(parsed)
                ? Math.min(100, Math.max(0, parsed))
                : DEFAULT_VOLUME
        );
        this.audio.muted = storedMute === 'true';
        this.syncMuteUI();
        this.setVolume(false);
    }

    // Ikon, label, dan aria-pressed tombol bisu selalu berasal dari satu
    // sumber: nilai audio.muted.
    syncMuteUI() {
        if (!this.muteBtn) return;
        this.muteBtn.innerHTML = icon(this.audio.muted ? 'volume-mute' : 'volume');
        this.muteBtn.setAttribute('aria-label', this.audio.muted ? 'Nyalakan suara' : 'Bisukan');
        this.muteBtn.setAttribute('aria-pressed', String(this.audio.muted));
    }

    // Saat dibisukan, nilai slider tetap berlaku tapi labelnya diberi keterangan.
    updateVolumeLabel(val) {
        const suffix = this.audio.muted ? ' (dibisukan)' : '';
        this.volumeBar.setAttribute('aria-valuetext', `${val}%${suffix}`);
        if (this.volumeValue) this.volumeValue.textContent = `${val}%`;
    }

    toggleMute() {
        this.audio.muted = !this.audio.muted;
        this.syncMuteUI();
        try { localStorage.setItem(MUTE_KEY, String(this.audio.muted)); } catch (error) { /* mode privat */ }
        // Volume slider tetap berlaku; yang berubah hanya gerbang mute.
        this.setVolume(false);
    }

    formatTime(seconds) {
        if (!isFinite(seconds) || Number.isNaN(seconds)) seconds = 0;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MusicPlayer();
});