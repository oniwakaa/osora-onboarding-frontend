// api/checkAdminStatus/index.js

module.exports = async function (context, req) {
    context.log('checkAdminStatus Request Headers:', JSON.stringify(req.headers, null, 2));
    context.log('JavaScript HTTP trigger function processed a request for checkAdminStatus.');

    let isAdmin = false; // Default a non admin
    let userName = "N/D";
    let userTenantId = "N/D";

    // L'header speciale iniettato da Azure Static Web Apps con le info utente
    const clientPrincipalHeader = req.headers['x-ms-client-principal'];

    if (clientPrincipalHeader) {
        try {
            // L'header è una stringa JSON codificata in Base64
            const decodedBuffer = Buffer.from(clientPrincipalHeader, 'base64');
            const clientPrincipal = JSON.parse(decodedBuffer.toString('utf-8'));

            context.log('Client Principal:', clientPrincipal); // Log per debug

            userName = clientPrincipal.userDetails || "Utente sconosciuto";
            userTenantId = clientPrincipal.identityProvider || "Tenant sconosciuto"; // Spesso identityProvider contiene il tenant

            // Elenco dei nomi dei ruoli amministrativi considerati sufficienti
            // Questi sono i nomi visualizzati comuni, potrebbero variare leggermente
            // o essere in inglese a seconda della configurazione del tenant/lingua.
            // È più robusto controllare gli ID Oggetto dei ruoli se possibile, ma richiede chiamate Graph API.
            // Per ora, ci basiamo sui nomi comuni passati nell'header (se presenti).
            const adminRoleNames = [
                "Global Administrator", // Amministratore globale
                "Application Administrator", // Amministratore applicazione
                "Cloud Application Administrator" // Amministratore applicazione cloud
                // Aggiungi altri nomi di ruolo se necessario (es: "Privileged Role Administrator")
            ];

            // Controlla se l'utente ha uno dei ruoli elencati
            if (clientPrincipal.userRoles && Array.isArray(clientPrincipal.userRoles)) {
                isAdmin = clientPrincipal.userRoles.some(role => adminRoleNames.includes(role));
                context.log(`User roles found: [${clientPrincipal.userRoles.join(', ')}]. Admin check result: ${isAdmin}`);
            } else {
                context.log("Nessun ruolo trovato nell'header x-ms-client-principal.");
                // Potrebbe essere necessario controllare anche altri claims o fare una chiamata Graph API
                // per ottenere i ruoli in modo più affidabile se l'header non li contiene sempre.
                // Per ora, se non ci sono ruoli nell'header, consideriamo l'utente non admin.
            }

        } catch (error) {
            context.log.error("Errore durante il parsing dell'header x-ms-client-principal:", error);
            // Se c'è un errore nel parsing, consideriamo non admin per sicurezza
            isAdmin = false;
        }
    } else {
        context.log.warn("Header x-ms-client-principal non trovato. La funzione è stata chiamata senza autenticazione SWA?");
        // Se manca l'header, significa che l'utente non è autenticato tramite SWA
         context.res = {
             status: 401, // Unauthorized
             body: "Autenticazione richiesta."
         };
         return;
    }

    // Prepara la risposta JSON
    context.res = {
        // status: 200, // Predefinito
        headers: { 'Content-Type': 'application/json' },
        body: {
            isAdmin: isAdmin
            // Potresti restituire anche userName, tenantId per debug se volessi
            // userName: userName,
            // tenantId: userTenantId
        }
    };
};