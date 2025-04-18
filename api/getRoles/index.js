module.exports = async function (context, req) {
    context.log('getRoles function invoked.');
    // La piattaforma SWA dovrebbe inviare i claims dell'utente nel body della richiesta POST
    context.log('Request Body (claims from SWA):', req.body);

    // Implementazione molto basilare: restituisce solo il ruolo 'authenticated'
    // per qualsiasi utente loggato che arrivi qui.
    const roles = ["authenticated"];

    // QUI potresti inserire logica futura per assegnare ruoli custom
    // basandoti sui claims ricevuti in req.body, se necessario.

    context.res = {
        // La risposta DEVE essere un oggetto JSON con una chiave "roles"
        // contenente un array di stringhe (i nomi dei ruoli).
        body: {
            "roles": roles
        }
    };
};