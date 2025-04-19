// osora-frontend-backup/api/checkAdminStatus/index.js

const { ManagedIdentityCredential } = require("@azure/identity");
const { Client } = require("@microsoft/microsoft-graph-client");
// È necessario 'isomorphic-fetch' per fornire un'implementazione di fetch globale
// che il client Microsoft Graph possa usare in un ambiente Node.js.
require("isomorphic-fetch");

// ID Template dei ruoli amministratore di Azure AD da controllare
// Puoi trovare altri ID qui: https://learn.microsoft.com/en-us/azure/active-directory/roles/permissions-reference
const ADMIN_ROLE_TEMPLATE_IDS = [
    "62e90394-69f5-4237-9190-012177145e10", // Global Administrator
    "fe930be7-5e62-47db-91af-98c3a49a38b1", // SharePoint Administrator
    "29232cdf-9323-42fd-ade2-1d097af3e4de", // Teams Administrator
    "f2ef992c-3afb-46b9-b7cf-a126ee74c451", // Exchange Administrator
    "b0f54661-2d74-4c50-afa3-1ec803f12efe"  // User Administrator
    // Aggiungi altri ID template se necessario
];

// Client ID dell'Identità Gestita Assegnata dal Sistema della tua Static Web App
const MANAGED_IDENTITY_CLIENT_ID = "1877d094-1a3c-4efc-bdfd-4c894cfa2a53";

module.exports = async function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request for checkAdminStatus.');

    let userId = null;
    let isAdmin = false;

    // 1. Estrai l'ID Utente dall'header x-ms-client-principal iniettato da SWA Auth
    const clientPrincipalHeader = req.headers['x-ms-client-principal'];
    if (!clientPrincipalHeader) {
        context.log.warn("Missing x-ms-client-principal header. User might not be authenticated via SWA Auth.");
        context.res = {
            status: 401, // Unauthorized
            body: { message: "Utente non autenticato." }
        };
        return;
    }

    try {
        const header = Buffer.from(clientPrincipalHeader, 'base64').toString('ascii');
        const clientPrincipal = JSON.parse(header);
        userId = clientPrincipal.userId; // Questo è l'Object ID (OID) dell'utente in Azure AD
        context.log(`User OID extracted from header: ${userId}`);

        if (!userId) {
             throw new Error("UserID not found in client principal.");
        }

        // 2. Ottieni la credenziale usando l'Identità Gestita Assegnata dal Sistema
        context.log(`Attempting to get credential using ManagedIdentityCredential with explicit Client ID: ${MANAGED_IDENTITY_CLIENT_ID}`);
        const credential = new ManagedIdentityCredential(MANAGED_IDENTITY_CLIENT_ID);

        // 3. Ottieni un token di accesso per Microsoft Graph
        context.log("Attempting to get token for Microsoft Graph scope 'https://graph.microsoft.com/.default'...");
        const tokenResponse = await credential.getToken("https://graph.microsoft.com/.default");
        context.log("Successfully obtained Graph token using Managed Identity.");
        // Non loggare il token stesso per motivi di sicurezza! context.log(`Token: ${tokenResponse.token}`);

        // 4. Inizializza il client Microsoft Graph con il token ottenuto
        // Il client userà questa funzione per ottenere/rinfrescare il token quando necessario
         const authProvider = {
            getAccessToken: async () => {
                // In uno scenario reale con chiamate multiple, potresti voler
                // ri-ottenere il token qui se è vicino alla scadenza,
                // ma per una singola chiamata, possiamo restituire quello appena ottenuto.
                 // Se la chiamata precedente fallisce perché il token è scaduto nel frattempo,
                 // potresti dover implementare una logica di retry qui.
                context.log("Providing access token to Graph client.");
                return tokenResponse.token;
            }
        };

        const graphClient = Client.initWithMiddleware({ authProvider: authProvider });

        // 5. Chiama l'API Graph per ottenere i ruoli di directory dell'utente
        context.log(`Calling Graph API '/users/${userId}/transitiveMemberOf/microsoft.graph.directoryRole' to get directory roles...`);
        // Usiamo transitiveMemberOf per ottenere anche i ruoli ereditati dai gruppi
        // Selezioniamo solo i campi necessari
        const roleMembership = await graphClient.api(`/users/${userId}/transitiveMemberOf/microsoft.graph.directoryRole`)
            .select('id,displayName,roleTemplateId')
            // Aumenta il timeout se necessario per chiamate Graph potenzialmente lente
             // .timeout(15000) // Esempio: 15 secondi
            .get();

        context.log("Graph API call successful.");

        // 6. Controlla se l'utente possiede uno dei ruoli amministratore specificati
        if (roleMembership && roleMembership.value && roleMembership.value.length > 0) {
            context.log(`User belongs to ${roleMembership.value.length} directory roles (or groups assigning roles). Checking against admin list...`);
            isAdmin = roleMembership.value.some(role => {
                context.log(`- Checking role: ${role.displayName} (Template ID: ${role.roleTemplateId})`);
                return role.roleTemplateId && ADMIN_ROLE_TEMPLATE_IDS.includes(role.roleTemplateId.toLowerCase()); // Confronto case-insensitive per sicurezza
            });
        } else {
            context.log("User does not belong to any directory roles directly or via group membership.");
        }

        context.log(`Admin status determined: ${isAdmin}`);

        // 7. Restituisci il risultato
        context.res = {
            status: 200,
            body: { isAdmin: isAdmin }
        };

    } catch (error) {
        context.log.error("Error processing checkAdminStatus:");

        // Logga l'errore specifico per il debug
        // L'oggetto error può contenere più dettagli, specialmente se è un errore dalle librerie Azure
        context.log.error(`Error Type: ${error.name}`);
        context.log.error(`Error Message: ${error.message}`);
        if (error.stack) {
            context.log.error(`Stack Trace: ${error.stack}`);
        }
        // Errori specifici da @azure/identity o @microsoft/microsoft-graph-client potrebbero avere proprietà aggiuntive
        if (error.statusCode) {
             context.log.error(`Status Code: ${error.statusCode}`);
        }
         if (error.code) {
             context.log.error(`Error Code: ${error.code}`);
        }
         if (error.requestId) {
             context.log.error(`Request ID: ${error.requestId}`);
        }
        if (error.cause) {
             context.log.error("Cause:", error.cause);
        }
        // Logga l'intero oggetto errore come JSON per ispezione, se utile
        // Fai attenzione a non loggare informazioni sensibili contenute nell'errore!
        try {
            context.log.error("Full Error Object (JSON):", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
         } catch (e) {
           context.log.error("Could not stringify the full error object.");
        }


        context.res = {
            status: 500,
            // Fornisci un messaggio generico al client, ma logga i dettagli internamente
            body: { message: "Errore interno del server durante la verifica dello stato amministratore." }
        };
    }
};