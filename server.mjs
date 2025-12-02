import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  scrapeMatches,
  scrapePrematchEvents,
} from './ecuabet-match-scraper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const JSON_FILE = path.join(__dirname, 'all_matches.json');
const PREMATCH_JSON_FILE = path.join(__dirname, 'upcoming_matches.json');

// --- MIDDLEWARE DE SEGURIDAD ---
const validateApiKey = (req, res, next) => {
  // Obtenemos la API Key de los headers (x-api-key)
  const apiKey = req.headers['x-api-key'];

  // La clave debe estar en las variables de entorno de EasyPanel
  // Si no existe (local), usamos una por defecto para pruebas
  const validApiKey = process.env.API_KEY ;

  if (!apiKey || apiKey !== validApiKey) {
    console.log(`Intento de acceso no autorizado desde: ${req.ip}`);
    return res.status(401).json({
      success: false,
      message: 'Acceso denegado: API Key inválida o ausente.',
    });
  }

  next();
};

app.use(cors());
app.use(express.json());

// GET endpoint: Devuelve los datos del archivo JSON actual (Live)
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

// GET endpoint: Devuelve los datos del archivo JSON de Prematch
app.get('/api/matches/prematch', (req, res) => {
  try {
    if (fs.existsSync(PREMATCH_JSON_FILE)) {
      const data = fs.readFileSync(PREMATCH_JSON_FILE, 'utf8');
      res.json(JSON.parse(data));
    } else {
      res
        .status(404)
        .json({ message: 'No prematch data found. Run scrape first.' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST endpoint: Ejecuta el scraping (Live) y devuelve los datos frescos
app.post('/api/scrape', validateApiKey, async (req, res) => {
  try {
    console.log('Starting LIVE scrape process via API...');
    const data = await scrapeMatches();

    res.json({
      success: true,
      message: 'Live scraping completed successfully',
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

// POST endpoint: Ejecuta el scraping (Prematch) y devuelve los datos frescos
app.post('/api/ecuabet/scrape/prematch', validateApiKey, async (req, res) => {
  try {
    console.log('Starting PREMATCH scrape process via API...');
    const data = await scrapePrematchEvents();

    res.json({
      success: true,
      message: 'Prematch scraping completed successfully',
      count: data.length,
      data: data,
    });
  } catch (error) {
    console.error('Prematch scraping failed:', error);
    res.status(500).json({
      success: false,
      message: 'Prematch scraping failed',
      error: error.message,
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`- GET  /api/matches : Retrieve saved match data`);
  console.log(`- POST /api/scrape  : Trigger new scraping process`);
});
