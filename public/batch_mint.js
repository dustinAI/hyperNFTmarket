// --- START OF FILE batch_mint.js ---

import fs from 'fs/promises';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';

// =================================================================
// --- CONFIGURACIÓN ---
// =================================================================
const API_BASE_URL = 'http://127.0.0.1:3000';
const DELAY_BETWEEN_MINTS_MS = 4000; // Pausa normal entre archivos exitosos.

// --- NUEVA CONFIGURACIÓN DE REINTENTOS ---
// Máximo de veces que el script intentará subir un MISMO archivo si falla.
const MAX_RETRIES_PER_FILE = 5; 
// Tiempo de espera en milisegundos antes de reintentar un archivo fallido.
const RETRY_DELAY_MS = 5000; 

const LOG_FILE = './mint_log.json'; 

// =================================================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function loadProcessedFiles() {
    try {
        const logContent = await fs.readFile(LOG_FILE, 'utf-8');
        return new Set(JSON.parse(logContent));
    } catch (error) {
        if (error.code === 'ENOENT') return new Set();
        console.error("⚠️ Advertencia: No se pudo leer el archivo de registro. Empezando desde cero.", error);
        return new Set();
    }
}

async function logProcessedFile(filename) {
    const processed = await loadProcessedFiles();
    processed.add(filename);
    await fs.writeFile(LOG_FILE, JSON.stringify(Array.from(processed), null, 2));
}

/**
 * --- FUNCIÓN MEJORADA PARA MINTEAR CON REINTENTOS ---
 * Intenta subir y mintear un solo archivo. Si falla, reintenta varias veces.
 * @param {string} filePath - La ruta completa al archivo de imagen.
 * @param {string} filename - El nombre del archivo.
 * @returns {boolean} - true si tuvo éxito, false si falló después de todos los reintentos.
 */
async function mintFileWithRetries(filePath, filename) {
    for (let attempt = 1; attempt <= MAX_RETRIES_PER_FILE; attempt++) {
        try {
            const form = new FormData();
            const fileStream = await fs.readFile(filePath);
            form.append('nftFile', fileStream, filename);

            const response = await fetch(`${API_BASE_URL}/api/actions/mint`, {
                method: 'POST', 
                body: form, 
                headers: form.getHeaders ? form.getHeaders() : {}
            });

            const result = await response.json();

            if (!response.ok) {
                // Si la API devuelve un error, lo lanzamos para que el catch lo maneje.
                throw new Error(result.details || result.error || `Respuesta de API no exitosa (Estado: ${response.status})`);
            }
            
            // ¡Éxito! El servidor confirmó que el NFT está completo.
            console.log(`  ✅ ÉXITO (en el intento ${attempt}/${MAX_RETRIES_PER_FILE}): ${filename} procesado. File ID: ${result.file_id}`);
            await logProcessedFile(filename);
            return true; // Indicamos que el minteo fue exitoso.

        } catch (error) {
            console.error(`  ❌ FALLO (intento ${attempt}/${MAX_RETRIES_PER_FILE}) al procesar ${filename}:`, error.message);
            
            if (attempt < MAX_RETRIES_PER_FILE) {
                // Si no es el último intento, esperamos antes de reintentar.
                console.log(`  ↪️ Reintentando en ${RETRY_DELAY_MS / 1000} segundos...`);
                await sleep(RETRY_DELAY_MS);
            } else {
                // Si ya se usaron todos los reintentos, nos damos por vencidos con este archivo.
                console.error(`  🚫 FRACASO TOTAL: No se pudo procesar ${filename} después de ${MAX_RETRIES_PER_FILE} intentos. Se omitirá.`);
                return false; // Indicamos que el minteo falló definitivamente.
            }
        }
    }
}


async function main() {
    const imagesDirArg = process.argv.slice(2)[0];
    if (!imagesDirArg) {
        console.error('❌ ERROR: Debes proporcionar la ruta a la carpeta de imágenes.');
        console.error('Ejemplo: node batch_mint.js ./mi-coleccion/imagenes');
        return;
    }
    const IMAGES_DIR = path.resolve(imagesDirArg);

    console.log('🚀 Iniciando el proceso de minteo en lote (modo robusto y resumible)...');
    
    const processedFiles = await loadProcessedFiles();
    console.log(`- ${processedFiles.size} archivos ya habían sido minteados y serán omitidos.`);

    try {
        const allImageFiles = await fs.readdir(IMAGES_DIR);
        const imageFilesToProcess = allImageFiles.filter(
            f => (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg')) && !processedFiles.has(f)
        );

        if (imageFilesToProcess.length === 0) {
            console.log('✅ ¡Todo listo! No hay nuevos archivos para mintear.');
            return;
        }

        console.log(`- Se encontraron ${imageFilesToProcess.length} nuevas imágenes para mintear.`);
        
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < imageFilesToProcess.length; i++) {
            const filename = imageFilesToProcess[i];
            const filePath = path.join(IMAGES_DIR, filename);

            console.log(`\n--- Procesando [${i + 1}/${imageFilesToProcess.length}]: ${filename} ---`);
            
            // --- LÓGICA DE MINTEO MEJORADA ---
            // Llamamos a la nueva función que maneja los reintentos internamente.
            const wasSuccessful = await mintFileWithRetries(filePath, filename);

            if (wasSuccessful) {
                successCount++;
            } else {
                errorCount++;
                // Opcional: Podrías crear un archivo de log para los errores si lo necesitas.
                // await fs.appendFile('./mint_errors.log', `${new Date().toISOString()}: ${filename}\n`);
            }
            
            // Pausa entre el procesamiento de diferentes archivos para no saturar el servidor.
            if (i < imageFilesToProcess.length - 1) {
                await sleep(DELAY_BETWEEN_MINTS_MS);
            }
        }

        console.log('\n\n✨ Proceso de Minteo Finalizado ✨');
        console.log(`- Exitosos en esta sesión: ${successCount}`);
        console.log(`- Fallidos permanentemente en esta sesión: ${errorCount}`);

    } catch (error) {
        console.error('\n\n❌ ¡ERROR FATAL!:', error.message);
        if (error.code === 'ENOENT') {
            console.error(`  Asegúrate de que la carpeta "${IMAGES_DIR}" existe.`);
        }
    }
}

main();

// --- END OF FILE batch_mint.js ---