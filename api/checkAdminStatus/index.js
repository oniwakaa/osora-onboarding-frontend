// api/checkAdminStatus/index.js
const { DefaultAzureCredential } = require("@azure/identity");
const { Client } = require("@microsoft/microsoft-graph-client");
require("isomorphic-fetch"); // Polyfill per fetch richiesto da graph-client

// ID Oggetto (NON ID Template) dei ruoli amministrativi che vuoi controllare
// Puoi trovarli in Azure AD -> Ruoli e amministratori -> Seleziona il ruolo -> ID Oggetto
// !! Questi ID sono specifici per OGNI tenant, quindi non è l'approccio migliore per multi-tenant !!
// const ADMIN_ROLE_OBJECT_IDS = [
//     "ID_OGGETTO_Global_Admin_NEL_TUO_TENANT",
//     "ID_OGGETTO_App_Admin_NEL_TUO_TENANT",
//     // ...
// ];

// Approccio migliore multi-tenant: Controllare gli ID TEMPLATE dei ruoli
const ADMIN_ROLE_TEMPLATE_IDS = [
    "62e90394-69f5-4237-9190-012177145e10", // Global Administrator
    "9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3", // Application Administrator
    "158c047a-c907-4556-b7ef-746541514796"  // Cloud Application Administrator
    // Aggiungi altri ID Template se necessario
];

const managedIdentityClientId = "1877d094-1a3c-4efc-bdfd-4c894cfa2a53";


module.exports = async function (context, req) {
    context.log('checkAdminStatus: Function processed request.');
    context.log('checkAdminStatus: Request Headers:', JSON.stringify(req.headers, null, 2));

    let isAdmin = false;
    const clientPrincipalHeader = req.headers['x-ms-client-principal'];

    if (clientPrincipalHeader) {
        try {
            const decodedBuffer = Buffer.from(clientPrincipalHeader, 'base64');
            const clientPrincipal = JSON.parse(decodedBuffer.toString('utf-8'));
            const userId = clientPrincipal.userId;

            context.log('checkAdminStatus: Checking roles for userId:', userId);

            if (userId && managedIdentityClientId && managedIdentityClientId !== "CLIENT_ID_DELLA_TUA_IDENTITA_GESTITÀ") { // Aggiunto controllo su placeholder
                context.log(`Attempting to get Graph token using explicit MI Client ID: ${managedIdentityClientId}`);
                // 1. Crea le credenziali specificando l'ID Cliente della MI
                const credential = new DefaultAzureCredential({
                    managedIdentityClientId: managedIdentityClientId // <-- MODIFICA CHIAVE
                });
                // 2. Ottieni il token per Graph API
                const graphToken = await credential.getToken("https://graph.microsoft.com/.default");

                if (!graphToken || !graphToken.token) {
                    throw new Error("Failed to acquire token for Graph API using specified Managed Identity Client ID.");
                }
                context.log('checkAdminStatus: Graph token acquired successfully.');

                // 3. Inizializza Graph Client (come prima)
                const graphClient = Client.init({
                    authProvider: (done) => {
                        done(null, graphToken.token);
                    },
                });

                // 4. Chiama Graph API per i ruoli (come prima)
                context.log('checkAdminStatus: Calling Graph API for roles...');
                const directoryRoles = await graphClient
                    .api(`/users/${userId}/transitiveMemberOf/microsoft.graph.directoryRole`)
                    .select('roleTemplateId')
                    .get();
                context.log('checkAdminStatus: Roles from Graph API:', JSON.stringify(directoryRoles));

                // 5. Controlla i ruoli (come prima)
                if (directoryRoles && directoryRoles.value && Array.isArray(directoryRoles.value)) {
                    isAdmin = directoryRoles.value.some(role =>
                        role.roleTemplateId && ADMIN_ROLE_TEMPLATE_IDS.includes(role.roleTemplateId)
                    );
                }
                context.log(`checkAdminStatus: Admin check result based on Graph roles: ${isAdmin}`);

            } else {
                if (!userId) context.log.warn("checkAdminStatus: userId not found in client principal.");
                if (!managedIdentityClientId || managedIdentityClientId === "CLIENT_ID_DELLA_TUA_IDENTITA_GESTITÀ") {
                     context.log.error("checkAdminStatus: Managed Identity Client ID is missing or not replaced in code!");
                     throw new Error("Managed Identity Client ID not configured in function code."); // Genera errore se l'ID non è stato inserito
                }
            }

        } catch (error) {
             context.log.error("checkAdminStatus: Error during Graph API call or processing:", error);
             context.res = {
                 status: 500,
                 headers: { 'Content-Type': 'application/json' },
                 body: { isAdmin: false, error: error.message || "Unknown error during credential acquisition or Graph call." }
             };
             return;
        }
    } else {
        // Questo caso non dovrebbe più accadere se l'autenticazione SWA funziona
        context.log.warn("checkAdminStatus: x-ms-client-principal header not found.");
        context.res = {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
            body: { isAdmin: false, error: "Autenticazione richiesta." }
        };
        return;
    }

    // Risposta normale
    context.res = {
        headers: { 'Content-Type': 'application/json' },
        body: {
            isAdmin: isAdmin
        }
    };
};