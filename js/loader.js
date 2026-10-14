/**
 * Asynchrónne načítanie stránok reštaurácií (Fetch API) a ich spracovanie cez DOMParser.
 * Cudzí HTML kód sa nikdy nevkladá do stránky – ďalej sa posúvajú iba spracované dáta.
 */
const MenuLoader = (function (config, U) {
    'use strict';

    class LoadError extends Error {
        constructor(message) {
            super(message);
            this.name = 'LoadError';
        }
    }

    /** Zostaví adresu cez proxy podľa šablóny v konfigurácii. */
    function buildProxyUrl(targetUrl) {
        const template = (config.proxyUrl || '').trim();
        if (!template) {
            throw new LoadError('Adresa proxy nie je nastavená (js/config.js → proxyUrl). Prepnite zdroj na „Lokálna kópia“.');
        }
        const encoded = encodeURIComponent(targetUrl);
        return template.includes('{url}') ? template.replace('{url}', encoded) : template + encoded;
    }

    /** fetch s časovým limitom. */
    async function fetchWithTimeout(url, timeoutMs) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { signal: controller.signal, cache: 'no-store' });
        } catch (e) {
            if (e.name === 'AbortError') {
                throw new LoadError('Stránka reštaurácie neodpovedala včas.');
            }
            if (window.location.protocol === 'file:') {
                throw new LoadError('Stránku nie je možné načítať zo súboru (file://). Otvorte projekt cez webový server.');
            }
            throw new LoadError('Stránka reštaurácie je momentálne nedostupná.');
        } finally {
            clearTimeout(timer);
        }
    }

    /** Ak proxy vracia JSON (napr. { contents: "<html>…" }), vyberie z neho HTML. */
    function extractHtml(body, contentType) {
        if (contentType.includes('application/json')) {
            try {
                const json = JSON.parse(body);
                const html = json.contents ?? json.html ?? json.data ?? json.body;
                if (typeof html === 'string') {
                    return html;
                }
            } catch (e) {
                /* nie je to JSON – pokračujeme s pôvodným textom */
            }
        }
        return body;
    }

    /**
     * Načíta a spracuje jednu reštauráciu.
     * @returns {Promise<Array>} pole položiek v jednotnej štruktúre
     */
    async function loadRestaurant(restaurant, source) {
        const url = source === 'live' ? buildProxyUrl(restaurant.url) : restaurant.localCopy;
        const response = await fetchWithTimeout(url, config.fetchTimeoutMs);
        if (!response.ok) {
            throw new LoadError(`Stránka reštaurácie vrátila chybu HTTP ${response.status}.`);
        }

        const body = await response.text();
        const html = extractHtml(body, response.headers.get('content-type') || '');
        if (!html || html.length < 50) {
            throw new LoadError('Stránka reštaurácie vrátila prázdnu odpoveď.');
        }

        const doc = new DOMParser().parseFromString(html, 'text/html');
        const items = restaurant.parse(doc, restaurant.id);
        if (!Array.isArray(items) || items.length === 0) {
            throw new U.StructureError('Na stránke sa nenašla žiadna položka menu.');
        }
        return items;
    }

    /** Text chyby pre používateľa. */
    function describeError(error) {
        if (error instanceof U.StructureError) {
            return `Menu sa nepodarilo spracovať – štruktúra stránky sa zmenila. (${error.message})`;
        }
        if (error instanceof LoadError) {
            return error.message;
        }
        console.error(error);
        return 'Pri spracovaní menu nastala neočakávaná chyba.';
    }

    return { loadRestaurant, describeError };
}(APP_CONFIG, MenuUtils));
