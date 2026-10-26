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
     * Reštaurácia DRAG – každý deň je div.tab-pane s id podľa dňa (#pondelok … #piatok).
     * Polievka je voľný text medzi nadpismi „POLIEVKA“ a „HLAVNÉ JEDLO“,
     * hlavné jedlá sú v tabuľke: prvá bunka názov, bunka td.text-right cena.
     * --------------------------------------------------------------- */
    const DRAG_DAYS = ['pondelok', 'utorok', 'streda', 'stvrtok', 'piatok'];

    function parseDrag(doc, restaurantId) {
        const panes = DRAG_DAYS.map((id) => doc.getElementById(id)).filter(Boolean);
        if (panes.length === 0) {
            throw new U.StructureError('Na stránke sa nenašli záložky dní (div.tab-pane#pondelok …).');
        }

        const items = [];
        panes.forEach((pane) => {
            const dayIndex = U.dayIndexFromName(pane.querySelector('h2')?.textContent || pane.id);
            if (!dayIndex) {
                return;
            }

            const soup = dragSoupText(pane);
            if (soup) {
                const { text: withoutAllergens, allergens } = U.extractAllergens(soup);
                const { text: name, weight } = U.extractWeight(withoutAllergens);
                if (name) {
                    items.push(U.createItem({
                        restaurantId, dayIndex, date: null,
                        type: 'polievka', label: 'Polievka',
                        name, weight, price: null, allergens
                    }));
                }
            }

            pane.querySelectorAll('table tr').forEach((row, index) => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 2) {
                    return;
                }
                const text = U.clean(cells[0].textContent);
                if (!text) {
                    return;
                }
                const { text: withoutAllergens, allergens } = U.extractAllergens(text);
                const { text: name, weight } = U.extractWeight(withoutAllergens);
                items.push(U.createItem({
                    restaurantId, dayIndex, date: null,
                    type: 'hlavne', label: `Menu ${index + 1}`,
                    name, weight,
                    price: U.parsePrice(row.querySelector('td.text-right')?.textContent || ''),
                    allergens
                }));
            });
        });
        return items;
    }

    /** Text polievky = uzly medzi blokom s nadpisom „POLIEVKA“ a blokom „HLAVNÉ JEDLO“. */
    function dragSoupText(pane) {
        const titles = Array.from(pane.querySelectorAll('.menu_box_title'));
        const soupTitle = titles.find((el) => U.normalize(el.textContent).includes('polievka'));
        if (!soupTitle) {
            return '';
        }
        let text = '';
        for (let node = soupTitle.nextSibling; node; node = node.nextSibling) {
            if (node.nodeType === Node.ELEMENT_NODE &&
                (node.classList.contains('menu_box_title') || node.tagName === 'TABLE')) {
                break;
            }
            text += ` ${node.textContent}`;
        }
        return U.clean(text);
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
            id: 'drag',
            name: 'Reštaurácia DRAG',
            subtitle: 'Reštaurácia pri internátoch Mlyny',
            url: 'https://www.restauracia-drag.sk/denne-menu',
            localCopy: 'local/drag.html',
            address: 'Staré Grunty 64, Bratislava',
            priceNote: 'Cena menu je vrátane polievky.',
            parse: parseDrag
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
