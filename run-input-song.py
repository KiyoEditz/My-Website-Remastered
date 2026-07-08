import tkinter as tk
from tkinter import filedialog, messagebox
import os
import json
try:
    from mutagen.flac import FLAC
except ImportError:
    pass
import subprocess

class FLACConverterApp:
    def __init__(self, root):
        self.root = root
        self.root.title("FLAC to Web Music Converter")
        self.root.geometry("550x350")
        self.root.configure(bg="#F8FAFC")
        
        self.flac_path = tk.StringVar()
        
        tk.Label(root, text="Luminous Tech-Pop FLAC Importer", font=("Segoe UI", 16, "bold"), bg="#F8FAFC", fg="#0F172A").pack(pady=20)
        
        frame = tk.Frame(root, bg="#F8FAFC")
        frame.pack(fill="x", padx=30, pady=10)
        
        tk.Label(frame, text="Pilih File FLAC:", bg="#F8FAFC", fg="#64748B", font=("Segoe UI", 10)).pack(anchor="w")
        
        input_frame = tk.Frame(frame, bg="#F8FAFC")
        input_frame.pack(fill="x", pady=5)
        
        tk.Entry(input_frame, textvariable=self.flac_path, state="readonly", width=45, font=("Segoe UI", 10)).pack(side="left", ipady=4)
        tk.Button(input_frame, text="Browse", command=self.browse_file, bg="#06B6D4", fg="white", font=("Segoe UI", 9, "bold"), relief="flat", padx=10).pack(side="right", padx=10, ipady=2)
        
        self.status_var = tk.StringVar()
        self.status_var.set("Menunggu file...")
        tk.Label(root, textvariable=self.status_var, fg="#6366F1", bg="#F8FAFC", font=("Segoe UI", 10, "italic"), wraplength=500).pack(pady=15)
        
        tk.Button(root, text="Proses & Masukkan ke Website", bg="#6366F1", fg="white", font=("Segoe UI", 11, "bold"), command=self.process_file, relief="flat", padx=20, pady=8).pack(pady=10)
        
        tk.Label(root, text="Pastikan telah menginstal: pip install mutagen pydub\nDan pastikan ffmpeg terinstal di sistem Anda.", fg="#64748B", bg="#F8FAFC", font=("Segoe UI", 8)).pack(side="bottom", pady=10)

    def browse_file(self):
        filepath = filedialog.askopenfilename(filetypes=[("FLAC files", "*.flac")])
        if filepath:
            self.flac_path.set(filepath)

    def process_file(self):
        try:
            # Check if libraries are imported successfully
            import mutagen
        except ImportError:
            messagebox.showerror("Error", "Pustaka 'mutagen' tidak ditemukan.\nSilakan jalankan: pip install mutagen")
            return

        filepath = self.flac_path.get()
        if not filepath:
            messagebox.showwarning("Peringatan", "Silakan pilih file FLAC terlebih dahulu!")
            return
            
        self.status_var.set("Memproses metadata FLAC...")
        self.root.update()
        
        try:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            music_dir = os.path.join(base_dir, "music")
            lyrics_dir = os.path.join(base_dir, "lyrics")
            images_dir = os.path.join(base_dir, "images")
            
            os.makedirs(music_dir, exist_ok=True)
            os.makedirs(lyrics_dir, exist_ok=True)
            os.makedirs(images_dir, exist_ok=True)
            
            basename = os.path.splitext(os.path.basename(filepath))[0]
            clean_name = "".join(c for c in basename if c.isalnum() or c in (' ', '-', '_')).replace(' ', '_').lower()
            
            audio = FLAC(filepath)
            title = audio.get('title', [basename])[0]
            artist = audio.get('artist', ['Unknown Artist'])[0]
            
            lyrics_data = None
            if 'lyrics' in audio:
                lyrics_data = audio['lyrics'][0]
            elif 'unsyncedlyrics' in audio:
                lyrics_data = audio['unsyncedlyrics'][0]
                
            lyrics_path = None
            if lyrics_data:
                lrc_filepath = os.path.join(lyrics_dir, f"{clean_name}.lrc")
                with open(lrc_filepath, 'w', encoding='utf-8') as f:
                    f.write(lyrics_data)
                lyrics_path = f"lyrics/{clean_name}.lrc"
                
            image_path = None
            if audio.pictures:
                pic = audio.pictures[0]
                ext = ".jpg" if pic.mime == "image/jpeg" else ".png"
                img_filepath = os.path.join(images_dir, f"{clean_name}{ext}")
                with open(img_filepath, 'wb') as f:
                    f.write(pic.data)
                image_path = f"images/{clean_name}{ext}"
                
            self.status_var.set("Mengonversi FLAC ke MP3 (Membutuhkan beberapa saat)...")
            self.root.update()
            
            mp3_filepath = os.path.join(music_dir, f"{clean_name}.mp3")
            try:
                subprocess.run(
                    ['ffmpeg', '-i', filepath, '-b:a', '192k', mp3_filepath, '-y'],
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
            except Exception as e:
                messagebox.showerror("FFmpeg Error", f"Gagal mengonversi lagu dengan ffmpeg.\nPastikan ffmpeg sudah terinstal dan masuk PATH.\n\nDetail: {e}")
                return
            mp3_rel_path = f"music/{clean_name}.mp3"
            
            self.status_var.set("Menyimpan ke config.json...")
            self.root.update()
            
            config_path = os.path.join(base_dir, "config.json")
            if os.path.exists(config_path):
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    
                default_playlist = config.get("defaultPlaylist", "")
                if default_playlist and default_playlist in config.get("playlists", {}):
                    new_song = {
                        "title": title,
                        "artist": artist,
                        "path": mp3_rel_path
                    }
                    if image_path:
                        new_song["albumArt"] = image_path
                    if lyrics_path:
                        new_song["lyricsPath"] = lyrics_path
                        
                    config["playlists"][default_playlist].append(new_song)
                    
                    with open(config_path, 'w', encoding='utf-8') as f:
                        json.dump(config, f, indent=2, ensure_ascii=False)
                else:
                    self.status_var.set("Lagu berhasil diproses, namun config.json tidak memiliki 'defaultPlaylist'.")
                    messagebox.showwarning("Peringatan Config", "Lagu berhasil dikonversi, namun tidak bisa dimasukkan otomatis karena 'defaultPlaylist' tidak ditemukan di config.json.")
                    return
            else:
                self.status_var.set("Lagu berhasil diproses, namun config.json tidak ditemukan.")
                messagebox.showwarning("Peringatan Config", "File config.json tidak ditemukan. Lagu tidak ditambahkan ke playlist secara otomatis.")
                return
                        
            self.status_var.set(f"Selesai! {title} berhasil ditambahkan.")
            messagebox.showinfo("Sukses", f"Lagu '{title}' berhasil diproses dan langsung ditambahkan ke website!")
            
        except Exception as e:
            self.status_var.set("Terjadi kesalahan!")
            messagebox.showerror("Error", str(e))

if __name__ == "__main__":
    root = tk.Tk()
    app = FLACConverterApp(root)
    root.mainloop()
