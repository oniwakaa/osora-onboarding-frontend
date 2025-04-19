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


module.exports = async function (context, req) {
    context.log('checkAdminStatus: Function processed request.');
    context.log('checkAdminStatus: Request Headers:', JSON.stringify(req.headers, null, 2));

    let isAdmin = false;
    const clientPrincipalHeader = req.headers['x-ms-client-principal'];

    if (clientPrincipalHeader) {
        try {
            const decodedBuffer = Buffer.from(clientPrincipalHeader, 'base64');
            const clientPrincipal = JSON.parse(decodedBuffer.toString('utf-8'));
            const userId = clientPrincipal.userId; // ID Oggetto dell'utente loggato

            context.log('checkAdminStatus: Checking roles for userId:', userId);

            if (userId) {
                // 1. Ottieni un token per Graph API usando la Managed Identity della Function App
                // DefaultAzureCredential proverà diverse strategie (incl. Managed Identity)
                const credential = new DefaultAzureCredential();
                const graphToken = await credential.getToken("https://graph.microsoft.com/.default");

                if (!graphToken || !graphToken.token) {
                    throw new Error("Failed to acquire token for Graph API using Managed Identity.");
                }

                // 2. Inizializza il client Graph
                const graphClient = Client.init({
                    authProvider: (done) => {
                        done(null, graphToken.token); // Passa il token ottenuto
                    },
                });

                // 3. Chiama Graph API per ottenere i ruoli di directory dell'utente
                // Usiamo transitiveMemberOf per ottenere i ruoli diretti e ereditati (tramite gruppi)
                // e filtriamo per il tipo microsoft.graph.directoryRole
                // Selezioniamo roleTemplateId che è consistente tra i tenant
                const directoryRoles = await graphClient
                    .api(`/users/${userId}/transitiveMemberOf/microsoft.graph.directoryRole`)
                    .select('roleTemplateId') // Seleziona solo il campo che ci serve
                    .get();

                context.log('checkAdminStatus: Roles from Graph API:', JSON.stringify(directoryRoles));

                // 4. Controlla se l'utente ha uno dei ruoli admin richiesti (basato su ID Template)
                if (directoryRoles && directoryRoles.value && Array.isArray(directoryRoles.value)) {
                    isAdmin = directoryRoles.value.some(role =>
                        role.roleTemplateId && ADMIN_ROLE_TEMPLATE_IDS.includes(role.roleTemplateId)
                    );
                }
                context.log(`checkAdminStatus: Admin check result based on Graph roles: ${isAdmin}`);

            } else {
                context.log.warn("checkAdminStatus: userId not found in client principal.");
            }

        } catch (error) {
            context.log.error("checkAdminStatus: Error during Graph API call or processing:", error);
            // Potresti voler restituire un errore 500 qui invece di isAdmin=false
            // Ma per ora lo lasciamo false per semplicità
            isAdmin = false;
            // Restituisce l'errore specifico per diagnosi
            context.res = {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
                body: { isAdmin: false, error: error.message }
            };
            return;
        }
    } else {
        context.log.warn("checkAdminStatus: x-ms-client-principal header not found.");
        context.res = {
            status: 401, // Unauthorized
            headers: { 'Content-Type': 'application/json' },
            body: { isAdmin: false, error: "Autenticazione richiesta." }
        };
        return;
    }

    // Prepara la risposta JSON normale
    context.res = {
        headers: { 'Content-Type': 'application/json' },
        body: {
            isAdmin: isAdmin
        }
    };
};