/**
 * Hlavná logika stránky – stav, ovládanie a vykresľovanie menu (jQuery).
 * Všetok text sa vkladá cez .text() / atribúty, nikdy nie ako HTML z cudzej stránky.
 */
$(function () {
    'use strict';

    const U = MenuUtils;
    const today = new Date();
    const todayIso = U.toIsoDate(today);
    const todayDay = U.isoDay(today);
    const isWeekend = todayDay > 5;
    const weekMonday = U.mondayOf(today);

    const GROUPS = [
        { title: 'Polievky', icon: 'bi-cup-hot', types: ['polievka'] },
        { title: 'Hlavné jedlá', icon: 'bi-egg-fried', types: ['hlavne', 'vegetarianske'] },
        { title: 'Ďalšia ponuka', icon: 'bi-basket', types: ['dezert', 'salat', 'ine'] }
    ];

    const settings = MenuStorage.loadSettings();
    const state = {
        source: settings.source || (APP_CONFIG.proxyUrl ? 'live' : 'local'),
        hidden: new Set(settings.hidden),
        view: isWeekend ? 1 : todayDay,
        entries: {},
        loading: new Set()
    };

    const $grid = $('#restaurantGrid');
    const $refreshBtn = $('#btnRefresh');

    /* ------------------------------------------------------------ */
    /* Inicializácia                                                 */
    /* ------------------------------------------------------------ */

    function init() {
        $('#dnesnyDatum')
            .attr('datetime', todayIso)
            .text(`${U.DAY_NAMES[todayDay].toLocaleLowerCase('sk')} ${today.getDate()}. ${today.getMonth() + 1}. ${today.getFullYear()}`);

        initDayTabs();
        initFilter();
        initSourceSwitch();
        buildCards();

        if (isWeekend) {
            showStatus('info', 'bi-moon-stars',
                'Dnes je víkend – denné menu nie je k dispozícii. Zobrazujeme menu na pondelok aktuálneho týždňa.');
        }

        $refreshBtn.on('click', () => loadAll(true));
        $('#btnClear').on('click', clearStoredData);

        updateView();
        loadAll(false);
    }

    function initDayTabs() {
        $('#dayTabs .day-tab').each(function () {
            const $btn = $(this);
            const day = $btn.data('day');
            if (day === 'week') {
                return;
            }
            const date = U.dateOfWeekday(today, Number(day));
            $btn.find('.d-date').text(U.formatShortDate(date));
            if (Number(day) === todayDay) {
                $btn.addClass('is-today').attr('title', 'Dnes');
            }
        });

        $('#dayTabs').on('click', '.day-tab', function () {
            const day = $(this).data('day');
            state.view = day === 'week' ? 'week' : Number(day);
            updateView();
        });
    }

    function initFilter() {
        const $filter = $('#restaurantFilter');
        RESTAURANTS.forEach((r) => {
            const inputId = `filter-${r.id}`;
            const $input = $('<input>', {
                type: 'checkbox',
                class: 'btn-check',
                id: inputId,
                value: r.id
            }).prop('checked', !state.hidden.has(r.id));
            const $label = $('<label>', { class: 'filter-chip', for: inputId })
                .append($('<span>', { class: 'bi bi-check2 chip-check', 'aria-hidden': 'true' }))
                .append(document.createTextNode(r.name));
            $filter.append($input, $label);
        });

        $filter.on('change', 'input', function () {
            if (this.checked) {
                state.hidden.delete(this.value);
            } else {
                state.hidden.add(this.value);
            }
            persistSettings();
            applyFilter();
        });
    }

    function initSourceSwitch() {
        $(`input[name="zdroj"][value="${state.source}"]`).prop('checked', true);
        $('input[name="zdroj"]').on('change', function () {
            state.source = this.value;
            persistSettings();
            loadAll(false);
        });
    }

    function persistSettings() {
        MenuStorage.saveSettings({ source: state.source, hidden: Array.from(state.hidden) });
    }

    /* ------------------------------------------------------------ */
    /* Načítanie dát                                                 */
    /* ------------------------------------------------------------ */

    /**
     * Načíta všetky reštaurácie. Ak force === false a v localStorage sú dáta z dnešného dňa,
     * stránka reštaurácie sa nenačítava znova.
     */
    async function loadAll(force) {
        const jobs = [];
        RESTAURANTS.forEach((r) => {
            const cached = MenuStorage.getEntry(state.source, r.id);
            if (!force && MenuStorage.isFromToday(cached, todayIso)) {
                state.entries[r.id] = cached;
                renderCard(r);
            } else {
                state.entries[r.id] = cached;
                jobs.push(loadOne(r));
            }
        });

        if (jobs.length === 0) {
            return;
        }

        setRefreshing(true);
        const results = await Promise.allSettled(jobs);
        setRefreshing(false);

        const ok = results.filter((res) => res.status === 'fulfilled' && res.value).length;
        if (ok === jobs.length) {
            showToast(`Menu bolo aktualizované (${ok} z ${jobs.length}).`, 'success');
        } else {
            showToast(`Podarilo sa načítať ${ok} z ${jobs.length} reštaurácií. Podrobnosti sú pri jednotlivých kartách.`, 'warning');
        }
    }

    /** Načíta jednu reštauráciu; chyba neovplyvní ostatné. Vracia true pri úspechu. */
    async function loadOne(restaurant) {
        state.loading.add(restaurant.id);
        renderCard(restaurant);

        const previous = state.entries[restaurant.id];
        const now = new Date().toISOString();
        let entry;
        let success = false;

        try {
            const items = await MenuLoader.loadRestaurant(restaurant, state.source);
            entry = { status: 'ok', items, updatedAt: now, fetchedOn: todayIso, error: null, lastSuccessAt: now };
            success = true;
        } catch (error) {
            entry = {
                status: 'error',
                items: previous?.items || [],
                updatedAt: now,
                fetchedOn: todayIso,
                error: MenuLoader.describeError(error),
                lastSuccessAt: previous?.lastSuccessAt || null
            };
        }

        MenuStorage.saveEntry(state.source, restaurant.id, entry);
        state.entries[restaurant.id] = entry;
        state.loading.delete(restaurant.id);
        renderCard(restaurant);
        return success;
    }

    function setRefreshing(isLoading) {
        $refreshBtn.prop('disabled', isLoading).attr('aria-busy', String(isLoading));
        $refreshBtn.find('.spinner-border').toggleClass('d-none', !isLoading);
        $refreshBtn.find('.btn-icon').toggleClass('d-none', isLoading);
        $refreshBtn.find('.btn-text').text(isLoading ? 'Načítavam…' : 'Aktualizovať menu');
    }

    function clearStoredData() {
        MenuStorage.clearData();
        state.entries = {};
        RESTAURANTS.forEach(renderCard);
        showToast('Uložené dáta boli vymazané. Nové menu načítate tlačidlom „Aktualizovať menu“.', 'info');
    }

    /* ------------------------------------------------------------ */
    /* Vykresľovanie                                                 */
    /* ------------------------------------------------------------ */

    function buildCards() {
        RESTAURANTS.forEach((r) => {
            const $card = $('<article>', { class: 'restaurant-card', 'data-id': r.id, 'aria-busy': 'false' });

            const $header = $('<header>', { class: 'rc-header' });
            $header.append($('<h3>', { class: 'rc-name', text: r.name }));
            $header.append($('<p>', { class: 'rc-subtitle', text: r.subtitle }));

            const $info = $('<ul>', { class: 'rc-info' });
            $info.append($('<li>')
                .append($('<span>', { class: 'bi bi-geo-alt', 'aria-hidden': 'true' }))
                .append($('<address>', { text: r.address })));
            $info.append($('<li>')
                .append($('<span>', { class: 'bi bi-box-arrow-up-right', 'aria-hidden': 'true' }))
                .append($('<a>', { href: r.url, target: '_blank', rel: 'noopener', text: 'Pôvodná stránka reštaurácie' })));
            $header.append($info);

            $header.append($('<p>', { class: 'rc-updated' }));

            $card.append($header, $('<div>', { class: 'rc-body' }));
            $grid.append($card);
        });
        applyFilter();
    }

    function renderCard(restaurant) {
        const $card = $grid.find(`[data-id="${restaurant.id}"]`);
        const entry = state.entries[restaurant.id];
        const isLoading = state.loading.has(restaurant.id);
        const $body = $card.find('.rc-body').empty();

        $card.toggleClass('is-loading', isLoading).attr('aria-busy', String(isLoading));
        renderUpdated($card.find('.rc-updated'), entry);

        if (isLoading) {
            $body.append($('<div>', { class: 'rc-loading', role: 'status' })
                .append($('<span>', { class: 'spinner-border text-success', 'aria-hidden': 'true' }))
                .append($('<span>', { text: 'Načítavam menu…' })));
        }

        if (!entry) {
            if (!isLoading) {
                $body.append(notice('secondary', 'bi-inbox', 'Žiadne uložené dáta. Kliknite na „Aktualizovať menu“.'));
            }
            return;
        }

        if (entry.status === 'error') {
            const hasOld = entry.items.length > 0;
            const text = hasOld
                ? `${entry.error} Zobrazujeme naposledy úspešne načítané menu.`
                : entry.error;
            $body.append(notice(hasOld ? 'warning' : 'danger', 'bi-exclamation-triangle', text));
        }

        if (entry.items.length === 0) {
            return;
        }

        const weekWarning = otherWeekWarning(entry.items);
        if (weekWarning) {
            $body.append(notice('warning', 'bi-calendar-x', weekWarning));
        }
        if (restaurant.priceNote) {
            $body.append($('<p>', { class: 'rc-price-note', text: restaurant.priceNote }));
        }

        if (state.view === 'week') {
            for (let day = 1; day <= 5; day += 1) {
                $body.append(renderDay(entry.items, day, true));
            }
        } else {
            $body.append(renderDay(entry.items, state.view, false));
        }
    }

    function renderUpdated($el, entry) {
        $el.empty();
        $el.append($('<span>', { class: 'bi bi-clock-history', 'aria-hidden': 'true' }));
        if (!entry) {
            $el.append(document.createTextNode(' Zatiaľ neaktualizované'));
            return;
        }
        $el.append(document.createTextNode(' Posledná aktualizácia: '));
        $el.append($('<time>', { datetime: entry.updatedAt, text: U.formatDateTime(entry.updatedAt) }));
        const sourceText = state.source === 'live' ? 'živá stránka' : 'lokálna kópia';
        $el.append($('<span>', { class: `rc-source rc-source-${state.source}`, text: sourceText }));
    }

    /** Vykreslí menu jedného dňa (pre denný aj týždenný pohľad). */
    function renderDay(allItems, day, withHeading) {
        const items = allItems.filter((it) => it.dayIndex === day);
        const $section = $('<section>', { class: withHeading ? 'rc-day rc-day-week' : 'rc-day' });

        const dateIso = items.find((it) => it.date)?.date || U.toIsoDate(U.dateOfWeekday(today, day));
        const dateObj = new Date(`${dateIso}T12:00:00`);
        const $heading = $('<h4>', { class: 'rc-day-title' })
            .append(document.createTextNode(`${U.DAY_NAMES[day]} `))
            .append($('<time>', { datetime: dateIso, text: U.formatShortDate(dateObj) }));
        if (day === todayDay) {
            $heading.append($('<span>', { class: 'today-badge', text: 'dnes' }));
        }
        $section.append($heading);

        if (items.length === 0) {
            $section.append(notice('light', 'bi-calendar-x', 'Menu na tento deň nie je k dispozícii.'));
            return $section;
        }

        GROUPS.forEach((group) => {
            const groupItems = items.filter((it) => group.types.includes(it.type));
            if (groupItems.length === 0) {
                return;
            }
            const $group = $('<div>', { class: 'menu-group' });
            $group.append($('<h5>', { class: 'menu-group-title' })
                .append($('<span>', { class: `bi ${group.icon}`, 'aria-hidden': 'true' }))
                .append(document.createTextNode(` ${group.title}`)));
            const $list = $('<ul>', { class: 'menu-list' });
            groupItems.forEach((it) => $list.append(renderItem(it)));
            $group.append($list);
            $section.append($group);
        });
        return $section;
    }

    function renderItem(item) {
        const $li = $('<li>', { class: `menu-item type-${item.type}` });
        const $main = $('<div>', { class: 'mi-main' });

        const $top = $('<div>', { class: 'mi-top' });
        $top.append($('<span>', { class: 'mi-type', text: item.label || U.ITEM_TYPES[item.type] }));
        if (item.vegetarian) {
            $top.append($('<span>', { class: 'mi-veg', title: 'Vegetariánske jedlo' })
                .append($('<span>', { class: 'bi bi-flower1', 'aria-hidden': 'true' }))
                .append(document.createTextNode(' vege')));
        }
        $main.append($top);
        $main.append($('<p>', { class: 'mi-name', text: item.name }));

        const $meta = $('<p>', { class: 'mi-meta' });
        if (item.weight) {
            $meta.append($('<span>', { class: 'mi-weight', title: 'Hmotnosť / objem' })
                .append($('<span>', { class: 'bi bi-speedometer2', 'aria-hidden': 'true' }))
                .append(document.createTextNode(` ${item.weight}`)));
        }
        if (item.allergens.length) {
            $meta.append($('<span>', { class: 'mi-allergens', title: 'Alergény' })
                .append($('<span>', { class: 'bi bi-exclamation-diamond', 'aria-hidden': 'true' }))
                .append(document.createTextNode(` Alergény: ${item.allergens.join(', ')}`)));
        }
        if ($meta.children().length) {
            $main.append($meta);
        }

        const $price = $('<div>', { class: 'mi-price' });
        if (item.price !== null) {
            $price.append($('<span>', { class: 'price-main', text: U.formatPrice(item.price) }));
            if (item.priceStudent !== null && item.priceStudent !== item.price) {
                $price.append($('<span>', { class: 'price-student', text: `študent ${U.formatPrice(item.priceStudent)}` }));
            }
        } else {
            $price.append($('<span>', { class: 'price-none', text: 'cena neuvedená' }));
        }

        return $li.append($main, $price);
    }

    /** Upozornenie, ak dátumy v menu nepatria do aktuálneho týždňa. */
    function otherWeekWarning(items) {
        const dates = items.map((it) => it.date).filter(Boolean).sort();
        if (dates.length === 0) {
            return null;
        }
        const first = new Date(`${dates[0]}T12:00:00`);
        if (U.toIsoDate(U.mondayOf(first)) === U.toIsoDate(weekMonday)) {
            return null;
        }
        return `Menu na stránke nie je z aktuálneho týždňa (začína ${U.formatShortDate(first)} ${first.getFullYear()}).`;
    }

    function notice(variant, icon, text) {
        return $('<div>', { class: `rc-notice rc-notice-${variant}` })
            .append($('<span>', { class: `bi ${icon}`, 'aria-hidden': 'true' }))
            .append($('<span>', { text }));
    }

    /* ------------------------------------------------------------ */
    /* Prepínanie dní a filtrovanie (bez opätovného načítania stránky) */
    /* ------------------------------------------------------------ */

    function updateView() {
        $('#dayTabs .day-tab').each(function () {
            const day = $(this).data('day');
            const active = day === 'week' ? state.view === 'week' : Number(day) === state.view;
            $(this).toggleClass('active', active).attr('aria-pressed', String(active));
        });

        const heading = state.view === 'week'
            ? 'Menu na celý týždeň'
            : `Menu – ${U.DAY_NAMES[state.view].toLocaleLowerCase('sk')} ${U.formatShortDate(U.dateOfWeekday(today, state.view))}`;
        $('#menuNadpis').text(heading);
        $grid.toggleClass('is-week', state.view === 'week');

        RESTAURANTS.forEach(renderCard);
    }

    function applyFilter() {
        let visible = 0;
        RESTAURANTS.forEach((r) => {
            const hidden = state.hidden.has(r.id);
            $grid.find(`[data-id="${r.id}"]`).toggleClass('d-none', hidden);
            if (!hidden) {
                visible += 1;
            }
        });
        $('#emptyFilter').toggleClass('d-none', visible > 0);
    }

    /* ------------------------------------------------------------ */
    /* Hlásenia                                                      */
    /* ------------------------------------------------------------ */

    function showStatus(variant, icon, text) {
        $('#globalStatus').empty().append(
            $('<div>', { class: `global-alert global-alert-${variant}` })
                .append($('<span>', { class: `bi ${icon}`, 'aria-hidden': 'true' }))
                .append($('<span>', { text }))
        );
    }

    function showToast(text, variant) {
        const icons = { success: 'bi-check-circle-fill', warning: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' };
        $('#appToastText').text(text);
        $('#appToast')
            .removeClass('toast-success toast-warning toast-info')
            .addClass(`toast-${variant}`)
            .find('.toast-icon')
            .attr('class', `bi ${icons[variant] || icons.info} toast-icon`);
        bootstrap.Toast.getOrCreateInstance(document.getElementById('appToast')).show();
    }

    init();
});
