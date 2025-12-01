import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scrapeMatches } from './ecuabet-match-scraper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const JSON_FILE = path.join(__dirname, 'all_matches.json');

app.use(cors());
app.use(express.json());

// GET endpoint: Devuelve los datos del archivo JSON actual
app.get('/api/matches', (req, res) => {
  try {
    if (fs.existsSync(JSON_FILE)) {
      const data = fs.readFileSync(JSON_FILE, 'utf8');
      res.json(JSON.parse(data));
    } else {
      res
        .status(404)
        .json({ message: 'No match data found. Run scrape first.' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST endpoint: Ejecuta el scraping y devuelve los datos frescos
app.post('/api/scrape', async (req, res) => {
  try {
    console.log('Starting scrape process via API...');
    const data = await scrapeMatches();

    // La función scrapeMatches ya guarda el archivo, pero devolvemos los datos aquí también
    res.json({
      success: true,
      message: 'Scraping completed successfully',
      count: data.length,
      data: data,
    });
  } catch (error) {
    console.error('Scraping failed:', error);
    res.status(500).json({
      success: false,
      message: 'Scraping failed',
      error: error.message,
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`- GET  /api/matches : Retrieve saved match data`);
  console.log(`- POST /api/scrape  : Trigger new scraping process`);
});
