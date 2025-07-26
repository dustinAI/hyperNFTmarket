// --- Lógica de app.js totalmente refactorizada y completa ---

// --- DOM Element References ---
const UIElements = {
    brandTitle: document.getElementById('brand-title'),
    walletWidget: document.getElementById('wallet-widget'),
    connectWalletBtn: document.getElementById('connect-wallet-btn'),
    walletInfo: document.getElementById('wallet-info'),
    walletAddressDisplay: document.getElementById('wallet-address-display'),
    myWalletBtn: document.getElementById('my-wallet-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    collectionsView: document.getElementById('collections-view'),
    myWalletView: document.getElementById('my-wallet-view'),
    collectionsGrid: document.getElementById('collections-grid'),
    myNftsGrid: document.getElementById('my-nfts-grid'),
    backToMarketplaceBtnWallet: document.getElementById('back-to-marketplace-btn-wallet'),
    modalOverlay: document.getElementById('modal-overlay'),
    modalBody: document.getElementById('modal-body'),
    modalClose: document.getElementById('modal-close'),
    userTapBalance: document.getElementById('user-tap-balance'),
    mintNftBtn: document.getElementById('mint-nft-btn'),
    mintFileInput: document.getElementById('mint-file-input'),
    selectUnlistedBtn: document.getElementById('select-unlisted-btn'),
    viewTitle: document.getElementById('view-title'),
    backToCollectionsBtn: document.getElementById('back-to-collections-btn'),
    collectionLayoutWrapper: document.getElementById('collection-layout-wrapper'),
    bulkActionBar: document.getElementById('bulk-action-bar'),
    marketplaceAddress: document.getElementById('marketplace-address'),
    requestWithdrawalBtn: document.getElementById('request-withdrawal-btn'),
    collectionsHubBtn: document.getElementById('collections-hub-btn'),
    communityMarketBtn: document.getElementById('my-wallet-btn'), // Usamos el mismo botón de "My Wallet" del header
    forSaleFilter: document.getElementById('for-sale-filter'),
    priceSort: document.getElementById('price-sort'),
    attributeFilters: document.getElementById('attribute-filters'),
    withdrawalAmountInput: document.getElementById('withdrawal-amount'),
    filtersContainer: document.querySelector('.filters-bar'), // Seleccionado por clase
    statusMessage: document.getElementById('status-message'),
};

// --- Application State ---
let appState = {
    wallet: null,
    listings: [],
    myNfts: [],
    balance: '0.00',
    selectedItems: new Set(),
    currentView: 'collections',
    currentCollectionData: [], 
    activeFilters: {}
};

const API_BASE_URL = window.location.origin;

// --- API Object ---
const api = {
    _get: (endpoint) => fetch(`${API_BASE_URL}${endpoint}`).then(res => res.json()),
    _post: async (endpoint, body) => {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.details || data.error || 'An unknown error occurred.');
        return data;
    },
    getStatus: () => api._get('/api/status'),
    getWalletInfo: () => api._get('/api/get-wallet-info'),
    getListings: () => api._get('/api/listings'),
    getAllListings: () => api._get('/api/all-listings'),
    getMyNfts: (address) => api._get(`/api/my-nfts/${address}`),
    getBalance: (address) => api._get(`/api/balance/${address}`),
    getCuratedCollections: () => api._get('/api/curated-collections'),
    getNetworkCollectionData: (collectionId) => api._get(`/api/collection/${collectionId}`),
    getCuratedCollectionData: (name) => api._get(`/api/curated-collections/${name}`),
    buyNft: (file_id) => api._post('/api/actions/buy', { file_id }),
    listNft: (file_id, price) => api._post('/api/actions/list', { file_id, price }),
    delistNft: (file_id) => api._post('/api/actions/delist', { file_id }),
    requestWithdrawal: (amount) => api._post('/api/actions/withdrawal', { amount }),
    getNetworkCollections: () => api._get('/api/collections'),
    getMarketplaceAddress: () => api._get('/api/marketplace-address'),
    transferNft: (file_id, to_address) => api._post('/api/actions/transfer', { file_id, to_address }),
    mintNft: async (formData) => {
        const response = await fetch(`${API_BASE_URL}/api/actions/mint`, { method: 'POST', body: formData });
        const data = await response.json();
        if (!response.ok) throw new Error(data.details || data.error || "NFT minting failed.");
        return data;
    }
};

// --- UI Logic ---
function showView(viewName) {
    clearSelection();
    UIElements.collectionsView.classList.add('hidden');
    UIElements.myWalletView.classList.add('hidden');
    const viewToShow = document.getElementById(`${viewName}-view`);
    if (viewToShow) {
        viewToShow.classList.remove('hidden');
        appState.currentView = viewName;
    }
}

function updateUI() {
    const isLoggedIn = !!appState.wallet;
    UIElements.connectWalletBtn.classList.toggle('hidden', isLoggedIn);
    UIElements.walletInfo.classList.toggle('hidden', !isLoggedIn);
    if (isLoggedIn) {
        const pk = appState.wallet.publicKey;
        UIElements.walletAddressDisplay.textContent = `${pk.substring(0, 6)}...${pk.substring(pk.length - 4)}`;
        UIElements.userTapBalance.textContent = parseFloat(appState.balance).toFixed(4);
    }
}

const modal = {
    open: (content) => {
        UIElements.modalBody.innerHTML = '';
        if (typeof content === 'string') {
            UIElements.modalBody.innerHTML = content;
        } else {
            UIElements.modalBody.append(content);
        }
        UIElements.modalOverlay.classList.remove('hidden');
    },
    close: () => UIElements.modalOverlay.classList.add('hidden')
};

function showAutoCloseModal(message, duration = 3000) {
    modal.open(message);
    setTimeout(() => {
        modal.close();
    }, duration);
}

function showLoading(message) {
    modal.open(`<p style="text-align: center;">${message}</p>`);
}

function handleApiError(error, context = "An error") {
    console.error(`API Error in ${context}:`, error);
    modal.close(); // Cierra el modal de "Loading" si está abierto
    
    // Muestra un mensaje de error en el #status-message
    UIElements.statusMessage.textContent = `Error: ${error.message}`;
    UIElements.statusMessage.className = 'status-error'; // Aplica el estilo de error
    UIElements.statusMessage.classList.remove('hidden');
    
    // Oculta el mensaje después de 5 segundos
    setTimeout(() => {
        UIElements.statusMessage.classList.add('hidden');
    }, 5000);
}

async function refreshWalletData() {
    if (!appState.wallet) return;
    try {
        const [balanceData, myNftsData] = await Promise.all([
            api.getBalance(appState.wallet.publicKey),
            api.getMyNfts(appState.wallet.publicKey)
        ]);
        appState.balance = balanceData.balance;
        appState.myNfts = myNftsData || [];
        updateUI();
    } catch (e) {
        handleApiError(e, "refreshing wallet data");
    }
}

function renderSkeletons(count, gridElement) {
    gridElement.innerHTML = ''; // Limpiar el grid primero
    for (let i = 0; i < count; i++) {
        const skeletonCard = document.createElement('div');
        skeletonCard.className = 'skeleton-card';
        skeletonCard.innerHTML = `
            <div class="skeleton-img"></div>
            <div class="skeleton-text"></div>
            <div class="skeleton-text short"></div>
        `;
        gridElement.appendChild(skeletonCard);
    }
}

function renderNftCard(data, gridElement, context) {
    if (!data || !data.file_id) {
        console.warn("renderNftCard fue llamada con datos inválidos:", data);
        return; 
    }

    const card = document.createElement('div');
    card.className = 'card';
    if (appState.selectedItems.has(data.file_id)) {
        card.classList.add('selected');
    }

    card.dataset.fileId = data.file_id;

    card.addEventListener('click', () => {
        if (appState.selectedItems.has(data.file_id)) {
            appState.selectedItems.delete(data.file_id);
            card.classList.remove('selected');
        } else {
            appState.selectedItems.add(data.file_id);
            card.classList.add('selected');
        }
        updateBulkActionBar();
    });

    const { file_id, filename, name, price, seller_address, collection_name, rarity_rank } = data;

    const displayName = name || filename || `NFT-${file_id.substring(0,8)}`;
    const displayCollectionName = collection_name || (context === 'collection' ? UIElements.viewTitle.textContent : 'Community');
    const isListed = !!price && parseFloat(price) > 0;
    const isOwner = appState.wallet && seller_address && seller_address.toLowerCase() === appState.wallet.publicKey.toLowerCase();

    card.innerHTML = `
        <div class="card-image-container">
            <img src="/api/nft-image/${file_id}" alt="${displayName}" loading="lazy">
            ${rarity_rank ? `<div class="rarity-badge">#${rarity_rank}</div>` : ''} 
            <button class="like-btn">♡</button>
        </div>
        <div class="card-info">
            <p class="collection-name">${displayCollectionName}</p>
            <h3>${displayName}</h3>
            <div class="card-footer">
            </div>
        </div>
    `;

    const footer = card.querySelector('.card-footer');
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '0.5rem';

    // --- INICIO DE LA LÓGICA MEJORADA ---

    if (isListed) {
        // Siempre mostrar el precio si está en venta
        const priceElement = document.createElement('p');
        priceElement.className = 'price';
        priceElement.textContent = `${parseFloat(price).toFixed(2)} TAP`;
        footer.appendChild(priceElement);

        if (isOwner && appState.wallet) {
            // Si SOY el dueño, mostrar el botón de Delist (en cualquier vista)
            const delistBtn = document.createElement('button');
            delistBtn.className = 'button-secondary';
            delistBtn.textContent = 'Delist';
            delistBtn.onclick = (e) => { e.stopPropagation(); handleDelist(file_id); };
            buttonContainer.appendChild(delistBtn);
        } else if (!isOwner && appState.wallet) {
            // Si NO SOY el dueño, mostrar el botón de Buy
            const buyBtn = document.createElement('button');
            buyBtn.className = 'button';
            buyBtn.textContent = 'Buy';
            buyBtn.onclick = (e) => { e.stopPropagation(); handleBuy(file_id); };
            buttonContainer.appendChild(buyBtn);
        }
    } else if (isOwner && context === 'wallet') {
        // Si NO está en venta, y SOY el dueño, y estoy en MI WALLET, mostrar List y Send
        const listBtn = document.createElement('button');
        listBtn.className = 'button';
        listBtn.textContent = 'List';
        listBtn.onclick = (e) => { e.stopPropagation(); handleList(file_id); };
        buttonContainer.appendChild(listBtn);

        const transferBtn = document.createElement('button');
        transferBtn.className = 'button-secondary';
        transferBtn.textContent = 'Send';
        transferBtn.onclick = (e) => { e.stopPropagation(); handleTransfer(file_id); };
        buttonContainer.appendChild(transferBtn);
    }

    if (buttonContainer.hasChildNodes()) {
        footer.appendChild(buttonContainer);
    }

    // --- FIN DE LA LÓGICA MEJORADA ---

    const likeBtn = card.querySelector('.like-btn');
    likeBtn.onclick = (e) => {
        e.stopPropagation();
        likeBtn.textContent = likeBtn.textContent === '♡' ? '♥' : '♡';
        likeBtn.style.color = likeBtn.textContent === '♥' ? 'var(--error-color)' : 'var(--text-primary)';
    };

    gridElement.appendChild(card);
}

async function renderCollectionsHub() {
    showView('collections');
    UIElements.viewTitle.textContent = "Collections";
    UIElements.backToCollectionsBtn.classList.add('hidden');
    UIElements.filtersContainer.classList.add('hidden');
    appState.activeFilters = {};
    
    renderSkeletons(8, UIElements.collectionsGrid);

    try {
        const [curated, network, communityListings] = await Promise.all([
            api.getCuratedCollections(),
            api.getNetworkCollections(),
            api.getListings() // Obtenemos los listings de la comunidad
        ]);
        
        UIElements.collectionsGrid.innerHTML = '';
        
        // --- INICIO DE LA MODIFICACIÓN: Tarjeta de Comunidad ---
        // Creamos la tarjeta para la comunidad primero.
        const communityCard = document.createElement('div');
        communityCard.className = 'card';
        communityCard.style.cursor = 'pointer';
        // Asumimos que tienes una imagen en `/collections/comunidad.png` o similar
        communityCard.innerHTML = `
            <div class="card-image-container">
                <img src="/collections/comunidad.png" alt="Community Market">
            </div>
            <div class="card-info">
                <h3>Community Market</h3>
                <p class="collection-name">${communityListings.length} items listed</p>
            </div>
        `;
        communityCard.onclick = () => renderCommunityListingsView();
        UIElements.collectionsGrid.appendChild(communityCard);
        // --- FIN DE LA MODIFICACIÓN ---

        const allApiCollections = [...(curated || []), ...(network || [])];

        if (allApiCollections.length > 0) {
            allApiCollections.forEach(collection => {
                const card = document.createElement('div');
                card.className = 'card';
                card.style.cursor = 'pointer';
                const imageUrl = collection.imageUrl || (collection.banner ? `/api/nft-image/${collection.banner}` : 'https://via.placeholder.com/300');
                
                card.innerHTML = `
                    <div class="card-image-container">
                        <img src="${imageUrl}" alt="${collection.name}">
                    </div>
                    <div class="card-info">
                        <h3>${collection.name}</h3>
                        <p class="collection-name">${collection.type === 'curated' ? 'Curated' : 'Network Collection'}</p>
                    </div>
                `;
                card.onclick = () => renderCollectionView(collection.id || collection.name, collection.type);
                UIElements.collectionsGrid.appendChild(card);
            });
        }

    } catch (e) { 
        handleApiError(e);
        UIElements.collectionsGrid.innerHTML = '<p>Error loading collections. Please try again later.</p>';
    }
}
async function renderCollectionView(collectionId, collectionType) {
    showView('collections');
    UIElements.viewTitle.textContent = "Loading Collection...";
    UIElements.backToCollectionsBtn.classList.remove('hidden');
    UIElements.filtersContainer.classList.remove('hidden');
    appState.activeFilters = {};
    UIElements.attributeFilters.innerHTML = '';
    
    renderSkeletons(12, UIElements.collectionsGrid);

    try {
        let collectionItems;
        let collectionData;
        if (collectionType === 'curated') {
            collectionData = { name: collectionId };
            collectionItems = await api.getCuratedCollectionData(collectionId);
        } else {
            const networkCollection = await api.getNetworkCollectionData(collectionId);
            collectionData = networkCollection.collection;
            collectionItems = networkCollection.items;
        }

        UIElements.viewTitle.textContent = collectionData.name;
        
        const listingsData = await api.getAllListings();
        const listingsMap = new Map((listingsData || []).map(l => [l.file_id, l]));
        
        appState.currentCollectionData = (collectionItems || []).map(nft => ({
            ...nft,
            collection_name: collectionData.name, // Añadimos el nombre de la colección a cada NFT
            ...listingsMap.get(nft.file_id)
        }));

        renderAttributeFilters(appState.currentCollectionData);
        applyFiltersAndRender();

    } catch (e) {
        handleApiError(e);
        UIElements.collectionsGrid.innerHTML = '<p>Error loading this collection.</p>';
    }
}

function updateBulkActionBar() {
    const count = appState.selectedItems.size;
    
    if (count === 0) {
        UIElements.bulkActionBar.classList.add('hidden');
        return;
    }

    let buttons = '';
    // Determinar qué botones mostrar según la vista actual
    if (appState.currentView === 'my-wallet') {
        buttons = `
            <button id="bulk-list-btn" class="button">List ${count} items</button>
            <button id="bulk-delist-btn" class="button-secondary">Delist ${count} items</button>
        `;
    } else if (appState.currentView === 'collections') {
        buttons = `<button id="bulk-buy-btn" class="button">Buy ${count} items</button>`;
    }

    UIElements.bulkActionBar.innerHTML = `
        <p>${count} item(s) selected</p>
        <div class="bulk-actions-buttons">${buttons}</div>
        <button id="bulk-clear-selection" class="button-tertiary">Clear</button>
    `;
    UIElements.bulkActionBar.classList.remove('hidden');

    // Asignar eventos a los botones recién creados
    const bulkClearBtn = document.getElementById('bulk-clear-selection');
    if (bulkClearBtn) bulkClearBtn.addEventListener('click', clearSelection);

    const bulkListBtn = document.getElementById('bulk-list-btn');
    if (bulkListBtn) bulkListBtn.addEventListener('click', handleBulkList);
    
    const bulkDelistBtn = document.getElementById('bulk-delist-btn');
    if (bulkDelistBtn) bulkDelistBtn.addEventListener('click', handleBulkDelist);

    const bulkBuyBtn = document.getElementById('bulk-buy-btn');
    if (bulkBuyBtn) bulkBuyBtn.addEventListener('click', handleBulkBuy);
}

function clearSelection() {
    appState.selectedItems.clear();
    // Eliminar la clase .selected de todas las tarjetas visibles
    document.querySelectorAll('.card.selected').forEach(card => card.classList.remove('selected'));
    updateBulkActionBar();
}

async function renderCommunityListingsView() {
    showView('collections');
    UIElements.viewTitle.textContent = "Community Market";
    UIElements.backToCollectionsBtn.classList.remove('hidden'); // Botón para volver al hub
    
    // Habilitar filtros de venta y precio, pero no de atributos
    UIElements.filtersContainer.classList.remove('hidden');
    UIElements.attributeFilters.innerHTML = '';
    appState.activeFilters = {};
    
    renderSkeletons(12, UIElements.collectionsGrid);

    try {
        const listings = await api.getListings();
        appState.currentCollectionData = listings || [];
        applyFiltersAndRender();
    } catch (e) {
        handleApiError(e);
        UIElements.collectionsGrid.innerHTML = '<p>Error loading community listings.</p>';
    }
}

async function handleRequestWithdrawal() {
    const amount = UIElements.withdrawalAmountInput.value;
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        return alert("Please enter a valid amount to withdraw.");
    }
    
    if (!confirm(`Are you sure you want to request a withdrawal of ${amount} TAP?`)) return;

    showLoading("Submitting your withdrawal request...");
    try {
        await api.requestWithdrawal(amount);
        showAutoCloseModal('Withdrawal request submitted successfully! will process it shortly.');
        UIElements.withdrawalAmountInput.value = '';
        await refreshWalletData();
    } catch (e) {
        handleApiError(e, "requesting withdrawal");
    }
}

async function renderMyWalletView() {
    if (!appState.wallet) {
        alert("Please connect your wallet first.");
        return;
    }
    showView('my-wallet');
    
    // Limpiar filtros y mostrar esqueletos
    appState.activeFilters = {};
    UIElements.attributeFilters.innerHTML = '';
    renderSkeletons(4, UIElements.myNftsGrid); 

    try {
        UIElements.marketplaceAddress.textContent = 'Loading...';
        const addrData = await api.getMarketplaceAddress();
        UIElements.marketplaceAddress.textContent = addrData.address || 'Not available';
    } catch (e) {
        console.error("Failed to get marketplace address:", e);
        UIElements.marketplaceAddress.textContent = 'Error loading address.';
    }

    await refreshWalletData(); 
    UIElements.myNftsGrid.innerHTML = '';

    if (appState.myNfts.length === 0) {
        UIElements.myNftsGrid.innerHTML = '<p>You do not own any NFTs. Mint your first one below!</p>';
    } else {
        for (const nft of appState.myNfts) {
            // Pasamos el contexto 'wallet' para que renderNftCard sepa cómo actuar
            renderNftCard(nft, UIElements.myNftsGrid, 'wallet');
        }
    }
}


// --- Action Handlers ---
async function handleBulkList() {
    const price = prompt("Enter a single price for all selected NFTs:", "1.0");
    if (price === null || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
        return alert("Invalid price entered.");
    }

    const itemsToList = Array.from(appState.selectedItems);
    showLoading(`Listing ${itemsToList.length} NFTs...`);

    let successCount = 0;
    let errorCount = 0;

    for (const file_id of itemsToList) {
        try {
            // Filtrar para solo listar los que no tienen precio (no están ya listados)
            const nftData = appState.myNfts.find(nft => nft.file_id === file_id);
            if (nftData && !nftData.price) {
                await api.listNft(file_id, price);
                successCount++;
            } else {
                console.log(`Item ${file_id} is already listed, skipping.`);
                errorCount++; // Contar como error si ya está listado
            }
        } catch (e) {
            console.error(`Failed to list ${file_id}:`, e);
            errorCount++;
        }
        await new Promise(resolve => setTimeout(resolve, 2000)); // Pausa de 1 segundo
    }
    
    showAutoCloseModal(`Bulk Listing Complete: ${successCount} successful, ${errorCount} failed/skipped.`);
    clearSelection();
    await renderMyWalletView();
}

async function handleBulkDelist() {
    if (!confirm(`Are you sure you want to delist ${appState.selectedItems.size} items?`)) return;

    const itemsToDelist = Array.from(appState.selectedItems);
    showLoading(`Delisting ${itemsToDelist.length} NFTs...`);
    
    let successCount = 0;
    let errorCount = 0;

    for (const file_id of itemsToDelist) {
        try {
            // Filtrar para solo retirar los que sí tienen precio (están listados)
            const nftData = appState.myNfts.find(nft => nft.file_id === file_id);
            if (nftData && nftData.price) {
                 await api.delistNft(file_id);
                 successCount++;
            } else {
                console.log(`Item ${file_id} is not listed, skipping.`);
                errorCount++;
            }
        } catch (e) {
            console.error(`Failed to delist ${file_id}:`, e);
            errorCount++;
        }
        await new Promise(resolve => setTimeout(resolve, 2000)); // Pausa de 1 segundo
    }

    showAutoCloseModal(`Bulk Delist Complete: ${successCount} successful, ${errorCount} failed/skipped.`);
    clearSelection();
    await renderMyWalletView();
}

async function handleBulkBuy() {
    const itemsToBuy = Array.from(appState.selectedItems);
    const nftsToPurchase = appState.currentCollectionData.filter(nft => 
        itemsToBuy.includes(nft.file_id) && nft.price // Asegurarse de que tienen precio
    );

    if (nftsToPurchase.length !== itemsToBuy.length) {
        alert("Some selected items are no longer for sale. Please refresh and try again.");
        clearSelection();
        applyFiltersAndRender();
        return;
    }

    // --- PRE-CHEQUEO DE SALDO TOTAL ---
    const totalCost = nftsToPurchase.reduce((sum, nft) => sum + parseFloat(nft.price), 0);
    if (parseFloat(appState.balance) < totalCost) {
        return alert(`Insufficient funds. You need ${totalCost.toFixed(2)} TAP, but you only have ${appState.balance}.`);
    }
    
    if (!confirm(`You are about to buy ${nftsToPurchase.length} NFTs for a total of ~${totalCost.toFixed(2)} TAP. Proceed?`)) return;

    showLoading(`Purchasing ${nftsToPurchase.length} NFTs... This will take time.`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const nft of nftsToPurchase) {
        try {
           
            await refreshWalletData(); // Actualiza el balance a su último estado
            if (parseFloat(appState.balance) < parseFloat(nft.price)) {
                console.error(`Purchase of ${nft.file_id} skipped: Insufficient funds for this item.`);
                errorCount++;
                continue; // Saltar al siguiente item
            }
            
            await api.buyNft(nft.file_id);
            successCount++;
            

        } catch (e) {
            console.error(`Failed to buy ${nft.file_id}:`, e);
            errorCount++;
        }
        
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    showAutoCloseModal(`Bulk Purchase Complete: ${successCount} successful, ${errorCount} failed/skipped.`);
    clearSelection();
   
    if (UIElements.viewTitle.textContent === "Community Market") {
        await renderCommunityListingsView();
    } else {
        await renderCollectionsHub(); // Volver al hub como fallback seguro
    }
}

function handleSelectUnlisted() {
    if (appState.currentView !== 'my-wallet') return;

    // 1. Filtrar para obtener solo los NFTs que no están a la venta.
    const unlistedNfts = appState.myNfts.filter(nft => !nft.price || parseFloat(nft.price) <= 0);

    // 2. Mezclar el array de forma aleatoria (algoritmo Fisher-Yates) para que la selección sea al azar.
    for (let i = unlistedNfts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [unlistedNfts[i], unlistedNfts[j]] = [unlistedNfts[j], unlistedNfts[i]];
    }
    
    // 3. Tomar los primeros 100 (o menos si no hay tantos).
    const itemsToSelect = unlistedNfts.slice(0, 100);

    if (itemsToSelect.length === 0) {
        showAutoCloseModal("You have no unlisted NFTs to select.");
        return;
    }

    // 4. Limpiar la selección anterior y agregar los nuevos items.
    clearSelection();
    itemsToSelect.forEach(nft => appState.selectedItems.add(nft.file_id));

    // 5. Actualizar la UI para mostrar visualmente la selección.
    itemsToSelect.forEach(nft => {
        const card = document.querySelector(`.card[data-file-id="${nft.file_id}"]`);
        if (card) {
            card.classList.add('selected');
        }
    });

    // 6. Mostrar la barra de acciones.
    updateBulkActionBar();
}

async function handleList(file_id) {
    const price = prompt("Enter the sale price for the NFT in TAP:", "1.0");
    if (price === null) return; 
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) return alert("Invalid price.");
    
    showLoading("Listing your NFT...");
    try {
        await api.listNft(file_id, price);
        showAutoCloseModal('NFT listed for sale successfully!');
        // --- CAMBIO CLAVE: Nos quedamos en la vista de la wallet ---
        await renderMyWalletView(); 
    } catch (e) { handleApiError(e, "listing NFT"); }
}

async function handleDelist(file_id) {
    if (!confirm("Are you sure you want to remove this NFT from sale?")) return;
    showLoading("Delisting your NFT...");
    try {
        await api.delistNft(file_id);
        showAutoCloseModal('NFT successfully delisted!');

        // --- LÓGICA DE REFRESCO MEJORADA ---
        if (appState.currentView === 'wallet') {
            // Si estamos en la wallet, simplemente recargamos la wallet
            await renderMyWalletView();
        } else {
            // Si estamos en una vista de colección, la recargamos.
            // Asumimos que la vista de colección activa se mantiene y la recargamos
            // Esta es una simplificación; un estado más robusto guardaría el ID y tipo de la colección activa.
            // Por ahora, recargar la vista actual de colecciones debería funcionar si el usuario no ha navegado.
            const currentCollectionTitle = UIElements.viewTitle.textContent;
            const activeCollection = appState.currentCollectionData.find(c => c.name === currentCollectionTitle);
            
            if (activeCollection) {
                await renderCollectionView(activeCollection.id || activeCollection.name, activeCollection.type);
            } else {
                // Si no podemos determinar la colección, volvemos al hub como fallback seguro.
                await renderCollectionsHub();
            }
        }
    } catch (e) { 
        handleApiError(e, "delisting NFT"); 
    }
}

async function handleBuy(file_id) {
    if (!appState.wallet) return alert("You must connect your wallet to buy.");
    showLoading("Processing purchase...");
    try {
        await api.buyNft(file_id);
        showAutoCloseModal('Purchase successful! The NFT will now appear in your wallet.');
        
        await refreshWalletData(); // Actualiza el balance y los NFTs del usuario en segundo plano

        // --- LÓGICA DE REFRESCO MEJORADA ---
        // Recargamos la vista actual para que el item comprado desaparezca de la lista de venta.
        // Esto asume que la vista de colección o comunidad sigue activa.
        const currentCollectionTitle = UIElements.viewTitle.textContent;
        
        if (currentCollectionTitle === "Community Market") {
            await renderCommunityListingsView();
        } else {
             // Esta es una solución simple. Una app más compleja guardaría el ID de la colección activa en appState.
             // Por ahora, recargar el hub es la opción más segura si no podemos identificar la colección.
             // El problema con `renderCollectionView` es que necesita el `collectionType` que no guardamos.
             // Así que el fallback seguro es ir al hub.
            await renderCollectionsHub();
        }

    } catch (e) { 
        handleApiError(e, "buying NFT"); 
    }
}
async function handleTransfer(file_id) {
    const to_address = prompt("Enter the destination wallet address:");
    if (!to_address) return;
    if (to_address.length < 64) return alert("Invalid destination address.");
    
    showLoading("Transferring NFT...");
    try {
        await api.transferNft(file_id, to_address);
        showAutoCloseModal('NFT transferred successfully!');
        // --- CAMBIO CLAVE: Nos quedamos en la vista de la wallet ---
        await renderMyWalletView(); 
    } catch (e) {
        handleApiError(e, "transferring NFT");
    }
}


async function handleMint() {
    if (!UIElements.mintFileInput.files.length) return alert("Please select a file.");
    const formData = new FormData();
    formData.append('nftFile', UIElements.mintFileInput.files[0]);
    showLoading("Minting your new NFT... This may take a moment.");
    try {
        await api.mintNft(formData);
        showAutoCloseModal("NFT minted successfully!");
        UIElements.mintFileInput.value = '';
        await renderMyWalletView();
    } catch(e) { handleApiError(e, "minting NFT"); } 
}

// --- Connection & Initialization ---
function logout() {
    appState.wallet = null;
    appState.myNfts = [];
    appState.balance = '0.00';
    renderCollectionsHub();
    updateUI();
}

async function connectToPeerWallet() {
    showLoading("Connecting to wallet...");
    try {
        const data = await api.getWalletInfo();
        if (!data.success) throw new Error(data.error);
        appState.wallet = { publicKey: data.publicKey };
        await refreshWalletData();
        updateUI();
        modal.close();
    } catch (e) { 
        handleApiError(e, "connecting wallet");
    }
}

async function pollServerStatus() {
    try {
        const data = await api.getStatus();
        if (data.ready) {
            UIElements.statusMessage.textContent = 'Connected to P2P Network.';
            UIElements.statusMessage.className = 'status-success';
            UIElements.statusMessage.classList.remove('hidden');
            setTimeout(() => { UIElements.statusMessage.classList.add('hidden'); }, 3000);
            renderCollectionsHub(); // Carga inicial
        } else {
            UIElements.statusMessage.textContent = 'Connecting to P2P Network...';
            UIElements.statusMessage.className = '';
            UIElements.statusMessage.classList.remove('hidden');
            setTimeout(pollServerStatus, 3000);
        }
    } catch (error) {
        UIElements.statusMessage.textContent = 'Connection error. Retrying...';
        UIElements.statusMessage.className = 'status-error';
        UIElements.statusMessage.classList.remove('hidden');
        setTimeout(pollServerStatus, 5000);
    }
}
function applyFiltersAndRender() {
    let filteredData = [...appState.currentCollectionData]; 

    const activeAttributeFilters = Object.entries(appState.activeFilters);
    if (activeAttributeFilters.length > 0) {
        filteredData = filteredData.filter(nft => {
            if (!nft.attributes) return false;
            return activeAttributeFilters.every(([trait_type, value]) => {
                return nft.attributes.some(attr => attr.trait_type === trait_type && attr.value === value);
            });
        });
    }

    if (UIElements.forSaleFilter.checked) {
        filteredData = filteredData.filter(nft => nft.price && parseFloat(nft.price) > 0);
    }

    const sortValue = UIElements.priceSort.value;
    if (sortValue === 'price-asc') {
        filteredData.sort((a, b) => (parseFloat(a.price) || Infinity) - (parseFloat(b.price) || Infinity));
    } else if (sortValue === 'price-desc') {
        filteredData.sort((a, b) => (parseFloat(b.price) || -1) - (parseFloat(a.price) || -1));
    }

    UIElements.collectionsGrid.innerHTML = '';
    if (filteredData.length === 0) {
        UIElements.collectionsGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">No NFTs match the current filters.</p>';
    } else {
        filteredData.forEach(nft => renderNftCard(nft, UIElements.collectionsGrid, 'collection'));
    }
}

function renderAttributeFilters(nfts) {
    const traits = {};
    (nfts || []).forEach(nft => {
        if (nft.attributes) {
            nft.attributes.forEach(attr => {
                if (!traits[attr.trait_type]) traits[attr.trait_type] = new Set();
                if(attr.value) traits[attr.trait_type].add(attr.value); // Evita valores nulos
            });
        }
    });

    UIElements.attributeFilters.innerHTML = ''; // Limpiar filtros anteriores
    Object.entries(traits).forEach(([trait_type, values]) => {
        const filterGroup = document.createElement('div');
        filterGroup.className = 'attribute-filter-group';

        const label = document.createElement('label');
        label.setAttribute('for', `filter-${trait_type}`);
        label.textContent = trait_type;
        
        const select = document.createElement('select');
        select.id = `filter-${trait_type}`;
        select.innerHTML = `<option value="">All</option>`;
        
        Array.from(values).sort().forEach(value => {
            select.innerHTML += `<option value="${value}">${value}</option>`;
        });
        
        select.addEventListener('change', (event) => {
            if (event.target.value) {
                appState.activeFilters[trait_type] = event.target.value;
            } else {
                delete appState.activeFilters[trait_type];
            }
            applyFiltersAndRender();
        });
        
        filterGroup.appendChild(label);
        filterGroup.appendChild(select);
        UIElements.attributeFilters.appendChild(filterGroup);
    });
}

function init() {
    UIElements.brandTitle.addEventListener('click', renderCollectionsHub);
    UIElements.collectionsHubBtn.addEventListener('click', renderCollectionsHub);
    
    // El botón de "My Wallet" del header ahora es el único que lleva a esa vista.
    UIElements.myWalletBtn.addEventListener('click', renderMyWalletView);
    
    UIElements.connectWalletBtn.addEventListener('click', connectToPeerWallet);
    UIElements.modalClose.addEventListener('click', modal.close);
    UIElements.logoutBtn.addEventListener('click', logout);
    UIElements.backToCollectionsBtn.addEventListener('click', renderCollectionsHub);
    UIElements.backToMarketplaceBtnWallet.addEventListener('click', renderCollectionsHub);
    UIElements.forSaleFilter.addEventListener('change', applyFiltersAndRender);
    UIElements.priceSort.addEventListener('change', applyFiltersAndRender);
    UIElements.mintNftBtn.addEventListener('click', handleMint);
    UIElements.selectUnlistedBtn.addEventListener('click', handleSelectUnlisted);
    UIElements.requestWithdrawalBtn.addEventListener('click', handleRequestWithdrawal);
    
    updateUI();
    pollServerStatus(); // Inicia la app
}

init();