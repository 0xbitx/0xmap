
(function () {
    'use strict';

    var DATA = window["0XMAP_GUIDE"];
    if (!DATA) return;

    var root = document.body.getAttribute('data-root') || '';
    var chapters = DATA.chapters || [];
    var foundations = DATA.foundations || [];
    var privesc = DATA.privesc || [];
    var entries = chapters.concat(foundations, privesc);

    function $(selector, scope) {
        return (scope || document).querySelector(selector);
    }

    function $$(selector, scope) {
        return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
    }

    function padNumber(number) {
        return String(number).padStart(2, '0');
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function isTyping(target) {
        if (!target || !target.matches) return false;
        return target.matches('input, textarea, select, [contenteditable="true"]');
    }

    function itemUrl(item) {
        if (item.href) return root + item.href;
        if (item.kind === 'foundation') return root + 'foundations/' + item.page;
        if (item.kind === 'privesc') return root + 'privesc/' + item.page;
        return root + 'chapters/' + item.page;
    }

    function itemLabel(item) {
        if (item.kind === 'foundation') {
            return 'Foundations / Part ' + padNumber(item.number);
        }
        if (item.kind === 'privesc') {
            return 'Privilege Escalation / Part ' + padNumber(item.number);
        }
        return 'Chapter ' + padNumber(item.number) + ' / ' + item.partName;
    }

    var searchModal = $('[data-search-modal]');
    var searchInput = $('[data-search-input]');
    var searchResults = $('[data-search-results]');
    var searchCount = $('[data-search-count]');
    var searchReturnFocus = null;
    var results = [];
    var activeResult = -1;
    var searchTimer = null;

    entries.forEach(function (item) {
        item._title = (item.title || '').toLowerCase();
        item._summary = (item.summary || '').toLowerCase();
        item._headings = (item.headings || []).map(function (heading) {
            return heading.text;
        }).join(' ').toLowerCase();
        item._text = (item.text || '').toLowerCase();
    });

    function countMatches(text, term) {
        var count = 0;
        var at = 0;
        while (true) {
            var found = text.indexOf(term, at);
            if (found < 0) break;
            count += 1;
            at = found + term.length;
        }
        return count;
    }

    function searchEntries(query) {
        var cleaned = query.trim().toLowerCase();
        if (!cleaned) return [];
        var terms = cleaned.split(/\s+/).filter(Boolean);
        var found = [];
        entries.forEach(function (entry) {
            var matchesAll = terms.every(function (term) {
                return entry._title.indexOf(term) >= 0 ||
                    entry._summary.indexOf(term) >= 0 ||
                    entry._headings.indexOf(term) >= 0 ||
                    entry._text.indexOf(term) >= 0;
            });
            if (!matchesAll) return;
            var score = 0;
            if (entry._title.indexOf(cleaned) >= 0) score += 90;
            terms.forEach(function (term) {
                if (entry._title.indexOf(term) >= 0) score += 26;
                if (entry._summary.indexOf(term) >= 0) score += 10;
                if (entry._headings.indexOf(term) >= 0) score += 7;
                score += Math.min(10, countMatches(entry._text, term));
            });
            found.push({ entry: entry, score: score });
        });
        found.sort(function (a, b) {
            if (b.score !== a.score) return b.score - a.score;
            return a.entry.order - b.entry.order;
        });
        return found.slice(0, 16).map(function (item) {
            return item.entry;
        });
    }

    function snippetFor(chapter, terms) {
        var text = chapter.text || '';
        var lower = text.toLowerCase();
        var at = -1;
        terms.forEach(function (term) {
            var found = lower.indexOf(term);
            if (found >= 0 && (at < 0 || found < at)) at = found;
        });
        if (at < 0) return chapter.summary || '';
        var start = Math.max(0, at - 65);
        var end = Math.min(text.length, at + 145);
        if (start > 0) {
            var startSpace = text.indexOf(' ', start);
            if (startSpace >= 0 && startSpace < at) start = startSpace + 1;
        }
        if (end < text.length) {
            var endSpace = text.lastIndexOf(' ', end);
            if (endSpace > at) end = endSpace;
        }
        return (start > 0 ? '... ' : '') +
            text.slice(start, end).trim() +
            (end < text.length ? ' ...' : '');
    }

    function highlight(value, terms) {
        var safe = escapeHtml(value);
        terms.forEach(function (term) {
            if (!term) return;
            var pattern = new RegExp(escapeRegExp(escapeHtml(term)), 'gi');
            safe = safe.replace(pattern, function (match) {
                return '<mark>' + match + '</mark>';
            });
        });
        return safe;
    }

    function renderSearch(query) {
        if (!searchResults) return;
        var cleaned = query.trim();
        results = searchEntries(cleaned);
        activeResult = results.length ? 0 : -1;
        if (!cleaned) {
            searchResults.innerHTML = '<div class="g-search-empty"><strong>Search the field guide</strong>' +
                'Try a command, a topic, a chapter or a handbook part. For example: sudo, capabilities, tcpdump, systemd, bash, or NFS.</div>';
            if (searchCount) searchCount.textContent = '';
            return;
        }
        if (!results.length) {
            searchResults.innerHTML = '<div class="g-search-empty"><strong>No matching pages found</strong>' +
                'Try a broader term or a single command name.</div>';
            if (searchCount) searchCount.textContent = '0 results';
            return;
        }
        var terms = cleaned.toLowerCase().split(/\s+/).filter(Boolean);
        var markup = results.map(function (entry, index) {
            return '<a class="g-search-result' + (index === 0 ? ' is-active' : '') + '"' +
                ' href="' + escapeHtml(itemUrl(entry)) + '" data-search-result="' + index + '">' +
                '<span class="g-search-result-top"><span>' + escapeHtml(itemLabel(entry)) +
                '</span><span>' + entry.readMinutes + ' min</span></span>' +
                '<span class="g-search-result-title">' + highlight(entry.title, terms) + '</span>' +
                '<span class="g-search-result-snippet">' + highlight(snippetFor(entry, terms), terms) +
                '</span></a>';
        }).join('');
        searchResults.innerHTML = markup;
        if (searchCount) searchCount.textContent = results.length + (results.length === 1 ? ' result' : ' results');
        bindResultHover();
    }

    function bindResultHover() {
        $$('[data-search-result]', searchResults).forEach(function (link) {
            link.addEventListener('mouseenter', function () {
                activeResult = parseInt(link.getAttribute('data-search-result'), 10);
                updateActiveResult();
            });
        });
    }

    function updateActiveResult() {
        $$('[data-search-result]', searchResults).forEach(function (link) {
            var index = parseInt(link.getAttribute('data-search-result'), 10);
            link.classList.toggle('is-active', index === activeResult);
        });
        var active = $('[data-search-result="' + activeResult + '"]', searchResults);
        if (active && active.scrollIntoView) {
            active.scrollIntoView({ block: 'nearest' });
        }
    }

    function openSearch() {
        if (!searchModal || !searchInput) return;
        searchReturnFocus = document.activeElement;
        searchModal.hidden = false;
        document.body.classList.add('g-search-open');
        searchInput.value = '';
        renderSearch('');
        window.setTimeout(function () {
            searchInput.focus();
        }, 20);
    }

    function closeSearch() {
        if (!searchModal || searchModal.hidden) return;
        searchModal.hidden = true;
        document.body.classList.remove('g-search-open');
        if (searchReturnFocus && searchReturnFocus.focus) {
            searchReturnFocus.focus();
        }
    }

    function openCurrentResult() {
        if (activeResult < 0 || !results[activeResult]) return;
        window.location.href = itemUrl(results[activeResult]);
    }

    function bindSearch() {
        $$('[data-search-open]').forEach(function (button) {
            button.addEventListener('click', openSearch);
        });
        if (!searchModal || !searchInput) return;

        $$('[data-search-close]').forEach(function (button) {
            button.addEventListener('click', closeSearch);
        });

        searchModal.addEventListener('click', function (event) {
            if (event.target === searchModal) closeSearch();
        });

        searchInput.addEventListener('input', function () {
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(function () {
                renderSearch(searchInput.value);
            }, 40);
        });

        searchInput.addEventListener('keydown', function (event) {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                if (!results.length) return;
                activeResult = (activeResult + 1) % results.length;
                updateActiveResult();
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                if (!results.length) return;
                activeResult = (activeResult - 1 + results.length) % results.length;
                updateActiveResult();
            } else if (event.key === 'Enter') {
                event.preventDefault();
                openCurrentResult();
            }
        });

        searchModal.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeSearch();
                return;
            }
            if (event.key !== 'Tab') return;
            var focusable = $$('button, input, [href]', searchModal).filter(function (element) {
                return !element.disabled && element.offsetParent !== null;
            });
            if (!focusable.length) return;
            var first = focusable[0];
            var last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });
    }

    var sidebar = $('[data-sidebar]');
    var menuButton = $('[data-menu-toggle]');

    function setMenu(open) {
        if (!sidebar) return;
        sidebar.classList.toggle('is-open', open);
        document.body.classList.toggle('g-menu-open', open);
        if (menuButton) menuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
        var backdrop = $('.g-scrim');
        if (backdrop) backdrop.hidden = !open;
    }

    function closeMenu() {
        setMenu(false);
    }

    function bindMenu() {
        if (!sidebar) return;
        if (menuButton) {
            menuButton.addEventListener('click', function () {
                setMenu(!sidebar.classList.contains('is-open'));
            });
        }
        $$('[data-menu-close]').forEach(function (button) {
            button.addEventListener('click', closeMenu);
        });
        $$('.g-nav-link', sidebar).forEach(function (link) {
            link.addEventListener('click', closeMenu);
        });
        window.addEventListener('resize', function () {
            if (window.innerWidth > 980) closeMenu();
        });
    }

    function bindToc() {
        var links = $$('[data-toc-link]');
        if (!links.length) return;
        var headingMap = {};
        links.forEach(function (link) {
            var id = link.getAttribute('href').slice(1);
            var heading = document.getElementById(id);
            if (heading) headingMap[id] = heading;
        });
        var headings = Object.keys(headingMap).map(function (id) {
            return headingMap[id];
        }).sort(function (a, b) {
            return a.offsetTop - b.offsetTop;
        });
        if (!headings.length) return;
        var scheduled = false;

        function update() {
            scheduled = false;
            var offset = 110;
            var current = headings[0];
            var atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 6;
            if (atBottom) {
                current = headings[headings.length - 1];
            } else {
                for (var index = 0; index < headings.length; index++) {
                    if (headings[index].getBoundingClientRect().top <= offset) {
                        current = headings[index];
                    } else {
                        break;
                    }
                }
            }
            links.forEach(function (link) {
                link.classList.toggle('is-active', link.getAttribute('href') === '#' + current.id);
            });
        }

        function schedule() {
            if (scheduled) return;
            scheduled = true;
            window.requestAnimationFrame(update);
        }

        window.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', schedule);
        update();
    }

    function fallbackCopy(text) {
        var area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.top = '-1000px';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        var copied = false;
        try {
            copied = document.execCommand('copy');
        } catch (error) {
            copied = false;
        }
        document.body.removeChild(area);
        return copied;
    }

    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text).then(function () {
                return true;
            }).catch(function () {
                return fallbackCopy(text);
            });
        }
        return Promise.resolve(fallbackCopy(text));
    }

    function bindCopy() {
        document.addEventListener('click', function (event) {
            var button = event.target.closest('[data-copy-code]');
            if (!button) return;
            var box = button.closest('.g-code');
            var code = box ? $('pre code', box) : null;
            if (!code) return;
            var previous = button.textContent;
            copyText(code.textContent).then(function (copied) {
                button.textContent = copied ? 'Copied' : 'Copy failed';
                button.classList.toggle('is-copied', copied);
                window.setTimeout(function () {
                    button.textContent = previous;
                    button.classList.remove('is-copied');
                }, 1400);
            });
        });
    }

    function bindShortcuts() {
        document.addEventListener('keydown', function (event) {
            var key = event.key;
            if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'k') {
                event.preventDefault();
                if (searchModal && !searchModal.hidden) closeSearch();
                else openSearch();
                return;
            }
            if (key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey &&
                !isTyping(event.target)) {
                event.preventDefault();
                openSearch();
                return;
            }
            if (key === 'Escape') {
                if (searchModal && !searchModal.hidden) {
                    closeSearch();
                } else if (sidebar && sidebar.classList.contains('is-open')) {
                    closeMenu();
                }
            }
        });
    }

    bindSearch();
    bindMenu();
    bindToc();
    bindCopy();
    bindShortcuts();
})();
