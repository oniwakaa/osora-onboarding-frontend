// auth.js

const msalConfig = {
    auth: {
        clientId: "9bf727de-528a-4c7b-9e44-c7505a8111d8", // <-- !!! SOSTITUISCI CON IL TUO ID APPLICAZIONE (CLIENT) !!!
        authority: "https://login.microsoftonline.com/common", // Per multi-tenant
        // Questo indirizzo dice a Microsoft dove rimandare l'utente dopo il login.
        // Deve corrispondere a uno di quelli inseriti nel Portale Azure.
        // Usiamo la pagina onboarding.html come destinazione.
        // Controlliamo se siamo su localhost (sviluppo) o sull'URL di produzione.
        redirectUri: window.location.origin.startsWith('http://localhost')
                     ? "http://localhost:3000/onboarding.html" // <-- !!! SOSTITUISCI PORTA (es: 3000) !!!
                     : window.location.origin + "/onboarding.html", // Per la Static Web App
    },
    cache: {
        cacheLocation: "sessionStorage", // Salva i dati solo per la sessione corrente del browser
        storeAuthStateInCookie: false,
    }
};

// Inizializza la libreria MSAL
const msalInstance = new msal.PublicClientApplication(msalConfig);

async function signIn() {
    const loginRequest = {
        scopes: ["User.Read", "openid", "profile"]
    };

    try {
        console.log("Provo ad effettuare il login...");
        const loginResponse = await msalInstance.loginPopup(loginRequest);
        // Login riuscito, imposta l'account attivo
        msalInstance.setActiveAccount(loginResponse.account);
        console.log("Login successful! Account:", loginResponse.account);

        // --- Logica di reindirizzamento modificata ---
        // Ora che l'account è attivo nella sessione MSAL, possiamo navigare
        // alla pagina successiva o ricaricare se siamo già lì.

        // Controlla se siamo già sulla pagina di onboarding
        if (window.location.pathname !== "/onboarding.html" && window.location.pathname !== "/onboarding") {
            // Se siamo su index.html (o altra pagina), vai a onboarding.html
            console.log("Reindirizzamento a onboarding.html...");
            window.location.href = "/onboarding.html";
        } else {
            // Se siamo GIÀ su onboarding.html (improbabile ma possibile),
            // un semplice reload rieseguirà la logica di quella pagina
            // che ora troverà l'account attivo.
            console.log("Già su onboarding.html, ricarico la pagina...");
            location.reload();
        }
        // --- Fine logica di reindirizzamento modificata ---

    } catch (error) {
        console.error("Login fallito:", error);
        // Aggiungiamo il codice errore specifico per dare più informazioni all'utente
        const errorCode = error.errorCode || "N/A";
        alert(`Login fallito (${errorCode}). Verifica la console per i dettagli.`);
    }
}

// Funzione per recuperare l'utente attualmente loggato
function getActiveAccount() {
    return msalInstance.getActiveAccount();
}

// (Opzionale, per gestire il caso di 'loginRedirect' invece di 'loginPopup')
msalInstance.handleRedirectPromise().then(response => {
    if (response) {
        msalInstance.setActiveAccount(response.account);
    }
}).catch(err => console.error(err));