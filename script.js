document.addEventListener('DOMContentLoaded', () => {
    // === DOM REFERENCES ===
    const searchText = document.getElementById('searchText');
    const dateSelect = document.getElementById('dateSelect');
    const fetchDataButton = document.getElementById('fetchDataButton');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const sourceInputsContainer = document.getElementById('sourceInputs');
    const addSourceButton = document.getElementById('addSourceButton');
    const statsTableBody = document.getElementById('statsTableBody');
    const statsTableFoot = document.getElementById('statsTableFoot');
    const estimatedTotalMoney = document.getElementById('estimatedTotalMoney');
    const postDetailsSection = document.getElementById('postDetailsSection');
    const postDetailsSourceTitle = document.getElementById('postDetailsSourceTitle');
    const postDetailsLoadingSpinner = document.getElementById('postDetailsLoadingSpinner');
    const postDetailsTableBody = document.getElementById('postDetailsTableBody');
    const postDetailsTable = document.getElementById('postDetailsTable');
    const viewDuplicateToggle = document.getElementById('viewDuplicateToggle');
    const hideAuthorToggle = document.getElementById('hideAuthorToggle');
    const hideDuplicateToggle = document.getElementById('hideDuplicateToggle');
    const hideAuthorSphereToggle = document.getElementById('hideAuthorSphereToggle');
    const toggleHiddenSources = document.getElementById('toggleHiddenSources');


    // === GLOBAL STATE & CONSTANTS ===
    const PRICE_PER_1000_VIEWS = 30000;
    let sourceUrls = [
        { name: "Kadis+Stjernenytt", url: "https://plau.azontree.com/share/nyheder.azontree.com?auth=uKP9PAu-GhH9Dvsl_UGYF"},
       { name: "Seven", url: "https://plau.azontree.com/share/noje.azontree.com?auth=Jd3JRsX0sxMpqg55TCtN-" },
       { name: "Bỉ", url: "hhttps://plau.azontree.com/share/nieuws.azontree.com?auth=J9-b1wtBpbQ_K79Uy7asO" },
       { name: "Hà Lan", url: "https://plau.azontree.com/share/nieuwsnl.azontree.com?auth=zVRIGfqlAWqeEEasrszWM" },
       { name: "Na Uy", url: "https://plau.azontree.com/share/nyheterno.azontree.com?auth=lf8Y0Gkjd6qjomlU7d4SF" },
       { name: "Ba Lan", url: "https://plau.azontree.com/share/film.taigame.me?auth=mllPl9ouCNszgdpiRYgDq" },
    ];

    let sourceHidenUrls = [
      
        { name: "OLD - Đan Mạch", url: "https://plau.azontree.com/share/nyhederdk.azontree.com?auth=DZS13IUdD1CqkW8RBLQ4K" },
        { name: "Ba Lan 2", url: "https://plau.visaguidenow.com/share/noje.topnewsource.com?auth=aeIPd2eq15zLbkoNCVQ58" },
    ];

    
    let currentPostsData = [];
    let currentSortColumn = 'views';
    let currentSortDirection = 'desc';

    // === CÁC HÀM GỐC CỦA BẠN (ĐÃ KHÔI PHỤC 100% NGUYÊN BẢN) ===
    function extractDomainAndAuth(shareUrl) {
        try {
            const url = new URL(shareUrl);
            const pathSegments = url.pathname.split('/');
            let domain = null;
            if (pathSegments.length > 2 && pathSegments[1] === 'share') {
                domain = pathSegments[2];
            } else { return null; }
            const authParam = url.searchParams.get('auth');
            const hostname = domain.split('?')[0] || url.hostname;
            return { domain, auth: authParam, fullUrl: shareUrl, hostname: hostname };
        } catch (e) { console.error("Invalid share URL:", shareUrl, e); return null; }
    }

    function buildPlausibleApiUrl(domain, auth, text, period) {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const formattedDate = `${year}-${month}-${day}`;
        let periodParam = '';
        if (period === '28d') { periodParam = '28d'; } 
        else if (period === '7d') { periodParam = '7d'; } 
        else if (period === 'today') { periodParam = 'day'; }
        const filters = text ? encodeURIComponent(`[["contains","event:page",["${text}"]]]`) : '';
        return `https://plau.azontree.com/api/stats/${domain}/top-stats/?period=${periodParam}&date=${formattedDate}&filters=${filters}&with_imported=true&auth=${auth}`;
    }

    function getWordPressDateParams(period) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let startDate = new Date(today);
        let endDate = new Date(today);
        if (period === '7d') { startDate.setDate(today.getDate() - 6); } 
        else if (period === '28d') { startDate.setDate(today.getDate() - 27); }
        const formatToWPDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const afterDateString = formatToWPDate(startDate);
        const beforeDateString = formatToWPDate(endDate);
        return {
            after: `${afterDateString}T00:00:00`,
            before: `${beforeDateString}T23:59:59`,
            plausibleDate: `${afterDateString}${period === 'today' ? '' : `,${beforeDateString}`}`,
            plausiblePeriod: period === 'today' ? 'day' : (period === '7d' ? '7d' : '28d')
        };
    }

    async function fetchWordPressPosts(sourceHostname) {
        const dateParams = getWordPressDateParams(dateSelect.value);
        const baseUrl = `https://${sourceHostname}/wp-json/wp/v2/posts?_embed=author&per_page=100&after=${dateParams.after}&before=${dateParams.before}`;
        try {
            const response = await fetch(baseUrl);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const data = await response.json();
            return data.map(post => ({
                title: post.title.rendered,
                author: post._embedded?.author[0]?.name || 'Không rõ',
                dateISO: post.date,
                dateFormatted: new Date(post.date).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
                link: post.link,
                path: new URL(post.link).pathname
            }));
        } catch (error) { console.error("Lỗi khi fetch bài viết từ WordPress:", baseUrl, error); return []; }
    }

    async function fetchPlausiblePageViews(domain, auth, period, dateRange) {
        const apiUrl = `https://plau.azontree.com/api/stats/${domain}/pages/?period=${period}&date=${dateRange}&with_imported=true&auth=${auth}&detailed=true&limit=1000`;
        try {
            const response = await fetch(apiUrl);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const data = await response.json();
            const pageViewsMap = new Map();
            data.results.forEach(item => pageViewsMap.set(item.name, item.visitors));
            return pageViewsMap;
        } catch (error) { console.error("Lỗi khi fetch page views từ Plausible:", apiUrl, error); return new Map(); }
    }

    async function fetchStats(apiUrl) {
        try {
            const response = await fetch(apiUrl);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const data = await response.json();
            return {
                uniqueVisitors: data.top_stats.find(stat => stat.name === 'Unique visitors')?.value || 0,
                totalVisits: data.top_stats.find(stat => stat.name === 'Total visits')?.value || 0,
                totalPageviews: data.top_stats.find(stat => stat.name === 'Total pageviews')?.value || 0,
            };
        } catch (error) { console.error("Lỗi khi fetch dữ liệu từ API:", apiUrl, error); return { uniqueVisitors: 'Lỗi', totalVisits: 'Lỗi', totalPageviews: 'Lỗi' }; }
    }

    // === CÁC HÀM TÍNH NĂNG MỚI & HÀM ĐƯỢC CẢI TIẾN ===
    function normalizeTitle(title) {
        if (!title) return '';
        const tempElem = document.createElement('textarea');
        tempElem.innerHTML = title;
        let normalized = tempElem.value;
        normalized = normalized.replace(/п/g, 'n').replace(/υ/g, 'u');
        normalized = normalized.normalize('NFC');
        normalized = normalized.replace(/\s*[\-–—]\s*(News|Nieuws)$/i, '');
        normalized = normalized.trim().replace(/[\.,\s]+$/, '');
        return normalized.trim();
    }
    
    function renderPostDetailsTable(posts) {
        postDetailsTableBody.innerHTML = '';
        if (!posts || posts.length === 0) {
            postDetailsTableBody.innerHTML = `<tr><td colspan="5">Không tìm thấy bài viết nào.</td></tr>`;
            return;
        }

        const authorNameToFind = searchText.value.trim().toLowerCase();
        const isDuplicateCheckActive = viewDuplicateToggle.checked;
        const isHideAuthorActive = hideAuthorToggle.checked;
        const isHideDuplicateActive = hideDuplicateToggle.checked;
        const isHideAuthorSphereActive = hideAuthorSphereToggle.checked;

        let authorTitles = new Set();
        if (authorNameToFind) {
            posts.forEach(post => {
                if (post.author.trim().toLowerCase().includes(authorNameToFind)) {
                    authorTitles.add(normalizeTitle(post.title));
                }
            });
        }
        
        let duplicatePosts = new Set();
        const seenTitles = new Set();
        posts.forEach(post => {
            const normalizedTitle = normalizeTitle(post.title);
            if (!normalizedTitle) return;
            const isPostByAuthorGroup = authorNameToFind && post.author.trim().toLowerCase().includes(authorNameToFind);
            const isTitleInAuthorGroup = authorTitles.has(normalizedTitle);
            
            if (!isPostByAuthorGroup && (isTitleInAuthorGroup || seenTitles.has(normalizedTitle))) {
                duplicatePosts.add(post);
            }
            if (!seenTitles.has(normalizedTitle)) {
                seenTitles.add(normalizedTitle);
            }
        });
        
        const fragment = document.createDocumentFragment();
        posts.forEach(post => {
            const isPostByAuthorGroup = authorNameToFind && post.author.trim().toLowerCase().includes(authorNameToFind);
            const isTitleInAuthorGroup = authorTitles.has(normalizeTitle(post.title));
            const isPostDuplicate = duplicatePosts.has(post);
            
            let classes = [];
            if (isHideAuthorSphereActive && isTitleInAuthorGroup) classes.push('visually-hidden');
            else if (isHideAuthorActive && isPostByAuthorGroup) classes.push('visually-hidden');
            else if (isHideDuplicateActive && isPostDuplicate) classes.push('visually-hidden');
            
            if (!classes.includes('visually-hidden')) {
                if (isPostByAuthorGroup) classes.push('highlight-author');
                if (isDuplicateCheckActive && isPostDuplicate) classes.push('highlight-duplicate');
            }

            const tr = document.createElement('tr');
            tr.className = classes.join(' ');
            const escapedTitle = post.title.replace(/"/g, '&quot;');
            tr.innerHTML = `
                <td title="${escapedTitle}">${post.title}</td>
                <td>${post.author}</td>
                <td>${post.dateFormatted}</td>
                <td>${(post.views || 0).toLocaleString('vi-VN')}</td>
                <td><a href="${post.link}" target="_blank" rel="noopener noreferrer" class="open-link-button">Open Link</a></td>`;
            fragment.appendChild(tr);
        });
        postDetailsTableBody.appendChild(fragment);
    }

    function sortPosts(column, direction) {
        currentSortColumn = column;
        currentSortDirection = direction;
        currentPostsData.sort((a, b) => {
            if (column === 'title') {
                const titleA = normalizeTitle(a.title).toLowerCase();
                const titleB = normalizeTitle(b.title).toLowerCase();
                if (titleA < titleB) return direction === 'asc' ? -1 : 1;
                if (titleA > titleB) return direction === 'asc' ? 1 : -1;
                return (b.views || 0) - (a.views || 0);
            }
            if (column === 'views') return direction === 'asc' ? (a.views || 0) - (b.views || 0) : (b.views || 0) - (a.views || 0);
            if (column === 'date') return direction === 'asc' ? new Date(a.dateISO) - new Date(b.dateISO) : new Date(b.dateISO) - new Date(a.dateISO);
            return 0;
        });
        renderPostDetailsTable(currentPostsData);
        updateSortIcons();
    }
    
    function updateSortIcons() {
        document.querySelectorAll('.sortable .sort-icon').forEach(icon => {
            icon.className = 'sort-icon';
            if (icon.parentElement.dataset.sortKey === currentSortColumn) {
                icon.classList.add(`sort-${currentSortDirection}`);
            }
        });
    }

    async function displayPostDetails(sourceName, sourceHostname, sourceUrlFull) {
        postDetailsSection.style.display = 'block';
        postDetailsSourceTitle.textContent = `Bài viết từ: ${sourceName} (${sourceHostname})`;
        postDetailsLoadingSpinner.style.display = 'block';
        const domainAndAuth = extractDomainAndAuth(sourceUrlFull);
        if (!domainAndAuth) {
            postDetailsTableBody.innerHTML = `<tr><td colspan="5">URL nguồn không hợp lệ.</td></tr>`;
            postDetailsLoadingSpinner.style.display = 'none';
            return;
        }
        const dateParams = getWordPressDateParams(dateSelect.value);
        const [posts, pageViewsMap] = await Promise.all([
            fetchWordPressPosts(sourceHostname),
            fetchPlausiblePageViews(domainAndAuth.domain, domainAndAuth.auth, dateParams.plausiblePeriod, dateParams.plausibleDate)
        ]);
        postDetailsLoadingSpinner.style.display = 'none';
        currentPostsData = posts.map(post => ({ ...post, views: pageViewsMap.get(post.path) || 0 }));
        sortPosts(currentSortColumn, currentSortDirection);
    }
    
    function renderSourceInputs() {
        sourceInputsContainer.innerHTML = sourceUrls.map((source, index) => `
            <div class="source-input-group">
                <input type="text" value="${source.name}" data-index="${index}" class="source-name-input" placeholder="Tên nguồn">
                <input type="text" value="${source.url}" data-index="${index}" class="source-url-input" placeholder="URL Plausible Share">
                <button class="remove-source-button" data-index="${index}">Xóa</button>
                <button class="view-details-button" data-index="${index}">Xem chi tiết</button>
                <button class="view-plau-button" data-index="${index}">View Plau</button>
                <button class="view-wp-button" data-index="${index}">View WP</button>
            </div>`).join('');
    }

    async function fetchAndDisplayData() {
        loadingSpinner.style.display = 'block';
        statsTableBody.innerHTML = '';
        statsTableFoot.innerHTML = '';
        estimatedTotalMoney.textContent = 'Đang tính...';
        postDetailsSection.style.display = 'none';
        const textToFilter = searchText.value;
        const period = dateSelect.value;
        const allStats = await Promise.all(
            sourceUrls.map(async (source) => {
                const domainAndAuth = extractDomainAndAuth(source.url);
                if (!domainAndAuth) return { name: source.name, url: source.url, uniqueVisitors: 'Lỗi URL' };
                const stats = await fetchStats(buildPlausibleApiUrl(domainAndAuth.domain, domainAndAuth.auth, textToFilter, period));
                return { name: source.name, url: source.url, ...stats };
            })
        );
        loadingSpinner.style.display = 'none';
        let grandTotalUV = 0, grandTotalVis = 0, grandTotalPV = 0;
        statsTableBody.innerHTML = allStats.map(stat => {
            const uv = typeof stat.uniqueVisitors === 'number' ? stat.uniqueVisitors : 0;
            const vis = typeof stat.totalVisits === 'number' ? stat.totalVisits : 0;
            const pv = typeof stat.totalPageviews === 'number' ? stat.totalPageviews : 0;
            grandTotalUV += uv; grandTotalVis += vis; grandTotalPV += pv;
            return `<tr>
                <td>${stat.name}</td>
                <td><a href="${stat.url}" target="_blank" rel="noopener noreferrer">${extractDomainAndAuth(stat.url)?.hostname || 'N/A'}</a></td>
                <td>${uv.toLocaleString('vi-VN')}</td>
                <td>${vis.toLocaleString('vi-VN')}</td>
                <td>${pv.toLocaleString('vi-VN')}</td>
                <td>${((uv / 1000) * PRICE_PER_1000_VIEWS).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })}</td>
            </tr>`;
        }).join('');
        statsTableFoot.innerHTML = `<tr>
            <td colspan="2"><strong>Tổng cộng</strong></td>
            <td><strong>${grandTotalUV.toLocaleString('vi-VN')}</strong></td>
            <td><strong>${grandTotalVis.toLocaleString('vi-VN')}</strong></td>
            <td><strong>${grandTotalPV.toLocaleString('vi-VN')}</strong></td>
            <td><strong>${((grandTotalUV / 1000) * PRICE_PER_1000_VIEWS).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })}</strong></td>
        </tr>`;
        estimatedTotalMoney.textContent = ((grandTotalUV / 1000) * PRICE_PER_1000_VIEWS).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
    }

    // === EVENT LISTENERS ===
    [viewDuplicateToggle, hideAuthorToggle, hideDuplicateToggle, hideAuthorSphereToggle].forEach(toggle => {
        toggle.addEventListener('change', () => renderPostDetailsTable(currentPostsData));
    });
    searchText.addEventListener('input', () => {
        if (postDetailsSection.style.display === 'block') renderPostDetailsTable(currentPostsData);
    });
    searchText.addEventListener('change', fetchAndDisplayData);
    postDetailsTable.addEventListener('click', (event) => {
        const target = event.target.closest('th.sortable');
        if (!target) return;
        const column = target.dataset.sortKey;
        const direction = (column === currentSortColumn && currentSortDirection === 'desc') ? 'asc' : 'desc';
        sortPosts(column, direction);
    });
    sourceInputsContainer.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-index]');
        if (!button) return;
        const index = button.dataset.index;
        const source = sourceUrls[index];
        const domainAndAuth = source.url ? extractDomainAndAuth(source.url) : null;
        if (button.matches('.remove-source-button')) {
            sourceUrls.splice(index, 1);
            renderSourceInputs();
        } else if (button.matches('.view-details-button') && domainAndAuth) {
            displayPostDetails(source.name, domainAndAuth.hostname, source.url);
        } else if (button.matches('.view-plau-button') && source.url) {
            window.open(source.url, '_blank');
        } else if (button.matches('.view-wp-button') && domainAndAuth) {
            window.open(`https://${domainAndAuth.hostname}/wp-admin`, '_blank');
        }
    });
    sourceInputsContainer.addEventListener('change', (e) => {
        const input = e.target;
        if (input.dataset.index) {
            sourceUrls[input.dataset.index][input.classList.contains('source-name-input') ? 'name' : 'url'] = input.value;
        }
    });
    addSourceButton.addEventListener('click', () => {
        sourceUrls.push({ name: `Nguồn mới ${sourceUrls.length + 1}`, url: '' });
        renderSourceInputs();
    });

    toggleHiddenSources.addEventListener('change', () => {
        if (toggleHiddenSources.checked) {
            sourceUrls = [...sourceUrls, ...sourceHidenUrls];
        } else {
            sourceUrls = sourceUrls.filter(
                src => !sourceHidenUrls.some(h => h.url === src.url)
            );
        }
        renderSourceInputs();
        fetchAndDisplayData();
    });
    
    fetchDataButton.addEventListener('click', fetchAndDisplayData);
    dateSelect.addEventListener('change', fetchAndDisplayData);

    // === INITIAL RUN ===
    renderSourceInputs();
    fetchAndDisplayData();
});