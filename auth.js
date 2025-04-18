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

// Funzione chiamata quando si clicca il pulsante "Accedi"
async function signIn() {
    const loginRequest = {
        // Chiediamo i permessi minimi per leggere il profilo utente
        scopes: ["User.Read", "openid", "profile"]
    };

    try {
        console.log("Provo ad effettuare il login...");
        // Apre la finestra popup di Microsoft per il login
        const loginResponse = await msalInstance.loginPopup(loginRequest);
        // Se il login ha successo, imposta l'utente come "attivo" per questa sessione
        msalInstance.setActiveAccount(loginResponse.account);
        console.log("Login riuscito! Account:", loginResponse.account);
        // Manda l'utente alla pagina successiva
        window.location.href = "/onboarding.html";
    } catch (error) {
        // Se qualcosa va storto durante il login
        console.error("Login fallito:", error);
        alert("Login fallito. Verifica la console per i dettagli (puoi aprirla con Cmd+Option+J o dal menu Sviluppo del browser).");
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