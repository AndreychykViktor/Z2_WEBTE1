/**
 * Ukladanie spracovaných dát a nastavení do localStorage.
 *
 * Štruktúra uložených dát:
 * {
 *   live:  { <idReštaurácie>: Záznam },
 *   local: { <idReštaurácie>: Záznam }
 * }
 * Záznam = { status: 'ok' | 'error', items: [...], updatedAt: ISO, fetchedOn: 'YYYY-MM-DD',
 *            error: text | null, lastSuccessAt: ISO | null }
 */
const MenuStorage = (function (config) {
    'use strict';

    function read(key, fallback) {
        try {
            const raw = window.localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            console.warn('localStorage nie je dostupný alebo obsahuje poškodené dáta.', e);
            return fallback;
        }
    }

    function write(key, value) {
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.warn('Do localStorage sa nepodarilo zapisovať.', e);
            return false;
        }
    }

    function loadAll() {
        const data = read(config.storageKey, null);
        return data && typeof data === 'object' ? data : { live: {}, local: {} };
    }

    /** Uložený záznam reštaurácie pre zvolený zdroj, alebo null. */
    function getEntry(source, restaurantId) {
        const all = loadAll();
        return (all[source] && all[source][restaurantId]) || null;
    }

    function saveEntry(source, restaurantId, entry) {
        const all = loadAll();
        all[source] = all[source] || {};
        all[source][restaurantId] = entry;
        return write(config.storageKey, all);
    }

    /**
     * Sú uložené úspešne načítané dáta z dnešného dňa? (vtedy sa stránka reštaurácie znova nenačítava)
     * Neúspešný pokus sa za dnešné dáta nepovažuje – pri ďalšom otvorení sa načítanie zopakuje.
     */
    function isFromToday(entry, todayIso) {
        return Boolean(entry && entry.status === 'ok' && entry.fetchedOn === todayIso);
    }

    function clearData() {
        try {
            window.localStorage.removeItem(config.storageKey);
        } catch (e) {
            console.warn('localStorage sa nepodarilo vymazať.', e);
        }
    }

    function loadSettings() {
        const s = read(config.settingsKey, {});
        return {
            source: s.source === 'live' || s.source === 'local' ? s.source : null,
            hidden: Array.isArray(s.hidden) ? s.hidden : []
        };
    }

    function saveSettings(settings) {
        write(config.settingsKey, settings);
    }

    return { getEntry, saveEntry, isFromToday, clearData, loadSettings, saveSettings };
}(APP_CONFIG));
