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
        this.currentLyric = document.getElementById('currentLyric');
        this.nextLyric = document.getElementById('nextLyric');
        this.futureLyric = document.getElementById('futureLyric');
        this.playlistSelect = document.getElementById('playlistSelect');

        this.currentSongIndex = 0;
        this.isPlaying = false;
        this.allPlaylists = {};
        this.playlist = [];
        this.lyrics = [];
        this.currentLyricIndex = 0;

        this.currentSource = 'audio';
        this.ytPlayer = null;
        this.ytApiReady = false;
        this.ytApiReadyPromise = null;
        this.ytPollIntervalId = null;
        this.youtubeIframeContainer = null;

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

            const playlistTitle = document.getElementById('playlistTitle');
            if (config.playlistName) {
                playlistTitle.textContent = config.playlistName;
            } else if (config.defaultPlaylist) {
                playlistTitle.textContent = config.defaultPlaylist;
            }
        } catch (error) {
            console.error('Error loading config:', error);
        }
    }

    setupEventListeners() {
        this.playPauseBtn.addEventListener('click', () => this.togglePlay());
        this.prevBtn.addEventListener('click', () => this.playPrevious());
        this.nextBtn.addEventListener('click', () => this.playNext());

        this.audio.addEventListener('timeupdate', () => {
            if (this.currentSource === 'audio') this.updateProgress();
        });
        this.audio.addEventListener('loadedmetadata', () => {
            if (this.currentSource === 'audio') this.updateDuration();
        });
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
            this.playCurrentSourceIfReady();
            this.isPlaying = true;
            this.playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        });

        document.addEventListener('click', () => {
            if (!this.isPlaying && welcomePanel.classList.contains('hidden')) {
                this.playCurrentSourceIfReady();
                this.isPlaying = true;
                this.playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            }
        }, { once: true });
    }

    playCurrentSourceIfReady() {
        if (this.currentSource === 'audio') {
            this.audio.play().catch(() => {});
        } else if (this.currentSource === 'youtube' && this.ytPlayer && this.ytApiReady) {
            try { this.ytPlayer.playVideo(); } catch (e) {}
        }
    }

    getYouTubeId(song) {
        if (!song) return null;
        if (song.youtubeId) return song.youtubeId;
        const p = song.path || '';
        if (p.startsWith('yt:')) return p.slice(3);
        const urlRegex = /(?:v=|\/)([0-9A-Za-z_-]{11})(?:\b|&|$)/;
        const m = p.match(urlRegex);
        if (m) return m[1];
        if (p.length === 11 && /^[0-9A-Za-z_-]{11}$/.test(p)) return p;
        return null;
    }

    loadSpecificPlaylist(playlistName) {
        if (this.allPlaylists.playlists && this.allPlaylists.playlists[playlistName]) {
            this.playlist = this.allPlaylists.playlists[playlistName];
            this.currentSongIndex = 0;
            this.loadSong(this.currentSongIndex);

            const playlistTitle = document.getElementById('playlistTitle');
            playlistTitle.textContent = playlistName;
        } else {
            console.error(`Playlist "${playlistName}" not found.`);
        }
    }

    loadSong(index) {
        if (this.playlist.length === 0) {
            this.songTitle.textContent = 'No songs in playlist';
            this.artist.textContent = '';
            this.albumArt.src = 'placeholder.jpg';
            this.currentLyric.textContent = 'Lyrics not available';
            this.nextLyric.textContent = '';
            this.futureLyric.textContent = '';
            this.audio.src = '';
            return;
        }

        this.currentSongIndex = index;
        const song = this.playlist[index];
        const videoId = this.getYouTubeId(song);
        if (videoId) {
            this.loadYouTubeSong(videoId, song);
        } else {
            this.loadLocalSong(song);
        }
    }

    loadLocalSong(song) {
        this.currentSource = 'audio';
        this.destroyYouTubePlayer();
        this.audio.src = song.path || '';
        this.songTitle.textContent = song.title || 'Unknown';
        this.artist.textContent = song.artist || '';
        this.albumArt.src = song.albumArt || 'placeholder.jpg';
        const backgroundBlur = document.getElementById('backgroundBlur');
        backgroundBlur.style.backgroundImage = `url(${song.albumArt || 'placeholder.jpg'})`;
        this.updateSourceBadge('local');
        if (song.lyricsPath) this.loadLyrics(song.lyricsPath);
        else {
            this.lyrics = [];
            this.currentLyric.textContent = 'Lirik tidak tersedia';
            this.nextLyric.textContent = '';
            this.futureLyric.textContent = '';
        }
        if (this.isPlaying) this.audio.play().catch(() => {});
    }

    async loadYouTubeSong(videoId, song) {
        this.currentSource = 'youtube';
        try { this.audio.pause(); } catch (e) {}
        this.songTitle.textContent = song.title || 'YouTube Audio';
        this.artist.textContent = song.artist || '';
        // Use YouTube thumbnail if no albumArt specified
        const albumArt = song.albumArt || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        this.albumArt.src = albumArt;
        const backgroundBlur = document.getElementById('backgroundBlur');
        backgroundBlur.style.backgroundImage = `url(${albumArt})`;
        this.updateSourceBadge('youtube');

        if (song.lyricsPath) {
            await this.loadLyrics(song.lyricsPath);
        } else {
            await this.fetchYouTubeCaptions(videoId);
        }

        await this.ensureYouTubeApi();

        // Use the pre-existing container from HTML
        const container = document.getElementById('youtubePlayerContainer');
        if (!this.youtubeIframeContainer) {
            // Create an inner div for the YT.Player to replace
            this.youtubeIframeContainer = document.createElement('div');
            this.youtubeIframeContainer.id = 'youtubePlayer';
            container.innerHTML = '';
            container.appendChild(this.youtubeIframeContainer);
        }

        if (this.ytPlayer) {
            try {
                this.ytPlayer.loadVideoById(videoId);
            } catch (e) {
                try { this.ytPlayer.destroy(); } catch (ee) {}
                this.ytPlayer = null;
            }
        }

        if (!this.ytPlayer) {
            this.ytPlayer = new YT.Player(this.youtubeIframeContainer.id, {
                height: '0',
                width: '0',
                videoId: videoId,
                playerVars: { controls: 0, showinfo: 0, modestbranding: 1, rel: 0, playsinline: 1 },
                events: {
                    onReady: (e) => {
                        try { e.target.setVolume(parseInt(this.volumeBar.value, 10)); } catch (ex) {}
                        if (this.isPlaying) try { e.target.playVideo(); } catch (ex) {}
                        this.updateDuration();
                    },
                    onStateChange: (e) => {
                        const YTState = window.YT && window.YT.PlayerState;
                        if (YTState && e.data === YTState.ENDED) {
                            this.playNext();
                        } else if (YTState && e.data === YTState.PLAYING) {
                            this.isPlaying = true;
                            this.startYTTimer();
                            this.playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
                        } else if (YTState && e.data === YTState.PAUSED) {
                            this.isPlaying = false;
                            this.stopYTTimer();
                            this.playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
                        }
                    }
                }
            });
        }
    }

    ensureYouTubeApi() {
        if (this.ytApiReadyPromise) return this.ytApiReadyPromise;
        this.ytApiReadyPromise = new Promise((resolve) => {
            if (window.YT && window.YT.Player) {
                this.ytApiReady = true;
                resolve();
                return;
            }
            const prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                this.ytApiReady = true;
                if (typeof prev === 'function') prev();
                resolve();
            };
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(tag);
        });
        return this.ytApiReadyPromise;
    }

    startYTTimer() {
        if (this.ytPollIntervalId) return;
        this.ytPollIntervalId = setInterval(() => this.updateProgress(), 250);
    }

    stopYTTimer() {
        if (!this.ytPollIntervalId) return;
        clearInterval(this.ytPollIntervalId);
        this.ytPollIntervalId = null;
    }

    destroyYouTubePlayer() {
        if (this.ytPlayer) {
            try { this.ytPlayer.destroy(); } catch (e) {}
            this.ytPlayer = null;
        }
        this.stopYTTimer();
        // Clear the inner content but keep the container in the DOM
        if (this.youtubeIframeContainer) {
            this.youtubeIframeContainer = null;
        }
        const container = document.getElementById('youtubePlayerContainer');
        if (container) container.innerHTML = '';
    }

    async fetchYouTubeCaptions(videoId) {
        this.lyrics = [];
        this.currentLyricIndex = 0;
        const attemptUrls = [
            `https://www.youtube.com/api/timedtext?v=${videoId}&fmt=json3&tlang=id`,
            `https://www.youtube.com/api/timedtext?v=${videoId}&fmt=json3`,
            `https://video.google.com/timedtext?v=${videoId}&fmt=json3&tlang=id`,
            `https://video.google.com/timedtext?v=${videoId}&fmt=json3`
        ];
        for (const url of attemptUrls) {
            try {
                const res = await fetch(url);
                if (!res.ok) continue;
                const text = await res.text();
                if (!text) continue;
                const trimmed = text.trim();
                if (trimmed.startsWith('{')) {
                    const data = JSON.parse(trimmed);
                    if (data && data.events) {
                        this.lyrics = data.events.map(ev => {
                            const time = (ev.tStartMs || 0) / 1000;
                            const segs = ev.segs || [];
                            const str = segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ').trim();
                            return { time, text: str };
                        });
                        break;
                    }
                } else if (trimmed.startsWith('<')) {
                    const parser = new DOMParser();
                    const xml = parser.parseFromString(trimmed, 'application/xml');
                    const texts = Array.from(xml.getElementsByTagName('text'));
                    if (texts.length > 0) {
                        this.lyrics = texts.map(node => {
                            const start = parseFloat(node.getAttribute('start') || '0');
                            const content = (node.textContent || '').replace(/\n/g, ' ').trim();
                            return { time: start, text: content };
                        });
                        break;
                    }
                } else {
                    const parsed = this.parseLRC(text);
                    if (parsed.length > 0) { this.lyrics = parsed; break; }
                }
            } catch (err) { continue; }
        }
        this.lyrics.sort((a, b) => a.time - b.time);
        if (this.lyrics.length === 0) {
            this.currentLyric.textContent = 'Lirik tidak tersedia';
            this.nextLyric.textContent = '';
            this.futureLyric.textContent = '';
        }
    }

    async loadLyrics(lyricsPath) {
        if (!lyricsPath) {
            this.lyrics = [];
            this.currentLyric.textContent = 'Lirik tidak tersedia';
            this.nextLyric.textContent = '';
            this.futureLyric.textContent = '';
            return;
        }
        try {
            const response = await fetch(lyricsPath);
            if (!response.ok) throw new Error('Lyrics file not found or could not be loaded.');
            const lrcText = await response.text();
            this.lyrics = this.parseLRC(lrcText);
            this.currentLyricIndex = 0;
            if (this.lyrics.length === 0) {
                this.currentLyric.textContent = 'Lirik tidak tersedia';
                this.nextLyric.textContent = '';
                this.futureLyric.textContent = '';
            }
        } catch (error) {
            console.error('Error loading lyrics:', error);
            this.lyrics = [];
            this.currentLyric.textContent = 'Lirik tidak tersedia';
            this.nextLyric.textContent = '';
            this.futureLyric.textContent = '';
        }
    }

    parseLRC(lrcText) {
        const lines = lrcText.split('\n');
        const lyrics = [];
        lines.forEach(line => {
            const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2})\](.*)/);
            if (match) {
                const minutes = parseInt(match[1], 10);
                const seconds = parseInt(match[2], 10);
                const milliseconds = parseInt(match[3], 10) * 10;
                const time = minutes * 60 + seconds + milliseconds / 1000;
                const text = match[4].trim();
                lyrics.push({ time, text });
            }
        });
        return lyrics.sort((a, b) => a.time - b.time);
    }

    updateLyrics() {
        if (this.lyrics.length === 0) {
            this.currentLyric.textContent = 'Lirik tidak tersedia';
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
        if (!found && this.lyrics.length > 0) this.currentLyricIndex = this.lyrics.length - 1;
        this.currentLyric.textContent = this.lyrics[this.currentLyricIndex]?.text || '';
        this.nextLyric.textContent = this.lyrics[this.currentLyricIndex + 1]?.text || '';
        this.futureLyric.textContent = this.lyrics[this.currentLyricIndex + 2]?.text || '';
    }

    togglePlay() {
        if (this.isPlaying) {
            if (this.currentSource === 'audio') this.audio.pause();
            else if (this.currentSource === 'youtube' && this.ytPlayer) try { this.ytPlayer.pauseVideo(); } catch (e) {}
            this.playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            this.isPlaying = false;
        } else {
            if (this.currentSource === 'audio') this.audio.play().catch(() => {});
            else if (this.currentSource === 'youtube' && this.ytPlayer) try { this.ytPlayer.playVideo(); } catch (e) {}
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
        if (this.currentSource === 'audio') return this.audio.currentTime || 0;
        if (this.currentSource === 'youtube' && this.ytPlayer && this.ytApiReady) {
            try { return this.ytPlayer.getCurrentTime() || 0; } catch (e) { return 0; }
        }
        return 0;
    }

    getDuration() {
        if (this.currentSource === 'audio') return this.audio.duration || 0;
        if (this.currentSource === 'youtube' && this.ytPlayer && this.ytApiReady) {
            try { return this.ytPlayer.getDuration() || 0; } catch (e) { return 0; }
        }
        return 0;
    }

    updateProgress() {
        const currentTime = this.getCurrentTime();
        const duration = this.getDuration();
        const progress = (duration > 0) ? (currentTime / duration) * 100 : 0;
        this.progressBar.value = progress || 0;
        this.currentTimeDisplay.textContent = this.formatTime(currentTime || 0);
        this.updateLyrics();
    }

    updateDuration() {
        const duration = this.getDuration();
        this.durationDisplay.textContent = this.formatTime(duration || 0);
    }

    seek() {
        const duration = this.getDuration();
        const time = (this.progressBar.value / 100) * (duration || 0);
        if (this.currentSource === 'audio') {
            this.audio.currentTime = time;
        } else if (this.currentSource === 'youtube' && this.ytPlayer) {
            try { this.ytPlayer.seekTo(time, true); } catch (e) {}
        }
    }

    setVolume() {
        const val = parseInt(this.volumeBar.value, 10) || 0;
        if (this.currentSource === 'audio') {
            this.audio.volume = val / 100;
        }
        if (this.ytPlayer && this.ytApiReady) {
            try { this.ytPlayer.setVolume(val); } catch (e) {}
        }
    }

    formatTime(seconds) {
        if (!isFinite(seconds) || Number.isNaN(seconds)) seconds = 0;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    updateSourceBadge(source) {
        let badge = document.getElementById('sourceBadge');
        if (!badge) {
            badge = document.createElement('span');
            badge.id = 'sourceBadge';
            this.artist.parentNode.appendChild(badge);
        }
        if (source === 'youtube') {
            badge.innerHTML = '<i class="fab fa-youtube"></i> YouTube';
            badge.className = 'source-badge source-youtube';
            badge.style.display = 'inline-flex';
        } else {
            badge.innerHTML = '<i class="fas fa-music"></i> Local';
            badge.className = 'source-badge source-local';
            badge.style.display = 'inline-flex';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MusicPlayer();
});