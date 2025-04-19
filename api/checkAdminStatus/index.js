// api/checkAdminStatus/index.js
const { DefaultAzureCredential } = require("@azure/identity");
const { Client } = require("@microsoft/microsoft-graph-client");
require("isomorphic-fetch"); // Polyfill per fetch richiesto da graph-client

// Approccio migliore multi-tenant: Controllare gli ID TEMPLATE dei ruoli
const ADMIN_ROLE_TEMPLATE_IDS = [
    "62e90394-69f5-4237-9190-012177145e10", // Global Administrator
    "9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3", // Application Administrator
    "158c047a-c907-4556-b7ef-746541514796"  // Cloud Application Administrator
];

// !!! ID Cliente (Application ID) dell'Identità Gestita Assegnata dal Sistema della Static Web App !!!
const managedIdentityClientId = "1877d094-1a3c-4efc-bdfd-4c894cfa2a53";


module.exports = async function (context, req) {
    context.log('checkAdminStatus: Function processed request.');
    // Logghiamo solo alcuni header utili per debug, non più tutti
    context.log(`checkAdminStatus: Relevant Headers: User-Agent: ${req.headers['user-agent']}, Referer: ${req.headers['referer']}`);

    let isAdmin = false;
    const clientPrincipalHeader = req.headers['x-ms-client-principal'];

    // Verifica preliminare se l'header principale esiste
    if (!clientPrincipalHeader) {
        context.log.warn("checkAdminStatus: x-ms-client-principal header not found.");
        context.res = {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
            body: { isAdmin: false, error: "Autenticazione richiesta." }
        };
        return;
    }

    // Procedi solo se l'header esiste
    try {
        const decodedBuffer = Buffer.from(clientPrincipalHeader, 'base64');
        const clientPrincipal = JSON.parse(decodedBuffer.toString('utf-8'));
        const userId = clientPrincipal.userId;

        context.log('checkAdminStatus: Checking roles for userId:', userId);

        // --- CONDIZIONE IF CORRETTA ---
        // Verifica che abbiamo sia l'ID utente dall'header, sia l'ID della MI configurato
        if (userId && managedIdentityClientId) {

            context.log(`Attempting to get Graph token using explicit MI Client ID: ${managedIdentityClientId}`);
            // 1. Crea le credenziali specificando l'ID Cliente della MI
            const credential = new DefaultAzureCredential({
                managedIdentityClientId: managedIdentityClientId
            });
            // 2. Ottieni il token per Graph API
            const graphToken = await credential.getToken("https://graph.microsoft.com/.default");

            if (!graphToken || !graphToken.token) {
                // Lancia un errore se il token non viene ottenuto
                throw new Error("Failed to acquire token for Graph API using specified Managed Identity Client ID.");
            }
            context.log('checkAdminStatus: Graph token acquired successfully.');

            // 3. Inizializza Graph Client
            const graphClient = Client.init({
                authProvider: (done) => {
                    done(null, graphToken.token);
                },
            });

            // 4. Chiama Graph API per i ruoli
            context.log('checkAdminStatus: Calling Graph API for roles...');
            const directoryRoles = await graphClient
                .api(`/users/${userId}/transitiveMemberOf/microsoft.graph.directoryRole`)
                .select('roleTemplateId') // Chiediamo solo gli ID Template
                .get();
            context.log('checkAdminStatus: Roles from Graph API:', JSON.stringify(directoryRoles));

            // 5. Controlla i ruoli basandosi sugli ID Template
            if (directoryRoles && directoryRoles.value && Array.isArray(directoryRoles.value)) {
                isAdmin = directoryRoles.value.some(role =>
                    role.roleTemplateId && ADMIN_ROLE_TEMPLATE_IDS.includes(role.roleTemplateId)
                );
            }
            context.log(`checkAdminStatus: Admin check result based on Graph roles: ${isAdmin}`);

        } else {
             // Gestisci i casi in cui manca uno degli ID necessari
             if (!userId) {
                 context.log.warn("checkAdminStatus: userId not found in client principal.");
                 throw new Error("User ID not found in client principal header.");
             }
             // Questo non dovrebbe accadere se la costante è definita sopra
             if (!managedIdentityClientId) {
                 context.log.error("checkAdminStatus: Managed Identity Client ID is missing in code!");
                 throw new Error("Managed Identity Client ID not configured in function code.");
             }
        }
        // Se siamo arrivati qui senza errori, prepara la risposta normale
        context.res = {
            headers: { 'Content-Type': 'application/json' },
            body: {
                isAdmin: isAdmin
            }
        };

    } catch (error) {
         // Gestione centralizzata degli errori (sia dal parsing header, sia da getToken, sia da chiamata Graph)
         context.log.error("checkAdminStatus: Error during execution:", error);
         context.res = {
             status: 500,
             headers: { 'Content-Type': 'application/json' },
             // Passa il messaggio di errore specifico per il debug
             body: { isAdmin: false, error: error.message || "Unknown error occurred." }
         };
         // Non serve return qui perché siamo già alla fine della funzione asincrona
    }
};