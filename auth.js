// auth.js

const msalConfig = {
    auth: {
        clientId: "9bf727de-528a-4c7b-9e44-c7505a8111d8",
        authority: "https://login.microsoftonline.com/common",
        // L'URI qui deve corrispondere ESATTAMENTE a uno di quelli registrati in Azure AD
        // per la piattaforma SPA (sia per localhost che per produzione).
        redirectUri: window.location.origin.startsWith('http://localhost')
                     ? "http://localhost:3000/onboarding.html" // Assicurati che la PORTA sia corretta
                     : window.location.origin + "/onboarding.html",
    },
    cache: {
        cacheLocation: "sessionStorage",
        storeAuthStateInCookie: false,
    }
};

// Inizializza la libreria MSAL
const msalInstance = new msal.PublicClientApplication(msalConfig);
console.log("MSAL instance initialized.", msalInstance); // Log per conferma

// Funzione chiamata quando si clicca il pulsante "Accedi" (MODIFICATA)
async function signIn() {
    const loginRequest = {
        scopes: ["User.Read", "openid", "profile"]
    };

    try {
        console.log("Provo ad effettuare il login (signIn function)...");
        const loginResponse = await msalInstance.loginPopup(loginRequest);
        console.log("loginPopup ha restituito una risposta:", loginResponse);

        // MSAL v2+ dovrebbe impostare l'account attivo automaticamente dopo loginPopup/loginRedirect.
        // Chiamare setActiveAccount è spesso ridondante ma lo teniamo per chiarezza.
        if (loginResponse && loginResponse.account) {
             msalInstance.setActiveAccount(loginResponse.account);
             console.log("Account impostato come attivo:", loginResponse.account);

             // --- Logica di reindirizzamento Semplificata ---
             // Dopo il successo del popup, ci assicuriamo solo che l'utente vada/sia sulla pagina giusta.
             // La logica su onboarding.html (DOMContentLoaded) dovrebbe gestire il resto.
             if (window.location.pathname !== "/onboarding.html" && window.location.pathname !== "/onboarding") {
                 console.log("Non siamo su onboarding.html, reindirizzo...");
                 window.location.href = "/onboarding.html";
             } else {
                 console.log("Già su onboarding.html. La pagina dovrebbe semplicemente continuare il caricamento.");
                 // Non facciamo nulla qui (né redirect né reload),
                 // ci affidiamo allo script dentro onboarding.html che verrà eseguito.
             }
             // --- Fine logica di reindirizzamento Semplificata ---
        } else {
             console.warn("loginPopup completato ma senza un oggetto account valido nella risposta.");
             // Potrebbe essere un caso limite, proviamo a recuperare dalla cache
             const account = getActiveAccount(); // Usa la funzione aggiornata sotto
             if (account) {
                 console.log("Recuperato account dalla cache:", account);
                 if (window.location.pathname !== "/onboarding.html" && window.location.pathname !== "/onboarding") {
                     window.location.href = "/onboarding.html";
                 }
             } else {
                 alert("Login completato ma non è stato possibile recuperare l'account.");
             }
        }

    } catch (error) {
        console.error("Login fallito:", error);
        const errorCode = error.errorCode || "N/A";
        const errorMessage = error.errorMessage || "Errore sconosciuto";
        // Forniamo più dettagli possibili nell'alert
        alert(`Login fallito (${errorCode}: ${errorMessage}). Verifica la console per l'oggetto errore completo.`);
    }
}

// Funzione per recuperare l'utente attualmente loggato (MODIFICATA)
function getActiveAccount() {
    let activeAccount = msalInstance.getActiveAccount();
    console.log("getActiveAccount (chiamata iniziale):", activeAccount);

    // Workaround: Se getActiveAccount è null ma ci sono account nella cache
    if (!activeAccount && msalInstance.getAllAccounts().length > 0) {
      console.warn("Nessun account attivo trovato, ma esiste almeno un account nella cache. Provo a impostare il primo.");
      activeAccount = msalInstance.getAllAccounts()[0];
      msalInstance.setActiveAccount(activeAccount); // Imposta il primo come attivo
      console.log("Impostato account attivo dal primo nella cache:", activeAccount);
    }
    return activeAccount;
}


// --- COMMENTIAMO handleRedirectPromise ---
// Questa chiamata è pensata principalmente per il flusso loginRedirect.
// Dato che usiamo loginPopup, proviamo a rimuoverla per vedere se causa interferenze.
/*
msalInstance.handleRedirectPromise().then(response => {
    // Questa logica viene eseguita solo se la pagina viene caricata
    // come risultato di un redirect da Azure AD (flusso loginRedirect).
    console.log("handleRedirectPromise eseguito...");
    if (response) {
        console.log("handleRedirectPromise ha trovato una risposta:", response);
        msalInstance.setActiveAccount(response.account);
    } else {
        console.log("handleRedirectPromise non ha trovato una risposta (normale se si usa loginPopup).");
    }
}).catch(err => {
    // Non trattare errori di interazione qui, potrebbero essere gestiti altrove
    if (err.errorCode !== "interaction_in_progress") {
         console.error("Errore in handleRedirectPromise:", err);
    } else {
         console.warn("handleRedirectPromise: Interazione già in corso.");
    }
});
*/