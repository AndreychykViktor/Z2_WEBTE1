/**
 * Definície reštaurácií a ich parsery.
 *
 * Každá reštaurácia je objekt s rovnakými vlastnosťami a vlastnou funkciou parse(doc),
 * ktorá dostane dokument vytvorený pomocou DOMParser a vráti pole položiek
 * v jednotnej štruktúre (MenuUtils.createItem). Novú reštauráciu pridáte tak,
 * že do poľa RESTAURANTS doplníte ďalší objekt s vlastnou funkciou parse.
 */
const RESTAURANTS = (function (U) {
    'use strict';

    /* ---------------------------------------------------------------
     * Eat & Meet – Bootstrap záložky (div#day-1 … div#day-7),
     * každé jedlo je blok .menu-body s nadpisom h4, cenou a popisom.
     * --------------------------------------------------------------- */
    function parseEatAndMeet(doc, restaurantId) {
        const tabLinks = doc.querySelectorAll('.tabs a[href^="#day-"]');
        if (tabLinks.length === 0) {
            throw new U.StructureError('Na stránke sa nenašli záložky s dňami (.tabs a[href^="#day-"]).');
        }

        const items = [];
        tabLinks.forEach((link) => {
            const dayIndex = U.dayIndexFromName(link.textContent);
            const pane = doc.getElementById((link.getAttribute('href') || '').slice(1));
            if (!dayIndex || !pane) {
                return;
            }

            pane.querySelectorAll('.menu-body').forEach((block) => {
                const label = U.clean(block.querySelector('.menu-title h4, h4')?.textContent);
                const descEl = block.querySelector('.menu-description .desc, .desc');
                if (!descEl) {
                    return;
                }

                // Alergény sú vo vnorenom <span>, názov je zvyšok textu odseku.
                const allergenEl = descEl.querySelector('span');
                const allergenText = allergenEl ? allergenEl.textContent.replace(/[()]/g, '') : '';
                const fullText = U.clean(descEl.textContent);
                const nameText = allergenEl
                    ? U.clean(fullText.replace(U.clean(allergenEl.textContent), ''))
                    : fullText;
                if (!nameText) {
                    return;
                }
                const { text: name, weight } = U.extractWeight(nameText);

                // Cena má tvar „4,40 € / 2,00 €“ – plná cena / cena pre študenta.
                const priceParts = U.clean(block.querySelector('.price')?.textContent).split('/');

                items.push(U.createItem({
                    restaurantId,
                    dayIndex,
                    date: null,
                    type: eatAndMeetType(label),
                    label: U.capitalize(label.toLocaleLowerCase('sk')),
                    name,
                    weight,
                    price: U.parsePrice(priceParts[0] || ''),
                    priceStudent: U.parsePrice(priceParts[1] || ''),
                    allergens: U.parseAllergenList(allergenText)
                }));
            });
        });
        return items;
    }

    function eatAndMeetType(label) {
        const l = U.normalize(label);
        if (l.includes('polievka')) return 'polievka';
        if (l.includes('vegetarian')) return 'vegetarianske';
        if (l.includes('salat')) return 'salat';
        if (l.includes('sladk') || l.includes('mucn')) return 'dezert';
        if (l.startsWith('menu')) return 'hlavne';
        return 'ine';
    }

    /* ---------------------------------------------------------------
     * Delikanti (Jedáleň PriF UK) – tabuľka, deň je v <th rowspan>,
     * číslo menu v <strong>, názov v ďalšej bunke, cena v poslednej.
     * --------------------------------------------------------------- */
    function parseDelikanti(doc, restaurantId) {
        const table = doc.querySelector('table.prif-denne-table') || doc.querySelector('table.menu-table');
        if (!table) {
            throw new U.StructureError('Na stránke sa nenašla tabuľka denného menu (table.menu-table).');
        }

        const items = [];
        let dayIndex = null;
        let date = null;

        table.querySelectorAll('tr').forEach((row) => {
            const th = row.querySelector('th');
            if (th) {
                dayIndex = U.dayIndexFromName(th.querySelector('strong')?.textContent || th.textContent);
                date = U.parseSkDate(th.textContent);
            }
            if (!dayIndex) {
                return;
            }

            const cells = row.querySelectorAll('td');
            // Riadok „Na tento deň nie je denné menu“ má jedinú bunku s colspan.
            if (cells.length < 2 || cells[0].hasAttribute('colspan')) {
                return;
            }

            const number = U.clean(cells[0].textContent);
            const rawName = U.clean(cells[1].textContent);
            if (!rawName) {
                return;
            }
            const { text: withoutAllergens, allergens } = U.extractAllergens(rawName);
            const { text: name, weight } = U.extractWeight(withoutAllergens);
            const isSoup = number === '';

            items.push(U.createItem({
                restaurantId,
                dayIndex,
                date,
                type: isSoup ? 'polievka' : 'hlavne',
                label: isSoup ? 'Polievka' : `Menu ${number}`,
                name,
                weight,
                price: cells[2] ? U.parsePrice(cells[2].textContent) : null,
                allergens
            }));
        });
        return items;
    }

    /* ---------------------------------------------------------------
     * FreeFood / FiitFood – zoznamy ul.daily-offer > li (deň),
     * vnútri ul.day-offer > li (jedlo) so <span class="brand"> a <span class="price">.
     * Jeden parser slúži pre všetky prevádzky FreeFood – líšia sa len id sekcie.
     * --------------------------------------------------------------- */
    function createFreeFoodParser(sectionId) {
        return function parseFreeFood(doc, restaurantId) {
            const section = doc.getElementById(sectionId);
            const list = section?.querySelector('ul.daily-offer');
            if (!list) {
                throw new U.StructureError(`Na stránke sa nenašla sekcia #${sectionId} so zoznamom ul.daily-offer.`);
            }

            const items = [];
            list.querySelectorAll(':scope > li').forEach((dayLi) => {
                const title = U.clean(dayLi.querySelector('.day-title')?.textContent);
                const dayIndex = U.dayIndexFromName(title);
                if (!dayIndex) {
                    return;
                }
                const date = U.parseSkDate(title);

                dayLi.querySelectorAll('ul.day-offer > li').forEach((li) => {
                    const prefix = U.clean(li.querySelector('span.brand:not(.price)')?.textContent);
                    const price = U.parsePrice(li.querySelector('.price')?.textContent || '');

                    // Text jedla = obsah <li> bez vnorených <span> (prefix a cena).
                    const copy = li.cloneNode(true);
                    copy.querySelectorAll('span').forEach((span) => span.remove());
                    let text = U.clean(copy.textContent);
                    if (!text) {
                        return;
                    }

                    const vegetarian = /\(V\)/.test(text);
                    text = U.clean(text.replace(/\(V\)/g, ''));
                    const { text: withoutAllergens, allergens } = U.extractAllergens(text);
                    const { text: name, weight } = U.extractWeight(withoutAllergens);

                    const isSoup = /^P\.?$/i.test(prefix);
                    const number = prefix.replace(/\D/g, '');
                    let type = isSoup ? 'polievka' : 'hlavne';
                    if (!isSoup && vegetarian) {
                        type = 'vegetarianske';
                    }

                    items.push(U.createItem({
                        restaurantId,
                        dayIndex,
                        date,
                        type,
                        label: isSoup ? 'Polievka' : (number ? `Menu ${number}` : null),
                        name,
                        weight,
                        price,
                        allergens,
                        vegetarian
                    }));
                });
            });
            return items;
        };
    }

    /* ---------------------------------------------------------------
     * Zoznam reštaurácií. Na pridanie ďalšej stačí doplniť nový objekt.
     * --------------------------------------------------------------- */
    return [
        {
            id: 'eatandmeet',
            name: 'Eat & Meet',
            subtitle: 'Študentská reštaurácia Átriaky',
            url: 'https://www.eatandmeet.sk/tyzdenne-menu',
            localCopy: 'local/eatandmeet.html',
            address: 'ŠD Átriaky, blok AD-U, Staré Grunty, Bratislava',
            priceNote: 'Cena pre verejnosť / pre študentov (s príspevkom).',
            parse: parseEatAndMeet
        },
        {
            id: 'delikanti',
            name: 'Delikanti – Jedáleň PriF UK',
            subtitle: 'Jedáleň Prírodovedeckej fakulty UK',
            url: 'https://www.delikanti.sk/prevadzky/3-jedalen-prif-uk/',
            localCopy: 'local/delikanti.html',
            address: 'Ilkovičova 6, pavilón CH1, Mlynská dolina, Bratislava',
            priceNote: 'Stránka neuvádza ceny jednotlivých jedál.',
            parse: parseDelikanti
        },
        {
            id: 'fiitfood',
            name: 'FiitFood',
            subtitle: 'Bufet na FIIT STU (FreeFood)',
            url: 'http://www.freefood.sk/menu/',
            localCopy: 'local/fiitfood.html',
            address: 'Ilkovičova 2, FIIT STU, Bratislava',
            priceNote: '',
            parse: createFreeFoodParser('fiit-food')
        }
    ];
}(MenuUtils));
