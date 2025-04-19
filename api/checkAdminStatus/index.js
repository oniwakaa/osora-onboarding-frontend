// /api/checkAdminStatus/index.js

// Importa le librerie necessarie (basato sul tuo package.json e descrizione)
const { DefaultAzureCredential } = require("@azure/identity");
const { Client } = require("@microsoft/microsoft-graph-client");
require("isomorphic-fetch");// Polyfill per fetch richiesto da graph-client

// Definisci gli ID Template dei ruoli amministratore che vuoi controllare
// Questi sono esempi comuni, aggiungi/rimuovi a seconda delle tue necessità
const adminRoleTemplateIds = [
    "62e90394-69f5-4237-9190-012177145e10", // Global Administrator
    "fe930be7-5e62-47db-91af-98c3a49a38b1", // SharePoint Administrator
    "88d8e3e3-8f55-4a1e-953a-9b9898b8876b", // Teams Administrator
    "f2ef992c-3afb-46b9-b7cf-a126ee74c451", // Exchange Administrator
    "e8611ab8-c189-46e8-94e1-60213ab1a814", // User Administrator
    // ... aggiungi altri ID template se necessario
];

module.exports = async function (context, req) {
    context.log('Funzione checkAdminStatus triggerata.');

    // --- INIZIO PASSO DIAGNOSTICO: Log delle Variabili d'Ambiente ---
    context.log("--- LOGGING DELLE VARIABILI D'AMBIENTE (process.env) ---");
    try {
        // Usa JSON.stringify per una migliore leggibilità nei log, specialmente in Application Insights
        // null, 2 formatta l'output JSON con indentazione
        context.log(JSON.stringify(process.env, null, 2));
    } catch (stringifyError) {
        // Fallback nel caso (improbabile) che process.env non sia serializzabile
        context.log.error("Errore durante la serializzazione di process.env:", stringifyError);
        context.log("process.env raw:", process.env);
    }
    context.log("--- FINE LOGGING VARIABILI D'AMBIENTE ---");
    // --- FINE PASSO DIAGNOSTICO ---

    let userId = null;
    let userDetails = null; // Per loggare il nome utente se disponibile
    let isAdmin = false; // Valore predefinito

    // 1. Ottieni le informazioni dell'utente dall'header di autenticazione SWA
    const header = req.headers['x-ms-client-principal'];
    if (header) {
        try {
            const encoded = Buffer.from(header, 'base64');
            const decoded = encoded.toString('ascii');
            const clientPrincipal = JSON.parse(decoded);

            // Verifica che le proprietà necessarie esistano
            if (clientPrincipal && clientPrincipal.userId && clientPrincipal.userDetails) {
                 userId = clientPrincipal.userId;
                 userDetails = clientPrincipal.userDetails; // Di solito l'email o il nome
                 context.log(`Utente autenticato tramite SWA. User ID: ${userId}, User Details: ${userDetails}`);
            } else {
                 context.log.warn("Oggetto clientPrincipal non contiene userId o userDetails.");
                 context.res = { status: 400, body: "Impossibile determinare l'identità utente dall'header." };
                 return;
            }

        } catch (e) {
            context.log.error("Errore durante il parsing dell'header x-ms-client-principal:", e);
            // Non ritornare l'errore esatto al client per sicurezza
            context.res = { status: 400, body: "Header di autenticazione malformato." };
            return;
        }
    } else {
        // L'authLevel è 'anonymous', ma ci aspettiamo che SWA popoli l'header se l'utente è loggato
        context.log.warn("Header x-ms-client-principal non trovato. L'utente non è autenticato da SWA o la richiesta non proviene dalla SWA?");
        context.res = { status: 401, body: "Autenticazione utente richiesta." };
        return;
    }

    // Procedi solo se abbiamo ottenuto un userId
    if (!userId) {
         context.log.error("UserID non estratto correttamente."); // Log aggiunto per coerenza
         context.res = { status: 400, body: "Impossibile determinare l'identità utente." }; // Già gestito sopra, ma doppia sicurezza
         return;
    }

    // 2. Tenta di ottenere il token per Microsoft Graph usando l'Identità Gestita
    //    (Questa è la parte che attualmente fallisce e che stiamo diagnosticando)
    try {
        context.log("Attempting to get credential using DefaultAzureCredential without explicit ID...");
        const credential = new DefaultAzureCredential(); // <--- MODIFICA QUI
    
        context.log("Attempting to get token...");
        const tokenResponse = await credential.getToken("https://graph.microsoft.com/.default");
        context.log("Successfully obtained token.");

        context.log("Tentativo di ottenere il token per Microsoft Graph (scope: .default)...");
        // Use the already obtained token instead of making a duplicate call
        const graphToken = tokenResponse;

        // Se arriviamo qui (improbabile dato l'errore attuale), il token è stato ottenuto
        context.log("Token per Microsoft Graph ottenuto con successo tramite Managed Identity.");

        // 3. Inizializza il client Microsoft Graph
        const graphClient = Client.init({
            authProvider: (done) => {
                // Passa il token ottenuto al Graph Client
                done(null, graphToken.token);
            },
        });
        context.log("Client Microsoft Graph inizializzato.");

        // 4. Chiama Microsoft Graph API per controllare i ruoli dell'utente loggato
        context.log(`Controllo dei ruoli (transitiveMemberOf) per l'utente ID: ${userId}`);
        // Usa l'endpoint corretto per ottenere i ruoli di directory transitivi
        // Seleziona solo roleTemplateId per efficienza
        const memberships = await graphClient
            .api(`/users/${userId}/transitiveMemberOf/microsoft.graph.directoryRole`)
            .select('roleTemplateId,displayName') // Aggiunto displayName per log più chiari
            .get();

        context.log(`Ottenuti ${memberships.value ? memberships.value.length : 0} ruoli di directory (transitivi).`);

        // 5. Verifica se l'utente ha uno dei ruoli amministratore definiti
        if (memberships && memberships.value) {
            for (const role of memberships.value) {
                // Confronto case-insensitive per sicurezza
                if (role.roleTemplateId && adminRoleTemplateIds.includes(role.roleTemplateId.toLowerCase())) {
                    isAdmin = true;
                    context.log(`L'utente ${userDetails} (${userId}) è un amministratore. Trovato ruolo: ${role.displayName} (Template ID: ${role.roleTemplateId})`);
                    break; // Trovato un ruolo admin, possiamo fermarci
                }
            }
        }

        if (!isAdmin) {
             context.log(`L'utente ${userDetails} (${userId}) non ha nessuno dei ruoli amministratore specificati.`);
        }

        // 6. Restituisci il risultato
        context.res = {
            status: 200,
            // Headers per evitare caching se necessario
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            },
            body: {
                isAdmin: isAdmin,
                checkedUserId: userId, // Restituisci l'ID controllato per conferma
                checkedUserDetails: userDetails
            }
        };

    } catch (error) {
        context.log.error("ERRORE durante il controllo dello stato admin:", error);
        // Logga dettagli specifici dell'errore che potrebbero essere utili
        if (error.statusCode) context.log.error(`StatusCode: ${error.statusCode}`);
        if (error.code) context.log.error(`Code: ${error.code}`);
        if (error.requestId) context.log.error(`RequestId: ${error.requestId}`);
        if (error.message) context.log.error(`Message: ${error.message}`);
        // Logga lo stack trace completo per debug approfondito
        if (error.stack) context.log.error(`Stack Trace: ${error.stack}`);

        // Restituisci un errore 500 generico al client, i dettagli sono nei log lato server
        context.res = {
            status: 500,
            body: {
                message: "Errore interno del server durante la verifica dello stato amministratore.",
                // Potresti voler includere l'error.message qui SOLO durante lo sviluppo per debug facilitato
                // error_details: error.message
            }
        };
    }
};