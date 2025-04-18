// auth.js (VERSIONE MINIMALISTA - Login gestito da SWA)

// Potremmo aver bisogno di msalConfig e msalInstance più tardi
// per operazioni specifiche (es: chiamate Graph API dirette, logout MSAL),
// ma non per il login iniziale né per ottenere l'utente per le chiamate API SWA.
const msalConfig = {
    auth: {
        clientId: "9bf727de-528a-4c7b-9e44-c7505a8111d8",
        authority: "https://login.microsoftonline.com/common",
        // Redirect URI non è usato da SWA per il suo flusso .auth, ma lo lasciamo per coerenza
        // se MSAL dovesse servire per altro.
        redirectUri: window.location.origin + "/onboarding.html",
    },
    cache: {
        cacheLocation: "sessionStorage",
        storeAuthStateInCookie: false,
    }
    // Rimuoviamo il logger per ora per pulizia
};

// Potremmo non aver bisogno di inizializzarla subito
// const msalInstance = new msal.PublicClientApplication(msalConfig);

console.log("auth.js caricato (login gestito da SWA .auth endpoints)");

// Le funzioni signIn, getActiveAccount non servono più per l'autenticazione gestita da SWA