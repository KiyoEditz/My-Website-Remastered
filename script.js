// Gambar cadangan saat lagu tidak punya albumArt.
// Sebelumnya menunjuk 'placeholder.jpg' yang tidak ada di repo -> gambar rusak.
const FALLBACK_ART = 'thumbnail.jpg';

const NO_LYRICS_TEXT = 'Lirik tidak tersedia';

// Pemutar ini khusus playlist internal (file lokal di folder music/).
// Dukungan YouTube sudah dihapus: satu-satunya sumber audio adalah <audio>.
class MusicPlayer {
    constructor() {
        this.audio = document.getElementById('audio');
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.progressBar = document.getElementById('progressBar');
        this.volumeBar = document.getElementById('volumeBar');
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

        this.currentSongIndex = 0;
        this.isPlaying = false;
        this.allPlaylists = {};
        this.playlist = [];
        this.lyrics = [];
        this.currentLyricIndex = 0;

        this.init();
    }

    async init() {
        await this.loadConfig();
        this.setupEventListeners();
        this.setVolume();
        const defaultPlaylistName = (this.allPlaylists && (this.allPlaylists.defaultPlaylist || Object.keys(this.allPlaylists.playlists || {})[0]));
        if (defaultPlaylistName) {
            this.loadSpecificPlaylist(defaultPlaylistName);
        } else {
            console.error('No playlists found in config.');
        }
    }

    async loadConfig() {
        try {
            const response = await fetch('config.json');
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

        this.playlistSelect.addEventListener('change', (event) => {
            this.loadSpecificPlaylist(event.target.value);
        });

        const startButton = document.getElementById('startButton');
        const welcomePanel = document.getElementById('welcomePanel');

        startButton.addEventListener('click', () => {
            welcomePanel.classList.add('hidden');
            this.startPlayback();
        });

        // Jaring pengaman: browser memblokir autoplay sampai ada interaksi,
        // jadi klik pertama di mana pun ikut memicu pemutaran.
        document.addEventListener('click', () => {
            if (!this.isPlaying && welcomePanel.classList.contains('hidden')) {
                this.startPlayback();
            }
        }, { once: true });
    }

    startPlayback() {
        this.audio.play().catch(() => {});
        this.isPlaying = true;
        this.playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
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
        this.backgroundBlur.style.backgroundImage = `url(${albumArt})`;

        if (song.lyricsPath) this.loadLyrics(song.lyricsPath);
        else this.clearLyrics();

        if (this.isPlaying) this.audio.play().catch(() => {});
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
            const text = line.slice(stamps[stamps.length - 1].index + stamps[stamps.length - 1][0].length).trim();

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

    togglePlay() {
        if (this.isPlaying) {
            this.audio.pause();
            this.playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            this.isPlaying = false;
        } else {
            this.audio.play().catch(() => {});
            this.playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            this.isPlaying = true;
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

    setVolume() {
        const val = parseInt(this.volumeBar.value, 10) || 0;
        this.audio.volume = val / 100;
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
