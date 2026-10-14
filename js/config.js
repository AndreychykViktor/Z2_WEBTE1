/**
 * Konfigurácia aplikácie „Obedové menu v okolí fakulty“.
 */
const APP_CONFIG = Object.freeze({
    /*
     * Adresa CORS proxy oznámená na cvičení.
     * Zástupný reťazec {url} sa nahradí zakódovanou adresou stránky reštaurácie.
     * Ak {url} v adrese chýba, adresa reštaurácie sa pripojí na koniec.
     * Príklad: 'https://proxy.example.sk/?url={url}'
     * Kým je prázdna, režim „Živá stránka“ zobrazí chybu a je potrebné použiť lokálne kópie.
     */
    proxyUrl: '',

    /* Maximálny čas čakania na odpoveď jednej stránky (ms). */
    fetchTimeoutMs: 15000,

    /* Kľúče v localStorage. */
    storageKey: 'obedoveMenu.data.v1',
    settingsKey: 'obedoveMenu.nastavenia.v1'
});
