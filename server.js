import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const app = express();

// Porta do serviço
const PORT = process.env.PORT || 3000;

// Diretório base onde os vídeos serão salvos dentro do container
// (no host você monta um volume para esse caminho)
const BASE_DIR = process.env.VIDEO_BASE_DIR || '/opt/video-downloader/videos';

// URL pública base (para montar o download_url na resposta do /upload)
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

// Garante que o diretório base exista
fs.mkdirSync(BASE_DIR, { recursive: true });

// Healthcheck raiz (para o EasyPanel / load balancer)
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'video-downloader', baseDir: BASE_DIR });
});

// Healthcheck simples adicional
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'video-downloader', baseDir: BASE_DIR });
});

// Storage do multer: define pasta e nome do arquivo
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { schema, worker_id } = req.body;

    if (!schema || !worker_id) {
      return cb(new Error('schema e worker_id são obrigatórios'));
    }

    const dir = path.join(BASE_DIR, schema);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const { schema, worker_id } = req.body;
    const filename = `${schema}_w_${worker_id}_full.mp4`;
    cb(null, filename);
  }
});

const upload = multer({ storage });

/**
 * POST /upload
 * multipart/form-data com:
 *  - campo arquivo: "video"
 *  - campos texto: "schema", "worker_id"
 */
app.post('/upload', upload.single('video'), (req, res) => {
  try {
    const { schema, worker_id } = req.body;

    if (!schema || !worker_id) {
      return res.status(400).json({ error: 'schema e worker_id são obrigatórios' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'arquivo de vídeo (campo "video") é obrigatório' });
    }

    const filePath = req.file.path;

    const downloadUrl =
      `${PUBLIC_BASE_URL}/video?schema=${encodeURIComponent(schema)}&worker_id=${encodeURIComponent(worker_id)}`;

    return res.json({
      success: true,
      schema,
      worker_id,
      stored_path: filePath,
      download_url: downloadUrl
    });
  } catch (err) {
    console.error('Erro no /upload:', err);
    return res.status(500).json({ error: 'Erro interno no upload' });
  }
});

/**
 * GET /video?schema=channeltest&worker_id=1
 * Retorna o arquivo para download
 */
app.get('/video', (req, res) => {
  try {
    const { schema, worker_id } = req.query;

    if (!schema || !worker_id) {
      return res.status(400).json({ error: 'schema e worker_id são obrigatórios na query' });
    }

    const filename = `${schema}_w_${worker_id}_full.mp4`;
    const filePath = path.join(BASE_DIR, schema, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Vídeo não encontrado' });
    }

    return res.download(filePath, filename);
  } catch (err) {
    console.error('Erro no /video:', err);
    return res.status(500).json({ error: 'Erro interno ao servir vídeo' });
  }
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Video downloader rodando na porta ${PORT}`);
});
