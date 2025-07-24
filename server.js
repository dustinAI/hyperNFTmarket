import express from 'express';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { startApp } from './src/main.js';
import fs from 'fs/promises';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Global Error Handlers ---
process.on('unhandledRejection', (reason, promise) => { console.error('FATAL Unhandled Rejection:', reason, promise); });
process.on('uncaughtException', (error) => { console.error('FATAL Uncaught Exception:', error); process.exit(1); });

async function getCuratedNftMetadataCache() {
    const metadataMap = new Map();
    const collectionsPath = path.join(__dirname, 'public', 'collections');
    try {
        const collectionFolders = await fs.readdir(collectionsPath, { withFileTypes: true });

        for (const dirent of collectionFolders) {
            if (dirent.isDirectory()) {
                const jsonPath = path.join(collectionsPath, dirent.name, 'metadata_con_rareza.json');
                try {
                    const fileContent = await fs.readFile(jsonPath, 'utf-8');
                    const metadata = JSON.parse(fileContent);
                    if (Array.isArray(metadata)) {
                        for (const nft of metadata) {
                            if (nft.file_id) {
                                metadataMap.set(nft.file_id, nft);
                            }
                        }
                    }
                } catch (e) {
                    // Ignorar carpetas sin JSON o con errores
                }
            }
        }
    } catch (e) {
        console.warn('[Cache] No se pudo leer el directorio de colecciones.');
    }
    console.log(`[Cache] Cargados los metadatos de ${metadataMap.size} NFTs curados.`);
    return metadataMap;
}

async function addToMintLog(newRecord) {
    const outputDir = path.join(__dirname, 'minted_output');
    const logFilePath = path.join(outputDir, 'mint_log.json');

    try {
        await fs.mkdir(outputDir, { recursive: true });
        let logData = [];
        try {
            const currentLog = await fs.readFile(logFilePath, 'utf-8');
            logData = JSON.parse(currentLog);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
        
        logData.push(newRecord);
        await fs.writeFile(logFilePath, JSON.stringify(logData, null, 2));
    } catch (error) {
        console.error(`[FATAL] No se pudo actualizar mint_log.json:`, error);
    }
}

async function main() {
    const storageName = process.argv[2];
    console.log(`Starting P2P node in storage: "${storageName || 'default'}"...`);

    const app = await startApp(storageName);
    const peer = app.getPeer();
    const protocol = peer.protocol_instance;
    
    
    let isPeerReadyForQueries = false;
    
    
    const nftCachePath = path.join(__dirname, 'public', 'nft-cache');
    const collectionsPath = path.join(__dirname, 'public', 'collections');
    await fs.mkdir(nftCachePath, { recursive: true });
    await fs.mkdir(collectionsPath, { recursive: true });
    const curatedNftMetadataCache = await getCuratedNftMetadataCache();
    
    
    const server = express();
    const port = process.env.PORT || 3000;
    const upload = multer({ dest: 'uploads/' });
    server.use(cors());
    server.use(express.json());
    server.use(express.static(path.join(__dirname, 'public')));
    
    

    server.get('/api/status', (req, res) => {
        res.json({ ready: isPeerReadyForQueries });
    });

    server.get('/api/curated-collections', async (req, res) => {
    if (!isPeerReadyForQueries) return res.status(503).json({ error: 'P2P server is not ready yet.' });
    try {
        const collectionsPath = path.join(__dirname, 'public', 'collections');
        const collectionFolders = await fs.readdir(collectionsPath, { withFileTypes: true });

        const collectionsData = await Promise.all(
            collectionFolders
                .filter(dirent => dirent.isDirectory())
                .map(async (dirent) => {
                    const collectionName = dirent.name;
                    const imagePath = `/collections/${collectionName}/portada.png`; 
                    return {
                        id: collectionName,
                        name: collectionName.charAt(0).toUpperCase() + collectionName.slice(1),
                        imageUrl: imagePath,
                        type: 'curated' // Para distinguirlas
                    };
                })
        );
        res.json(collectionsData);
    } catch (e) {
        console.error('[API /api/curated-collections] Error:', e);
        res.status(500).json([]); // Devolver array vacío en caso de error
    }
});
server.get('/api/curated-collections/:collectionName', async (req, res) => {
    if (!isPeerReadyForQueries) return res.status(503).json({ error: 'P2P server is not ready yet.' });
    try {
        const { collectionName } = req.params;
        
        // Medida de seguridad para evitar que se acceda a directorios no deseados.
        if (!collectionName || collectionName.includes('..')) {
            return res.status(400).json({ error: 'Invalid collection name.' });
        }

        const filePath = path.join(__dirname, 'public', 'collections', collectionName, 'metadata_con_rareza.json');

        // Leer el archivo de metadatos de la colección.
        const fileContent = await fs.readFile(filePath, 'utf-8');
        
        // Devolver el contenido del archivo JSON directamente.
        res.setHeader('Content-Type', 'application/json');
        res.send(fileContent);

    } catch (e) {
        if (e.code === 'ENOENT') {
            return res.status(404).json({ error: 'Collection data not found.' });
        }
        console.error(`[API /api/curated-collections/${req.params.collectionName}] Error:`, e);
        res.status(500).json({ error: 'Could not retrieve collection data.' });
    }
});
server.get('/api/collection/:collectionId', async (req, res) => {
    if (!isPeerReadyForQueries) return res.status(503).json({ error: 'P2P server is not ready yet.' });
    try {
        const { collectionId } = req.params;
        await peer.base.update();
        const collectionsString = await protocol.get('market_collections');
        const collections = collectionsString ? JSON.parse(collectionsString) : [];
        const collectionData = collections.find(c => c.id === collectionId);
        if (!collectionData) return res.status(404).json({ error: 'Collection not found.' });

        const manifestFileId = collectionData.manifest;
        const tempManifestPath = await protocol.downloadNFT(manifestFileId, '.');
        const manifestContent = await fs.readFile(tempManifestPath, 'utf-8');
        await fs.unlink(tempManifestPath);
        const manifest = JSON.parse(manifestContent);

        const enrichedItems = [];
        for (const fileId of manifest.items) {
            const metadata = await protocol.get(`file_meta/${fileId}`);
            enrichedItems.push({
                file_id: fileId,
                filename: metadata ? metadata.filename : `NFT-${fileId.substring(0,8)}...`
            });
        }
        res.json({ collection: collectionData, items: enrichedItems });
    } catch (e) {
        res.status(500).json({ error: 'Server error while processing collection.', details: e.message });
    }
});
server.get('/api/collections', async (req, res) => {
    if (!isPeerReadyForQueries) return res.status(503).json({ error: 'P2P server is not ready yet.' });
    try {
        await peer.base.update();
        const collectionsString = await protocol.get('market_collections');
        let allCollections = [];
        if (collectionsString) {
            allCollections = JSON.parse(collectionsString);
            if (!Array.isArray(allCollections)) allCollections = [];
        }
        res.json(allCollections);
    } catch (e) {
        console.error('[API /api/collections] ERROR:', e);
        res.status(500).json([]); // Devolver array vacío en caso de error
    }
});
    server.get('/api/get-wallet-info', (req, res) => {
        if (!isPeerReadyForQueries || !peer.wallet || !peer.wallet.publicKey) {
            return res.status(503).json({ success: false, error: 'Peer wallet not initialized yet.' });
        }
        res.json({
            success: true,
            publicKey: peer.wallet.publicKey
        });
    });

    
    server.get('/api/listings', async (req, res) => {
        try {
            if (!isPeerReadyForQueries) return res.status(503).json({ error: 'P2P server is not ready yet.' });
            await peer.base.update();
            const allListings = [];
            const stream = peer.base.view.createReadStream({ gte: 'listings/', lt: 'listings/z' });
            for await (const { key, value } of stream) {
                if (value) {
                    const file_id = key.split('/')[1];
                    if (!curatedNftMetadataCache.has(file_id)) {
                        const metadata = await protocol.get(`file_meta/${file_id}`);
                        allListings.push({
                            ...value,
                            file_id: file_id,
                            filename: metadata ? metadata.filename : `NFT-${file_id.substring(0,8)}...`,
                            price: protocol.fromBigIntString(value.price, 18)
                        });
                    }
                }
            }
            res.json(allListings);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    server.get('/api/my-nfts/:address', async (req, res) => {
        try {
            if (!isPeerReadyForQueries) return res.status(503).json({ error: 'P2P server is not ready yet.' });
            await peer.base.update();
            const { address } = req.params;
            const nftIds = await protocol.get(`user_nfts/${address}`) || [];

            const nfts = [];
            for (const id of nftIds) {
                const metadata = await protocol.get(`file_meta/${id}`);
                if (metadata) {
                    let nftData = { file_id: id, filename: metadata.filename, seller_address: address };
                    if (curatedNftMetadataCache.has(id)) {
                        const curatedDetails = curatedNftMetadataCache.get(id);
                        nftData = { ...nftData, ...curatedDetails };
                    }
                    const listingData = await protocol.get(`listings/${id}`);
                    if (listingData) {
                        nftData.price = protocol.fromBigIntString(listingData.price, 18);
                    }
                    nfts.push(nftData);
                }
            }
            res.json(nfts);
        } catch (e) {
            console.error('[API /api/my-nfts] ERROR:', e);
            res.status(500).json({ error: e.message });
        }
    });

    server.get('/api/balance/:address', async (req, res) => {
        try {
            if (!isPeerReadyForQueries) return res.status(503).json({ error: 'P2P server is not ready yet.' });
            await peer.base.update();
            const { address } = req.params;
            const balance = await protocol.get(`internal_balances/${address}`);
            res.json({ balance: protocol.fromBigIntString(balance || '0', 18) });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
    
    
    server.post('/api/actions/buy', async (req, res) => {
    if (!isPeerReadyForQueries) return res.status(503).json({ error: 'P2P server is not ready yet.' });
    try {
        const { file_id } = req.body;
        if (!file_id) return res.status(400).json({ error: 'file_id is required.' });

        // --- PRE-FLIGHT CHECK: VERIFICAR SALDO ANTES DE COMPRAR ---
        await peer.base.update();
        const buyer_address = peer.wallet.publicKey;
        const listing = await protocol.get(`listings/${file_id}`);
        if (!listing) throw new Error('This NFT is not for sale.');

        const price = protocol.safeBigInt(listing.price);
        const buyerBalance = protocol.safeBigInt(await protocol.get(`internal_balances/${buyer_address}`, '0'));

        if (buyerBalance < price) {
            return res.status(400).json({ error: 'Insufficient Funds', details: 'Your balance is not enough to purchase this NFT.' });
        }
        // --- FIN DEL CHEQUEO ---

        const command = { op: 'buy', file_id };
        await protocol._transact(command);
        res.json({ success: true, message: 'Purchase transaction submitted.' });
    } catch (e) {
        console.error('[API /api/actions/buy] ERROR:', e);
        res.status(500).json({ error: 'Failed to process purchase', details: e.message });
    }
});

    // Acción para listar un NFT
    server.post('/api/actions/list', async (req, res) => {
    if (!isPeerReadyForQueries) return res.status(503).json({ error: 'P2P server is not ready yet.' });
    try {
        const { file_id, price } = req.body;
        if (!file_id || !price) return res.status(400).json({ error: 'file_id and price are required.' });

        // --- INICIO DEL CHEQUEO PRE-VUELO ---
        await peer.base.update(); // Sincronizar con el estado más reciente
        const existingListing = await protocol.get(`listings/${file_id}`);

        if (existingListing) {
            console.error(`[Pre-Flight Failed] NFT ${file_id} is already listed.`);
            // Usamos el código de estado 409 Conflict
            return res.status(409).json({ 
                error: 'Already Listed', 
                details: 'This NFT is already for sale. You must delist it first.' 
            });
        }
        // --- FIN DEL CHEQUEO ---
        
        const command = { 
            op: 'listForSale', 
            file_id: file_id, 
            price: protocol.toBigIntString(price, 18), 
            owner_address: peer.wallet.publicKey 
        };
        await protocol._transact(command);

        res.json({ success: true, message: 'List transaction submitted.' });
    } catch (e) {
        console.error('[API /api/actions/list] ERROR:', e);
        res.status(500).json({ error: 'Failed to process listing', details: e.message });
    }
});

    // Acción para retirar un NFT de la venta
    server.post('/api/actions/delist', async (req, res) => {
        if (!isPeerReadyForQueries) return res.status(503).json({ error: 'P2P server is not ready yet.' });
        try {
            const { file_id } = req.body;
            if (!file_id) return res.status(400).json({ error: 'file_id is required.' });

            const command = { op: 'delist', file_id, owner_address: peer.wallet.publicKey };
            await protocol._transact(command);

            res.json({ success: true, message: 'Delist transaction submitted.' });
        } catch (e) {
            console.error('[API /api/actions/delist] ERROR:', e);
            res.status(500).json({ error: 'Failed to process delisting', details: e.message });
        }
    });

    // Acción para transferir un NFT
    server.post('/api/actions/transfer', async (req, res) => {
        if (!isPeerReadyForQueries) return res.status(503).json({ error: 'P2P server is not ready yet.' });
        try {
            const { file_id, to_address } = req.body;
            if (!file_id || !to_address) return res.status(400).json({ error: 'file_id and to_address are required.' });

            const command = { op: 'transfer_file', file_id, to_address, owner_address: peer.wallet.publicKey };
            await protocol._transact(command);

            res.json({ success: true, message: 'Transfer transaction submitted.' });
        } catch (e) {
            console.error('[API /api/actions/transfer] ERROR:', e);
            res.status(500).json({ error: 'Failed to process transfer', details: e.message });
        }
    });
    
    server.post('/api/actions/mint', upload.single('nftFile'), async (req, res) => {
    if (!isPeerReadyForQueries) return res.status(503).json({ error: 'P2P server is not ready yet.' });
    
    const tempFilePath = req.file ? req.file.path : null;
    if (!tempFilePath) {
        return res.status(400).json({ error: 'File is required.' });
    }

    try {
        const owner_address = peer.wallet.publicKey;

        // --- PUNTO CRÍTICO DE REVISIÓN ---
        // Asegúrate de que la función que se llama aquí es "mintNFTAsOperator".
        // Esta es la función correcta que devuelve un objeto con { file_id, filename }.
        const result = await protocol.mintNFTAsOperator(tempFilePath, owner_address);
        
        // Se añade una verificación para mayor seguridad.
        if (!result) {
            throw new Error("Minting function did not return the expected result object.");
        }

        // Ahora esta línea es segura porque 'result' es un objeto válido.
        const { file_id, filename } = result;

        const logEntry = {
            file_id: file_id,
            filename: filename,
            owner_address: owner_address,
            minted_at: new Date().toISOString()
        };
        await addToMintLog(logEntry);
        console.log(`[Log] Se ha registrado el mint del ID: ${file_id}`);

        res.json({ 
            success: true, 
            message: 'NFT minted and logged successfully.',
            file_id: file_id,
            filename: filename
        });

    } catch (e) {
        console.error('[API /api/actions/mint] ERROR:', e);
        res.status(500).json({ error: 'Failed to mint NFT', details: e.message });
    } finally {
        if (tempFilePath) {
            try { await fs.unlink(tempFilePath); } catch (e) { /* ignore */ }
        }
    }
});
    server.post('/api/actions/withdrawal', async (req, res) => {
    if (!isPeerReadyForQueries) return res.status(503).json({ error: 'P2P server is not ready yet.' });
    try {
        const { amount } = req.body;
        if (!amount) return res.status(400).json({ error: 'Amount is required.' });

        const user_address = peer.wallet.publicKey;
        
        // Chequeo pre-vuelo del saldo (esto ya lo teníamos y es correcto)
        await peer.base.update();
        const withdrawalAmountBigInt = protocol.safeBigInt(protocol.toBigIntString(amount, 18));
        const userBalanceBigInt = protocol.safeBigInt(await protocol.get(`internal_balances/${user_address}`, '0'));
        if (userBalanceBigInt < withdrawalAmountBigInt) {
             return res.status(400).json({ error: 'Insufficient Funds', details: 'Your balance is not enough for this withdrawal.' });
        }

        // --- INICIO DE LA CORRECCIÓN: CONSTRUIR LA FIRMA ---

        // 1. Crear el objeto de datos que se va a firmar (sin 'op').
        const commandForSigning = {
            amount: protocol.toBigIntString(amount, 18)
        };

        // 2. Generar un nonce (número único) para la firma.
        const nonce = protocol.generateNonce();
        
        // 3. Crear el mensaje a firmar, exactamente como el contrato espera.
        const messageToSign = JSON.stringify(commandForSigning) + nonce;

        // 4. Firmar el mensaje con la clave secreta del peer.
        const signature = peer.wallet.sign(messageToSign);

        // 5. Construir el comando final para la transacción, incluyendo 'signature_data'.
        const commandWithSignature = {
            op: 'requestWithdrawal',
            ...commandForSigning,
            signature_data: {
                signature: signature,
                nonce: nonce,
                from_address: user_address
            }
        };
        

        await protocol._transact(commandWithSignature); 

        res.json({ success: true, message: 'Withdrawal request submitted.' });
    } catch (e) {
        console.error('[API /api/actions/withdrawal] ERROR:', e);
        res.status(500).json({ error: 'Failed to process withdrawal request', details: e.message });
    }
});
    
    server.get('/api/marketplace-address', async (req, res) => {
    if (!isPeerReadyForQueries) return res.status(503).json({ error: 'P2P server is not ready yet.' });
    try {
        await peer.base.update(); // Sincronizar para obtener el último estado
        const adminAddress = await protocol.get('admin');

        if (adminAddress) {
            res.json({ address: adminAddress });
        } else {
            res.status(404).json({ 
                error: 'Marketplace Not Initialized', 
                details: 'The administrator address has not been set yet.' 
            });
        }
    } catch (e) {
        console.error("[API /api/marketplace-address] Error:", e);
        res.status(500).json({ error: 'Server Error', details: e.message });
    }
});
    // El resto de las rutas que no cambian (imágenes, etc.)
    server.get('/api/nft-image/:file_id', async (req, res) => {
    const { file_id } = req.params;
    try {
        if (!file_id) return res.status(400).send('File ID is required.');
        
        const metadata = await protocol.get(`file_meta/${file_id}`);
        if (!metadata || !metadata.filename) {
            return res.status(404).send('NFT metadata not found.');
        }
        
        const originalFilename = metadata.filename;
        const fileExtension = path.extname(originalFilename);
        const canonicalCacheFilename = `${file_id}${fileExtension}`;

        // Lógica de caché híbrida (no la modificamos)
        let foundPath = null;
        const collectionDirs = await fs.readdir(collectionsPath);
        for (const dir of collectionDirs) {
            const collectionItemPath = path.join(collectionsPath, dir, originalFilename);
            try {
                await fs.access(collectionItemPath);
                foundPath = `/collections/${dir}/${originalFilename}`;
                break;
            } catch (e) { /* File not in this dir, continue */ }
        }

        if (!foundPath) {
            const defaultCachePath = path.join(nftCachePath, canonicalCacheFilename);
            try {
                await fs.access(defaultCachePath);
                foundPath = `/nft-cache/${canonicalCacheFilename}`;
            } catch (e) { /* Not in default cache either */ }
        }
        
        if (foundPath) {
            return res.redirect(foundPath);
        }

        // Lógica de descarga y renombrado (la clave del éxito)
        console.log(`[Cache Miss] Downloading image for file_id: ${file_id}`);
        const tempDownloadPath = await protocol.downloadNFT(file_id, nftCachePath);
        
        const newCachePath = path.join(nftCachePath, canonicalCacheFilename);
        await fs.rename(tempDownloadPath, newCachePath);
        
        res.redirect(`/nft-cache/${canonicalCacheFilename}`);

    } catch (e) {
        console.error(`[NFT Image Server] Error serving ${file_id}:`, e);
        res.status(500).sendFile(path.join(__dirname, 'public', 'images', 'placeholder.png'));
    }
});
    server.get('/api/all-listings', async (req, res) => {
    if (!isPeerReadyForQueries) return res.status(503).json({ error: 'P2P server is not ready yet.' });
    try {
        await peer.base.update();
        const allListings = [];
        const stream = peer.base.view.createReadStream({ gte: 'listings/', lt: 'listings/z' });
        
        for await (const { key, value } of stream) {
            // Esta versión no tiene el filtro `if (!curatedNftMetadataCache.has(file_id))`
            // por lo que devuelve TODOS los NFTs en venta.
            if (value) {
                const file_id = key.split('/')[1];
                const metadata = await protocol.get(`file_meta/${file_id}`);
                allListings.push({ 
                    ...value,
                    file_id: file_id, 
                    filename: metadata ? metadata.filename : `NFT-${file_id.substring(0,8)}...`,
                    price: protocol.fromBigIntString(value.price, 18)
                });
            }
        }
        res.json(allListings);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
    server.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    server.listen(port, () => {
        console.log(`HTTP Server listening at http://localhost:${port}`);
        console.log('[Status] Web server is running. Waiting for P2P peer to synchronize...');
    });

    await app.featuresLoadedPromise;
    
    isPeerReadyForQueries = true;
    console.log('[Status] Peer is synchronized and ready to receive API queries.');
}

main().catch(error => { console.error("Application failed to start:", error); process.exit(1); });