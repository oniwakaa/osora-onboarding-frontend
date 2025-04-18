// auth.js

const msalConfig = {
    auth: {
        clientId: "9bf727de-528a-4c7b-9e44-c7505a8111d8",
        authority: "https://login.microsoftonline.com/common",
        // Con loginRedirect, l'URI a cui si torna è cruciale.
        // Assicuriamoci che sia onboarding.html e che sia registrato in Azure AD.
        redirectUri: window.location.origin.startsWith('http://localhost')
                     ? "http://localhost:3000/onboarding.html" // Assicurati che PORTA e URI siano registrati
                     : window.location.origin + "/onboarding.html", // Assicurati che questo sia registrato
    },
    cache: {
        cacheLocation: "sessionStorage",
        storeAuthStateInCookie: false,
    }
};

const msalInstance = new msal.PublicClientApplication(msalConfig);
console.log("MSAL instance initialized (modalità redirect).", msalInstance);

// Funzione chiamata quando si clicca il pulsante "Accedi" (USA LOGINREDIRECT)
async function signIn() {
    const loginRequest = {
        scopes: ["User.Read", "openid", "profile"]
    };

    try {
        console.log("Avvio loginRedirect...");
        // Avvia il flusso di redirect. L'utente lascerà questa pagina.
        // La gestione del ritorno avverrà tramite handleRedirectPromise al caricamento
        // della pagina specificata in redirectUri.
        await msalInstance.loginRedirect(loginRequest);

        // IMPORTANTE: Il codice dopo await loginRedirect non viene eseguito subito,
        // perché il browser viene reindirizzato ad Azure AD.

    } catch (error) {
        // Cattura errori nella *preparazione* del redirect, non quelli dopo.
        console.error("Errore durante l'avvio di loginRedirect:", error);
        const errorCode = error.errorCode || "N/A";
        const errorMessage = error.errorMessage || "Errore sconosciuto";
        alert(`Avvio Login fallito (${errorCode}: ${errorMessage}). Verifica la console.`);
    }
}

// Funzione per recuperare l'utente attualmente loggato
function getActiveAccount() {
    let activeAccount = msalInstance.getActiveAccount();
    // console.log("getActiveAccount (chiamata iniziale):", activeAccount); // Log meno verboso
    if (!activeAccount && msalInstance.getAllAccounts().length > 0) {
      activeAccount = msalInstance.getAllAccounts()[0];
      msalInstance.setActiveAccount(activeAccount); // Imposta se trovato nella cache
      console.log("Impostato account attivo dal primo nella cache:", activeAccount);
    }
    return activeAccount;
}

// --- GESTIONE DEL RITORNO DAL REDIRECT ---
// Questa funzione viene eseguita da MSAL al caricamento di OGNI pagina
// per vedere se l'URL contiene una risposta da Azure AD. È FONDAMENTALE.
msalInstance.handleRedirectPromise().then(response => {
    console.log("handleRedirectPromise eseguito...");
    if (response) {
        // Siamo tornati da Azure AD dopo un login/consent redirect
        console.log("handleRedirectPromise ha trovato una risposta:", response);
        // MSAL ha già salvato i token nella cache (sessionStorage).
        // Impostiamo l'account attivo se non lo è già.
        if (response.account && !msalInstance.getActiveAccount()) {
           msalInstance.setActiveAccount(response.account);
           console.log("Account impostato come attivo da handleRedirectPromise");
        }
        // Ora l'utente è loggato. Se siamo su onboarding.html, la logica
        // di quella pagina (DOMContentLoaded) verrà eseguita e troverà l'account.
        // Se fossimo tornati su index.html, potremmo reindirizzare ora.
        if (window.location.pathname !== "/onboarding.html" && window.location.pathname !== "/onboarding") {
           console.log("Atterrato su pagina diversa da onboarding.html dopo redirect, reindirizzo...");
           window.location.href = "/onboarding.html";
        }

    } else {
        // Caricamento normale della pagina, non un ritorno da Azure AD.
        // Controlliamo se l'utente è già loggato da una sessione precedente.
        // console.log("handleRedirectPromise non ha trovato risposta (caricamento normale).");
        const account = getActiveAccount(); // Usa la nostra funzione che controlla anche la cache
        if (account) {
             console.log("Trovato account attivo da sessione esistente:", account);
             // Se l'utente è già loggato ma non è su onboarding.html, mandiamocelo.
             if (window.location.pathname !== "/onboarding.html" && window.location.pathname !== "/onboarding") {
                 window.location.href = "/onboarding.html";
             }
        } else {
             console.log("Nessun account attivo trovato nella sessione.");
             // Se non è loggato e non è sulla pagina iniziale, rimandalo lì
             if (window.location.pathname !== "/index.html" && window.location.pathname !== "/") {
                 //window.location.href = "/index.html"; // Commentato per evitare redirect indesiderati durante test
             }
        }
    }
}).catch(err => {
    console.error("Errore globale in handleRedirectPromise:", err);
    // Gestire errori specifici se necessario
});