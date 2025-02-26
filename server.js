const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const app = express();

// CORS-Headers hinzufügen
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// OPTIONS-Anfragen für CORS Pre-flight beantworten
app.options('*', (req, res) => {
    res.sendStatus(200);
});

// Statische Dateien servieren
app.use('/public', express.static('public'));

// Pfad zur Metadaten-Datei
const metadataPath = path.join(__dirname, 'wallpaper-metadata.json');

// Funktion zum Speichern der Metadaten
async function saveMetadata() {
    try {
        await fs.writeFile(metadataPath, JSON.stringify(wallpapers, null, 2));
    } catch (error) {
        console.error('Fehler beim Speichern der Metadaten:', error);
    }
}

// Funktion zum Laden der Metadaten
async function loadMetadata() {
    try {
        const data = await fs.readFile(metadataPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

// Funktion zum Einlesen der existierenden Wallpaper
async function loadExistingWallpapers() {
    try {
        const uploadsDir = path.join(__dirname, 'public/uploads');
        
        // Prüfen ob der Ordner existiert, wenn nicht erstellen
        try {
            await fs.access(uploadsDir);
        } catch {
            await fs.mkdir(uploadsDir, { recursive: true });
            return;
        }

        // Lade gespeicherte Metadaten
        const savedMetadata = await loadMetadata();
        const metadataMap = new Map(savedMetadata.map(w => [w.imageUrl, w]));

        // Alle Dateien im uploads Ordner einlesen
        const files = await fs.readdir(uploadsDir);
        
        // Für jede Datei einen Wallpaper-Eintrag erstellen oder wiederherstellen
        wallpapers = files
            .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
            .map(file => {
                const imageUrl = `/public/uploads/${file}`;
                const existingMetadata = metadataMap.get(imageUrl);
                
                if (existingMetadata) {
                    return existingMetadata;
                }

                return {
                    id: file.split('.')[0],
                    imageUrl: imageUrl,
                    title: file.split('.')[0],
                    description: '',
                    tags: '',
                    uploadDate: new Date().toISOString()
                };
            });

        await saveMetadata(); // Speichere initiale Metadaten
        console.log(`${wallpapers.length} existierende Wallpaper geladen`);
    } catch (error) {
        console.error('Fehler beim Laden der existierenden Wallpaper:', error);
    }
}

// Konfiguration für Multer (Datei-Upload)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // Limit auf 10MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb('Nur Bilddateien sind erlaubt!');
        }
    }
});

// Upload-Endpunkt
app.post('/upload', upload.single('wallpaper'), async (req, res) => {
    try {
        if (!req.file) {
            throw new Error('Keine Datei hochgeladen');
        }

        const wallpaperData = {
            id: Date.now().toString(),
            imageUrl: `/public/uploads/${req.file.filename}`,
            title: req.body.title || 'Ohne Titel',
            description: req.body.description || '',
            tags: req.body.tags || '',
            uploadDate: new Date().toISOString()
        };

        wallpapers.push(wallpaperData);
        await saveMetadata(); // Speichere Metadaten nach Upload

        res.json(wallpaperData);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Endpunkt zum Abrufen aller Wallpaper
app.get('/wallpapers', (req, res) => {
    res.json(wallpapers);
});

// Download-Endpunkt
app.get('/download/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const filepath = path.join(__dirname, 'public/uploads', filename);
        
        // Überprüfen, ob die Datei existiert
        await fs.access(filepath);
        
        res.download(filepath);
    } catch (error) {
        res.status(404).json({ error: 'Datei nicht gefunden' });
    }
});

// Delete-Endpunkt
app.delete('/delete/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const filepath = path.join(__dirname, 'public/uploads', filename);
        
        await fs.access(filepath);
        await fs.unlink(filepath);
        
        wallpapers = wallpapers.filter(w => !w.imageUrl.includes(filename));
        await saveMetadata(); // Speichere Metadaten nach Löschung
        
        res.json({ message: 'Wallpaper erfolgreich gelöscht' });
    } catch (error) {
        res.status(404).json({ error: 'Datei nicht gefunden' });
    }
});

// Edit-Endpunkt
app.put('/edit/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const { title, description, tags } = req.body;
        
        // Finde das Wallpaper in der Array
        const wallpaperIndex = wallpapers.findIndex(w => w.imageUrl.includes(filename));
        
        if (wallpaperIndex === -1) {
            throw new Error('Wallpaper nicht gefunden');
        }

        // Update die Metadaten
        wallpapers[wallpaperIndex] = {
            ...wallpapers[wallpaperIndex],
            title,
            description,
            tags
        };

        await saveMetadata(); // Speichere die aktualisierten Metadaten
        
        res.json(wallpapers[wallpaperIndex]);
    } catch (error) {
        res.status(404).json({ error: error.message });
    }
});

// Server starten
const PORT = process.env.PORT || 3003;
const HOST = '0.0.0.0';  // Änderung hier: Höre auf allen Interfaces

app.listen(PORT, HOST, async () => {
    console.log(`Server läuft auf http://${HOST}:${PORT}`);
    await loadExistingWallpapers();
});

app.use(express.json());
