/**
 * Pomocné funkcie na spracovanie textu, dátumov, cien, alergénov a hmotností.
 * Regulárne výrazy sa používajú iba na krátke texty, ktoré už boli vybraté z DOM stromu
 * (nikdy nie na celý HTML dokument).
 */
const MenuUtils = (function () {
    'use strict';

    const DAY_NAMES = ['', 'Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota', 'Nedeľa'];
    const DAY_KEYS = { pondelok: 1, utorok: 2, streda: 3, stvrtok: 4, piatok: 5, sobota: 6, nedela: 7 };

    /** Typy položiek v jednotnej štruktúre. */
    const ITEM_TYPES = Object.freeze({
        polievka: 'Polievka',
        hlavne: 'Hlavné jedlo',
        vegetarianske: 'Vegetariánske jedlo',
        dezert: 'Dezert / múčne jedlo',
        salat: 'Šalát',
        ine: 'Iné'
    });

    /** Vlastná chyba – stránka má inú štruktúru, ako parser očakáva. */
    class StructureError extends Error {
        constructor(message) {
            super(message);
            this.name = 'StructureError';
        }
    }

    /** Zjednotí medzery a oreže text. */
    function clean(text) {
        return String(text ?? '').replace(/\s+/g, ' ').trim();
    }

    /** Odstráni diakritiku a zmení text na malé písmená (na porovnávanie). */
    function normalize(text) {
        return clean(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }

    /** Vráti číslo dňa 1 (pondelok) – 7 (nedeľa) z textu, alebo null. */
    function dayIndexFromName(text) {
        const norm = normalize(text);
        for (const [key, index] of Object.entries(DAY_KEYS)) {
            if (norm.includes(key)) {
                return index;
            }
        }
        return null;
    }

    /** Číslo dňa v týždni pre objekt Date (1 = pondelok … 7 = nedeľa). */
    function isoDay(date) {
        const d = date.getDay();
        return d === 0 ? 7 : d;
    }

    /** Formát YYYY-MM-DD v miestnom čase. */
    function toIsoDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /** Pondelok týždňa, do ktorého patrí dátum. */
    function mondayOf(date) {
        const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        monday.setDate(monday.getDate() - (isoDay(monday) - 1));
        return monday;
    }

    /** Dátum zvoleného dňa (1–7) v týždni, ktorý obsahuje referenčný dátum. */
    function dateOfWeekday(reference, dayIndex) {
        const d = mondayOf(reference);
        d.setDate(d.getDate() + dayIndex - 1);
        return d;
    }

    /** Prevedie „12.10.2026“ alebo „12. 10. 2026“ na „2026-10-12“. */
    function parseSkDate(text) {
        const m = clean(text).match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
        if (!m) {
            return null;
        }
        return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }

    /** Prevedie text ceny („4,40 €“, „6.00€“) na číslo, inak null. */
    function parsePrice(text) {
        const m = clean(text).match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur)/i);
        if (!m) {
            return null;
        }
        const value = Number.parseFloat(m[1].replace(',', '.'));
        return Number.isFinite(value) ? value : null;
    }

    /** Zoznam alergénov z textu „1,3,7“ → [1, 3, 7]. */
    function parseAllergenList(text) {
        return clean(text)
            .split(/[,;\s]+/)
            .map((part) => Number.parseInt(part, 10))
            .filter((n) => Number.isInteger(n) && n > 0 && n <= 14);
    }

    /**
     * Vyberie alergény z konca názvu jedla – formáty „(1,3,7)“ alebo „A:1,3,7“.
     * Vráti { text: názov bez alergénov, allergens: [...] }.
     */
    function extractAllergens(text) {
        let rest = clean(text);
        let allergens = [];
        const patterns = [/\s*A:\s*([\d,\s]*)$/i, /\s*\(([\d,\s]+)\)\s*$/];
        for (const pattern of patterns) {
            const m = rest.match(pattern);
            if (m) {
                allergens = parseAllergenList(m[1]);
                rest = clean(rest.slice(0, m.index));
                break;
            }
        }
        return { text: rest, allergens };
    }

    /**
     * Vyberie údaje o hmotnosti/objeme („120g“, „0,33l“) z názvu jedla.
     * Vráti { text: názov bez hmotností, weight: '120 g, 200 g' alebo null }.
     */
    function extractWeight(text) {
        const unitPattern = /(\d+(?:[.,]\d+)?)\s?(kg|g|ml|l)(?![a-zá-ž])/gi;
        const found = [];
        const rest = clean(text).replace(unitPattern, (match, amount, unit) => {
            found.push(`${amount} ${unit.toLowerCase()}`);
            return '';
        });
        const cleaned = rest
            .replace(/\s+,/g, ',')
            .replace(/,(\S)/g, ', $1')
            .replace(/(,\s*)+/g, ', ')
            .replace(/^[,\s]+|[,\s]+$/g, '');
        return { text: clean(cleaned), weight: found.length ? found.join(', ') : null };
    }

    /** Prvé písmeno veľké. */
    function capitalize(text) {
        const t = clean(text);
        return t ? t.charAt(0).toLocaleUpperCase('sk') + t.slice(1) : t;
    }

    /** Vytvorí položku menu v jednotnej štruktúre (všetky reštaurácie ju vracajú rovnako). */
    function createItem(data) {
        const dayIndex = data.dayIndex;
        return {
            restaurantId: data.restaurantId,
            dayIndex,
            dayName: DAY_NAMES[dayIndex] || '',
            date: data.date || null,
            type: ITEM_TYPES[data.type] ? data.type : 'ine',
            label: clean(data.label) || null,
            name: capitalize(data.name),
            price: typeof data.price === 'number' ? data.price : null,
            priceStudent: typeof data.priceStudent === 'number' ? data.priceStudent : null,
            weight: data.weight || null,
            allergens: Array.isArray(data.allergens) ? data.allergens : [],
            vegetarian: Boolean(data.vegetarian || data.type === 'vegetarianske')
        };
    }

    /** Formát ceny „4,40 €“. */
    function formatPrice(value) {
        return new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' }).format(value);
    }

    /** Formát dátumu a času poslednej aktualizácie. */
    function formatDateTime(iso) {
        const d = new Date(iso);
        return new Intl.DateTimeFormat('sk-SK', {
            day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }).format(d);
    }

    /** Krátky dátum „14. 10.“ */
    function formatShortDate(date) {
        return `${date.getDate()}. ${date.getMonth() + 1}.`;
    }

    return {
        DAY_NAMES,
        ITEM_TYPES,
        StructureError,
        clean,
        normalize,
        dayIndexFromName,
        isoDay,
        toIsoDate,
        mondayOf,
        dateOfWeekday,
        parseSkDate,
        parsePrice,
        parseAllergenList,
        extractAllergens,
        extractWeight,
        capitalize,
        createItem,
        formatPrice,
        formatDateTime,
        formatShortDate
    };
}());
