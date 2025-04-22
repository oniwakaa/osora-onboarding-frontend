// auth.js - Logica per onboarding.html

// Elementi UI
const loadingStatusEl = document.getElementById('loadingStatus');
const userEmailEl = document.getElementById('userEmail');
const userProviderEl = document.getElementById('userProvider');
const userIdEl = document.getElementById('userId');
const adminSectionEl = document.getElementById('adminSection');
const adminStatusEl = document.getElementById('adminStatus');
const consentAreaEl = document.getElementById('consentArea');
const consentButton = document.getElementById('consentButton');
const consentStatusEl = document.getElementById('consentStatus');
const tenantIdEl = document.getElementById('tenantId');
const configAreaEl = document.getElementById('configArea');
const sharepointUrlsEl = document.getElementById('sharepointUrls');
const saveConfigButton = document.getElementById('saveConfigButton');
const configSaveStatusEl = document.getElementById('configSaveStatus');
const generalMessageEl = document.getElementById('generalMessage');

// Variabili di stato
let currentUserInfo = null;
let currentTenantId = null; // Memorizza l'ID tenant dopo il consenso

// Funzione per mostrare messaggi generali
function showGeneralMessage(message, isError = false) {
    generalMessageEl.textContent = message;
    generalMessageEl.className = `mt-4 p-4 border rounded-lg ${isError ? 'bg-red-50 text-red-800' : 'bg-yellow-50 text-yellow-800'}`;
    generalMessageEl.classList.remove('hidden');
}

// Funzione per aggiornare l'UI con le info utente
function updateUserInfoUI(userInfo) {
    if (userInfo && userInfo.clientPrincipal) {
        currentUserInfo = userInfo.clientPrincipal; // Salva le info utente
        loadingStatusEl.textContent = 'Caricato.';
        userEmailEl.textContent = currentUserInfo.userDetails;
        userProviderEl.textContent = currentUserInfo.identityProvider;
        userIdEl.textContent = currentUserInfo.userId; // Questo è l'OID
    } else {
        loadingStatusEl.textContent = 'Informazioni utente non disponibili.';
        showGeneralMessage('Impossibile recuperare le informazioni utente. Prova a fare logout e login.', true);
    }
}

// Funzione per chiamare l'API backend
async function callApi(endpoint) {
    try {
        const response = await fetch(endpoint);
        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({ message: `Errore HTTP ${response.status}` }));
            throw new Error(`Errore API ${endpoint}: ${response.status} - ${JSON.stringify(errorBody)}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Errore nella chiamata API a ${endpoint}:`, error);
        showGeneralMessage(`Si è verificato un errore durante la comunicazione con il server (${endpoint}). Dettagli: ${error.message}`, true);
        throw error; // Rilancia l'errore per interrompere il flusso se necessario
    }
}

// Funzione per verificare lo stato admin
async function checkAdminStatus() {
    adminStatusEl.textContent = 'Verifica permessi amministratore in corso...';
    adminSectionEl.classList.remove('hidden'); // Mostra la sezione admin

    try {
        const data = await callApi('/api/checkAdminStatus');
        console.log("Risposta checkAdminStatus:", data);
        if (data.isAdmin) {
            adminStatusEl.textContent = 'Sei riconosciuto come amministratore.';
            // Qui gestiamo la logica post-verifica admin (consenso/config)
            handlePostAdminCheck();
        } else {
            adminStatusEl.textContent = 'Non sei riconosciuto come amministratore. Solo gli amministratori possono configurare l\'applicazione.';
            consentAreaEl.classList.add('hidden');
            configAreaEl.classList.add('hidden');
        }
    } catch (error) {
        adminStatusEl.textContent = 'Errore durante la verifica dei permessi amministratore.';
        // L'errore dettagliato è già mostrato da callApi
    }
}

// Funzione chiamata DOPO che l'utente è stato verificato come admin
function handlePostAdminCheck() {
    // Controlla se siamo tornati dal flusso di consenso
    const urlParams = new URLSearchParams(window.location.search);
    const consentSuccess = urlParams.get('admin_consent') === 'True';
    const tenantFromUrl = urlParams.get('tenant');
    const stateReceived = urlParams.get('state');
    const stateExpected = sessionStorage.getItem('consentState');

    // Pulisci i parametri dall'URL per evitare confusione al refresh
    if (urlParams.has('admin_consent') || urlParams.has('error')) {
         window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (consentSuccess && tenantFromUrl && stateReceived && stateReceived === stateExpected) {
        // Successo del consenso!
        console.log(`Consenso amministratore concesso per tenant: ${tenantFromUrl}`);
        sessionStorage.removeItem('consentState'); // Rimuovi lo state usato
        currentTenantId = tenantFromUrl; // Salva l'ID tenant
        consentAreaEl.classList.add('hidden'); // Nascondi pulsante consenso
        consentStatusEl.classList.remove('hidden'); // Mostra messaggio successo consenso
        tenantIdEl.textContent = currentTenantId;
        configAreaEl.classList.remove('hidden'); // Mostra area configurazione
        showGeneralMessage('Consenso amministratore concesso con successo. Ora puoi fornire la configurazione.', false);

    } else if (urlParams.has('error')) {
        // Errore durante il consenso
        const error = urlParams.get('error');
        const errorDescription = urlParams.get('error_description');
        console.error(`Errore durante il consenso: ${error} - ${errorDescription}`);
        sessionStorage.removeItem('consentState');
        showGeneralMessage(`Errore durante il processo di consenso: ${errorDescription || error}`, true);
        // Mostra comunque il pulsante per riprovare
        consentAreaEl.classList.remove('hidden');
        configAreaEl.classList.add('hidden');

    } else {
        // L'utente è admin ma non è ancora passato per il flusso di consenso (o è fallito prima)
        console.log("Utente admin, mostro l'opzione per il consenso.");
        consentAreaEl.classList.remove('hidden'); // Mostra pulsante consenso
        configAreaEl.classList.add('hidden'); // Nascondi area configurazione
        consentStatusEl.classList.add('hidden');
    }
}


// Funzione per avviare il flusso di consenso amministratore
function redirectToAdminConsent() {
    console.log("Avvio flusso consenso amministratore...");

    // 1. Genera uno state casuale e sicuro
    const state = crypto.randomUUID();
    sessionStorage.setItem('consentState', state); // Salva per verifica al ritorno

    // 2. Definisci i parametri (USA IL TUO CLIENT ID REALE)
    const clientId = "9bf727de-528a-4c7b-9e44-c7505a8111d8"; // Client ID di TalentRecGraphConnector
    const redirectUri = window.location.origin + window.location.pathname; // Es: https://calm-mud..../onboarding.html
    const scope = "https://graph.microsoft.com/.default"; // Richiedi permessi applicazione definiti

    // 3. Costruisci l'URL
    const params = new URLSearchParams({
        client_id: clientId,
        scope: scope,
        redirect_uri: redirectUri,
        state: state
    });
    const consentUrl = `https://login.microsoftonline.com/organizations/v2.0/adminconsent?${params.toString()}`;

    console.log("Reindirizzamento a:", consentUrl);
    // 4. Reindirizza l'utente
    window.location.href = consentUrl;
}

// Funzione per salvare la configurazione
async function saveConfiguration() {
    const urls = sharepointUrlsEl.value.trim();
    if (!urls) {
        configSaveStatusEl.textContent = 'Per favore, inserisci almeno un URL SharePoint.';
        configSaveStatusEl.className = 'mt-3 text-sm text-red-600';
        return;
    }
    if (!currentTenantId) {
         configSaveStatusEl.textContent = 'ID Tenant non disponibile. Riprova il processo di consenso.';
         configSaveStatusEl.className = 'mt-3 text-sm text-red-600';
         return;
    }

    // Prepara i dati da inviare (es: array di URL)
    const urlList = urls.split('\n').map(url => url.trim()).filter(url => url.length > 0);

    configSaveStatusEl.textContent = 'Salvataggio configurazione in corso...';
    configSaveStatusEl.className = 'mt-3 text-sm text-gray-600';
    saveConfigButton.disabled = true;

    try {
        const response = await fetch('/api/saveConfiguration', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                tenantId: currentTenantId,
                sharepointUrls: urlList
            }),
        });

        if (!response.ok) {
             const errorBody = await response.json().catch(() => ({ message: `Errore HTTP ${response.status}` }));
             throw new Error(`Errore API saveConfiguration: ${response.status} - ${JSON.stringify(errorBody)}`);
        }

        const result = await response.json();
        console.log("Risposta saveConfiguration:", result);
        configSaveStatusEl.textContent = 'Configurazione salvata con successo!';
        configSaveStatusEl.className = 'mt-3 text-sm text-green-600';

    } catch (error) {
        console.error("Errore durante il salvataggio della configurazione:", error);
        configSaveStatusEl.textContent = `Errore durante il salvataggio: ${error.message}`;
        configSaveStatusEl.className = 'mt-3 text-sm text-red-600';
    } finally {
         saveConfigButton.disabled = false;
    }
}


// --- Esecuzione all'avvio della pagina ---

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Recupera info utente
    try {
        const userInfo = await callApi('/.auth/me');
        updateUserInfoUI(userInfo);

        // 2. Se l'utente è autenticato, verifica lo stato admin
        if (currentUserInfo) {
            await checkAdminStatus();
        } else {
            // Se non ci sono info utente, non procedere con checkAdmin
             adminSectionEl.classList.add('hidden');
        }

    } catch (error) {
        loadingStatusEl.textContent = 'Errore nel caricamento.';
        // L'errore dettagliato è già mostrato da callApi
        adminSectionEl.classList.add('hidden');
    }

    // 3. Aggiungi event listener ai pulsanti (solo se esistono)
    if (consentButton) {
        consentButton.addEventListener('click', redirectToAdminConsent);
    }
     if (saveConfigButton) {
        saveConfigButton.addEventListener('click', saveConfiguration);
    }
});
