document.addEventListener('DOMContentLoaded', () => {
    const searchText = document.getElementById('searchText');
    const dateSelect = document.getElementById('dateSelect');
    const fetchDataButton = document.getElementById('fetchDataButton');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const sourceInputsContainer = document.getElementById('sourceInputs');
    const addSourceButton = document.getElementById('addSourceButton');
    const statsTableBody = document.getElementById('statsTableBody');
    const statsTableFoot = document.getElementById('statsTableFoot');
    const estimatedTotalMoney = document.getElementById('estimatedTotalMoney');

    // Elements for post details
    const postDetailsSection = document.getElementById('postDetailsSection');
    const postDetailsSourceTitle = document.getElementById('postDetailsSourceTitle');
    const postDetailsLoadingSpinner = document.getElementById('postDetailsLoadingSpinner');
    const postDetailsTableBody = document.getElementById('postDetailsTableBody');

    // Đơn giá: 30,000 VNĐ cho mỗi 1000 Unique Visitors
    const PRICE_PER_1000_VIEWS = 30000;

    // Mảng chứa các URL gốc (tên miền và auth token) và tên hiển thị tương ứng
    let sourceUrls = [
        { name: "Kadis", url: "https://plausible.io/share/news.fusiondigest.com?f=contains,page,dk74&auth=1AYYP7u2cZzoWV7-qJEan" },
        { name: "Seven", url: "https://plausible.io/share/noje.intelnestle.com?f=contains,page,dk74&auth=sBOQdfq1Nes5jOpUf4VDm" },
        { name: "Bỉ", url: "https://plausible.io/share/sportnieuws.fusiondigest.com?f=contains,page,dk74&auth=Kpt3fmlZ0T_2kERnRcCQW" },
        { name: "Hà Lan", url: "https://plausible.io/share/nieuws.intelnestle.com?f=contains,page,dk74&auth=JfL7e0Vt5SeDsfKFocR7s" }
    ];

    /**
     * Trích xuất domain và auth token từ URL chia sẻ của Plausible.
     * @param {string} shareUrl - URL chia sẻ của Plausible.
     * @returns {object|null} Đối tượng chứa domain, auth, fullUrl và hostname hoặc null nếu không hợp lệ.
     */
    function extractDomainAndAuth(shareUrl) {
        try {
            const url = new URL(shareUrl);
            const pathSegments = url.pathname.split('/');
            let domain = null;
            if (pathSegments.length > 2 && pathSegments[1] === 'share') {
                domain = pathSegments[2]; // Đây là domain của website được theo dõi bởi Plausible
            } else {
                console.warn("Could not extract domain from share URL path:", shareUrl);
                return null;
            }

            const authParam = url.searchParams.get('auth');
            const hostnameFromDomain = domain.split('?')[0];
            const hostname = hostnameFromDomain || url.hostname;

            return { domain, auth: authParam, fullUrl: shareUrl, hostname: hostname };
        } catch (e) {
            console.error("Invalid share URL:", shareUrl, e);
            return null;
        }
    }

    /**
     * Xây dựng URL API cho thống kê chính của Plausible (top-stats).
     * @param {string} domain - Tên miền của Plausible.
     * @param {string} auth - Auth token của Plausible.
     * @param {string} text - Văn bản tìm kiếm để lọc.
     * @param {string} period - Khoảng thời gian ('today', '7d', '28d').
     * @returns {string} URL API hoàn chỉnh.
     */
    function buildPlausibleApiUrl(domain, auth, text, period) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const formattedDate = `${yyyy}-${mm}-${dd}`;

        let periodParam = '';
        if (period === '28d') {
            periodParam = '28d';
        } else if (period === '7d') {
            periodParam = '7d';
        } else if (period === 'today') {
            periodParam = 'day';
        }

        const filters = encodeURIComponent(`[["contains","event:page",["${text}"]]]`);

        return `https://plausible.io/api/stats/${domain}/top-stats/?period=${periodParam}&date=${formattedDate}&filters=${filters}&with_imported=true&comparison=previous_period&compare_from=&compare_to=&match_day_of_week=true&auth=${auth}`;
    }

    /**
     * Lấy các tham số ngày tháng phù hợp cho WordPress API và Plausible /pages API.
     * @param {string} period - Khoảng thời gian được chọn ('today', '7d', '28d').
     * @returns {object} Đối tượng chứa các chuỗi ngày tháng đã định dạng.
     */
    function getWordPressDateParams(period) {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Đặt về đầu ngày để tính toán chính xác

        let startDate = new Date(today);
        let endDate = new Date(today); // Ban đầu endDate là hôm nay

        if (period === '7d') {
            startDate.setDate(today.getDate() - 6); // 7 ngày bao gồm cả hôm nay
        } else if (period === '28d') {
            startDate.setDate(today.getDate() - 27); // 28 ngày bao gồm cả hôm nay
        }
        // Nếu là 'today', startDate và endDate vẫn là hôm nay

        const formatToWPDate = (date) => {
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        };

        const afterDateString = formatToWPDate(startDate);
        const beforeDateString = formatToWPDate(endDate);

        return {
            after: `${afterDateString}T00:00:00`, // Cho WordPress: YYYY-MM-DDTHH:MM:SS
            before: `${beforeDateString}T23:59:59`, // Cho WordPress: YYYY-MM-DDTHH:MM:SS
            // Cho Plausible pages API: YYYY-MM-DD hoặc YYYY-MM-DD,YYYY-MM-DD
            plausibleDate: `${afterDateString}${period === 'today' ? '' : `,${beforeDateString}`}`,
            plausiblePeriod: period === 'today' ? 'day' : (period === '7d' ? '7d' : '28d')
        };
    }

    /**
     * Lấy chi tiết bài viết từ WordPress REST API.
     * @param {string} sourceHostname - Hostname của trang WordPress.
     * @returns {Array<object>} Mảng các đối tượng bài viết.
     */
    async function fetchWordPressPosts(sourceHostname) {
        let baseUrl;
        try {
            baseUrl = `https://${sourceHostname}/wp-json/wp/v2/posts?_embed=author`;
            baseUrl += `&per_page=10`; // Lấy 10 bài viết. Có thể tăng lên 100 nếu cần

            const dateParams = getWordPressDateParams(dateSelect.value);
            baseUrl += `&after=${dateParams.after}&before=${dateParams.before}`;

        } catch (e) {
            console.error("Could not construct WordPress API URL from hostname:", sourceHostname, e);
            return [];
        }

        console.log("Fetching WordPress posts from:", baseUrl);
        try {
            const response = await fetch(baseUrl);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! Status: ${response.status} from ${baseUrl} - ${errorText}`);
            }
            const data = await response.json();
            return data.map(post => {
                let postPath = '';
                try {
                    // Lấy pathname từ URL đầy đủ của bài viết
                    postPath = new URL(post.link).pathname;
                } catch (urlError) {
                    console.warn(`Could not parse post link for path: ${post.link}, Error: ${urlError}`);
                }
                return {
                    title: post.title.rendered,
                    author: post._embedded && post._embedded.author && post._embedded.author[0] ? post._embedded.author[0].name : 'Không rõ',
                    date: new Date(post.date).toLocaleDateString('vi-VN'),
                    link: post.link,
                    path: postPath // Trích xuất và lưu trữ path từ link của bài viết
                };
            });
        } catch (error) {
            console.error("Lỗi khi fetch bài viết từ WordPress API:", baseUrl, error);
            if (error instanceof TypeError && error.message === 'Failed to fetch') {
                console.error("Lỗi có thể do CORS policy. Đảm bảo WordPress site cho phép CORS từ nguồn này.");
            }
            return [];
        }
    }

    /**
     * Lấy dữ liệu lượt view cho các trang từ Plausible /pages API.
     * @param {string} domain - Tên miền của Plausible.
     * @param {string} auth - Auth token của Plausible.
     * @param {string} period - Khoảng thời gian ('day', '7d', '28d').
     * @param {string} dateRange - Chuỗi ngày tháng cho Plausible API (YYYY-MM-DD hoặc YYYY-MM-DD,YYYY-MM-DD).
     * @returns {Map<string, number>} Map các đường dẫn trang với số lượt visitors tương ứng.
     */
    async function fetchPlausiblePageViews(domain, auth, period, dateRange) {
        // Tham số detailed=true để lấy thêm thông tin như visitors.
        // limit=1000 để đảm bảo lấy đủ các trang phổ biến.
        let apiUrl = `https://plausible.io/api/stats/${domain}/pages/?period=${period}&date=${dateRange}&filters=%5B%5D&with_imported=true&auth=${auth}&detailed=true&order_by=%5B%5B%22visitors%22%2C%22desc%22%5D%5D&limit=1000&page=1`;

        console.log("Fetching Plausible page views from:", apiUrl);
        try {
            const response = await fetch(apiUrl);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! Status: ${response.status} from ${apiUrl} - ${errorText}`);
            }
            const data = await response.json();
            const pageViewsMap = new Map();
            // Lặp qua mảng results và lưu 'name' (path) và 'visitors' vào Map
            data.results.forEach(item => {
                pageViewsMap.set(item.name, item.visitors);
            });
            return pageViewsMap; // Trả về một Map để dễ dàng tra cứu
        } catch (error) {
            console.error("Lỗi khi fetch page views từ Plausible API:", apiUrl, error);
            return new Map(); // Trả về Map rỗng khi có lỗi
        }
    }

    /**
     * Hiển thị chi tiết bài viết và lượt view trong bảng.
     * @param {string} sourceName - Tên hiển thị của nguồn.
     * @param {string} sourceHostname - Hostname của trang WordPress.
     * @param {string} sourceUrlFull - URL chia sẻ đầy đủ của Plausible.
     */
    async function displayPostDetails(sourceName, sourceHostname, sourceUrlFull) {
        postDetailsSection.style.display = 'block';
        postDetailsSourceTitle.textContent = `Bài viết từ: ${sourceName} (${sourceHostname})`;
        postDetailsLoadingSpinner.style.display = 'block';
        postDetailsTableBody.innerHTML = '';

        const domainAndAuth = extractDomainAndAuth(sourceUrlFull);
        if (!domainAndAuth || !domainAndAuth.domain || !domainAndAuth.auth) {
            postDetailsLoadingSpinner.style.display = 'none';
            postDetailsTableBody.innerHTML = `<tr><td colspan="5">Không thể lấy thông tin Plausible từ URL nguồn để lấy lượt view. Vui lòng kiểm tra lại URL Plausible Share.</td></tr>`;
            return;
        }

        const plausibleDomain = domainAndAuth.domain;
        const plausibleAuth = domainAndAuth.auth;
        const dateParams = getWordPressDateParams(dateSelect.value);

        // Fetch cả bài viết WordPress và lượt view Plausible đồng thời
        const [posts, pageViewsMap] = await Promise.all([
            fetchWordPressPosts(sourceHostname),
            fetchPlausiblePageViews(plausibleDomain, plausibleAuth, dateParams.plausiblePeriod, dateParams.plausibleDate)
        ]);

        postDetailsLoadingSpinner.style.display = 'none';

        if (posts.length === 0) {
            postDetailsTableBody.innerHTML = `<tr><td colspan="5">Không tìm thấy bài viết nào trong khoảng thời gian đã chọn hoặc không thể kết nối đến WordPress API. Vui lòng kiểm tra console để biết chi tiết lỗi (có thể do CORS).</td></tr>`;
            return;
        }

        // Tạo một mảng mới chứa thông tin bài viết kèm lượt view để dễ dàng sắp xếp
        const postsWithViews = posts.map(post => {
            const views = pageViewsMap.get(post.path) || 0;
            return {
                ...post,
                views: views
            };
        });

        // Sắp xếp mảng postsWithViews theo lượt views giảm dần
        postsWithViews.sort((a, b) => b.views - a.views);

        postsWithViews.forEach(post => {
            const tr = document.createElement('tr');
            const viewsFormatted = typeof post.views === 'number' ? post.views.toLocaleString('vi-VN') : 'N/A';

            tr.innerHTML = `
                <td>${post.title}</td>
                <td><a href="${post.link}" target="_blank" rel="noopener noreferrer">${post.path}</a></td>
                <td>${post.author}</td>
                <td>${post.date}</td>
                <td>${viewsFormatted}</td> `; // Giữ nguyên 5 cột
            postDetailsTableBody.appendChild(tr);
        });
    }

    /**
     * Render và quản lý các trường input cho nguồn dữ liệu.
     */
    function renderSourceInputs() {
        sourceInputsContainer.innerHTML = '';
        sourceUrls.forEach((source, index) => {
            const div = document.createElement('div');
            div.className = 'source-input-group';
            div.innerHTML = `
                <input type="text" id="sourceName_${index}" value="${source.name}" data-index="${index}" class="source-name-input" placeholder="Tên nguồn">
                <input type="text" id="sourceUrl_${index}" value="${source.url}" data-index="${index}" class="source-url-input" placeholder="URL Plausible Share">
                <button class="remove-source-button" data-index="${index}">Xóa</button>
                <button class="view-details-button" data-index="${index}">Xem chi tiết</button>
                <button class="view-plau-button" data-index="${index}">View Plau</button>
                <button class="view-wp-button" data-index="${index}">View WP</button>
            `;
            sourceInputsContainer.appendChild(div);
        });

        document.querySelectorAll('.remove-source-button').forEach(button => {
            button.addEventListener('click', (event) => {
                const indexToRemove = parseInt(event.target.dataset.index);
                sourceUrls.splice(indexToRemove, 1);
                renderSourceInputs();
                fetchAndDisplayData();
                postDetailsSection.style.display = 'none';
            });
        });

        document.querySelectorAll('.view-details-button').forEach(button => {
            button.addEventListener('click', (event) => {
                const indexToView = parseInt(event.target.dataset.index);
                const source = sourceUrls[indexToView];
                const domainAndAuth = extractDomainAndAuth(source.url);
                if (domainAndAuth && domainAndAuth.hostname) {
                    // Truyền thêm source.url đầy đủ để lấy lại domain và auth cho Plausible API
                    displayPostDetails(source.name, domainAndAuth.hostname, source.url);
                } else {
                    alert('Không thể lấy hostname hoặc thông tin xác thực từ URL nguồn này để xem chi tiết bài viết. Vui lòng đảm bảo URL Plausible Share hợp lệ.');
                    postDetailsSection.style.display = 'none';
                }
            });
        });

        document.querySelectorAll('.view-plau-button').forEach(button => {
            button.addEventListener('click', (event) => {
                const index = parseInt(event.target.dataset.index);
                const sourceUrl = sourceUrls[index].url;
                if (sourceUrl) {
                    window.open(sourceUrl, '_blank');
                } else {
                    alert('URL Plausible không được điền cho nguồn này.');
                }
            });
        });

        document.querySelectorAll('.view-wp-button').forEach(button => {
            button.addEventListener('click', (event) => {
                const index = parseInt(event.target.dataset.index);
                const source = sourceUrls[index];
                const domainAndAuth = extractDomainAndAuth(source.url);
                if (domainAndAuth && domainAndAuth.hostname) {
                    const wpAdminUrl = `https://${domainAndAuth.hostname}/wp-admin`;
                    window.open(wpAdminUrl, '_blank');
                } else {
                    alert('Không thể xác định hostname WordPress từ URL nguồn Plausible Share.');
                }
            });
        });

        document.querySelectorAll('.source-name-input').forEach(input => {
            input.addEventListener('change', (event) => {
                const indexToUpdate = parseInt(event.target.dataset.index);
                sourceUrls[indexToUpdate].name = event.target.value;
            });
        });

        document.querySelectorAll('.source-url-input').forEach(input => {
            input.addEventListener('change', (event) => {
                const indexToUpdate = parseInt(event.target.dataset.index);
                sourceUrls[indexToUpdate].url = event.target.value;
            });
        });
    }

    addSourceButton.addEventListener('click', () => {
        sourceUrls.push({ name: `Nguồn mới ${sourceUrls.length + 1}`, url: '' });
        renderSourceInputs();
    });

    /**
     * Fetch dữ liệu thống kê tổng hợp từ Plausible API (top-stats).
     * @param {string} apiUrl - URL API Plausible.
     * @returns {object} Đối tượng chứa uniqueVisitors, totalVisits, totalPageviews.
     */
    async function fetchStats(apiUrl) {
        try {
            const response = await fetch(apiUrl);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! Status: ${response.status} from ${apiUrl} - ${errorText}`);
            }
            const data = await response.json();

            const uniqueVisitors = data.top_stats.find(stat => stat.name === 'Unique visitors')?.value || 0;
            const totalVisits = data.top_stats.find(stat => stat.name === 'Total visits')?.value || 0;
            const totalPageviews = data.top_stats.find(stat => stat.name === 'Total pageviews')?.value || 0;

            return {
                uniqueVisitors: typeof uniqueVisitors === 'number' ? uniqueVisitors : 0,
                totalVisits: typeof totalVisits === 'number' ? totalVisits : 0,
                totalPageviews: typeof totalPageviews === 'number' ? totalPageviews : 0
            };
        } catch (error) {
            console.error("Lỗi khi fetch dữ liệu từ API:", apiUrl, error);
            return { uniqueVisitors: 'Lỗi', totalVisits: 'Lỗi', totalPageviews: 'Lỗi' };
        }
    }

    /**
     * Hàm chính để fetch và hiển thị dữ liệu tổng hợp vào bảng chính.
     */
    async function fetchAndDisplayData() {
        loadingSpinner.style.display = 'block';
        statsTableBody.innerHTML = '';
        statsTableFoot.innerHTML = '';
        estimatedTotalMoney.textContent = 'Đang tính...';
        postDetailsSection.style.display = 'none'; // Ẩn bảng chi tiết khi tải lại dữ liệu chính

        const currentSearchText = searchText.value;
        const currentPeriod = dateSelect.value;

        let grandTotalUV = 0;
        let grandTotalVis = 0;
        let grandTotalPV = 0;

        const apiPromises = [];
        const sourceDetails = [];

        for (const source of sourceUrls) {
            const domainAndAuth = extractDomainAndAuth(source.url);
            if (domainAndAuth && domainAndAuth.domain && domainAndAuth.auth) {
                const { domain, auth, fullUrl } = domainAndAuth;
                sourceDetails.push({ name: source.name, domain: domain, fullUrl: fullUrl });
                const apiUrl = buildPlausibleApiUrl(domain, auth, currentSearchText, currentPeriod);
                apiPromises.push(fetchStats(apiUrl));
            } else {
                console.warn(`Bỏ qua URL nguồn không hợp lệ hoặc thiếu thông tin: ${source.url}`);
                sourceDetails.push({ name: source.name, domain: 'N/A', fullUrl: source.url });
                apiPromises.push(Promise.resolve({ uniqueVisitors: 'Lỗi URL', totalVisits: 'Lỗi URL', totalPageviews: 'Lỗi URL' }));
            }
        }

        try {
            const allResults = await Promise.all(apiPromises);

            allResults.forEach((result, index) => {
                const tr = document.createElement('tr');
                const sourceDetail = sourceDetails[index];

                const uniqueVisitorsValue = typeof result.uniqueVisitors === 'number' ? result.uniqueVisitors.toLocaleString('vi-VN') : result.uniqueVisitors;
                const totalVisitsValue = typeof result.totalVisits === 'number' ? result.totalVisits.toLocaleString('vi-VN') : result.totalVisits;
                const totalPageviewsValue = typeof result.totalPageviews === 'number' ? result.totalPageviews.toLocaleString('vi-VN') : result.totalPageviews;

                // Tính toán tổng tiền cho từng page
                let pageEstimatedMoney = 'N/A';
                if (typeof result.uniqueVisitors === 'number') {
                    pageEstimatedMoney = (result.uniqueVisitors / 1000) * PRICE_PER_1000_VIEWS;
                    pageEstimatedMoney = pageEstimatedMoney.toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
                }

                let displayUrl = '';
                if (sourceDetail.domain && sourceDetail.domain !== 'N/A') {
                    displayUrl = sourceDetail.domain;
                } else if (sourceDetail.fullUrl && sourceDetail.fullUrl !== '') {
                    try {
                        const tempUrl = new URL(sourceDetail.fullUrl);
                        displayUrl = tempUrl.hostname;
                    } catch (e) {
                        displayUrl = 'URL không hợp lệ';
                    }
                }

                tr.innerHTML = `
                    <td>${sourceDetail.name}</td>
                    <td><a href="${sourceDetail.fullUrl}" target="_blank" rel="noopener noreferrer">${displayUrl}</a></td>
                    <td>${uniqueVisitorsValue}</td>
                    <td>${totalVisitsValue}</td>
                    <td>${totalPageviewsValue}</td>
                    <td>${pageEstimatedMoney}</td> `;
                statsTableBody.appendChild(tr);

                if (typeof result.uniqueVisitors === 'number') grandTotalUV += result.uniqueVisitors;
                if (typeof result.totalVisits === 'number') grandTotalVis += result.totalVisits;
                if (typeof result.totalPageviews === 'number') grandTotalPV += result.totalPageviews;
            });

            // Tạo hàng tổng cộng
            const totalRow = document.createElement('tr');
            totalRow.innerHTML = `
                <td colspan="2"><strong>Tổng cộng</strong></td>
                <td><strong>${grandTotalUV.toLocaleString('vi-VN')}</strong></td>
                <td><strong>${grandTotalVis.toLocaleString('vi-VN')}</strong></td>
                <td><strong>${grandTotalPV.toLocaleString('vi-VN')}</strong></td>
                <td><strong>${((grandTotalUV / 1000) * PRICE_PER_1000_VIEWS).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })}</strong></td>
            `;
            statsTableFoot.appendChild(totalRow);

            // Tính và hiển thị tổng tiền chung
            const estimatedMoney = (grandTotalUV / 1000) * PRICE_PER_1000_VIEWS;
            estimatedTotalMoney.textContent = estimatedMoney.toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });


        } catch (error) {
            console.error("Lỗi tổng hợp khi fetch tất cả API:", error);
            statsTableBody.innerHTML = `<tr><td colspan="6">Không thể tải dữ liệu. Vui lòng kiểm tra Console để biết chi tiết lỗi.</td></tr>`;
            statsTableFoot.innerHTML = '';
            estimatedTotalMoney.textContent = 'Lỗi!';
        } finally {
            loadingSpinner.style.display = 'none';
        }
    }

    // Gắn sự kiện cho các thay đổi
    searchText.addEventListener('change', fetchAndDisplayData);
    dateSelect.addEventListener('change', () => {
        fetchAndDisplayData();
        postDetailsSection.style.display = 'none'; // Ẩn bảng chi tiết khi thay đổi khoảng thời gian
    });
    fetchDataButton.addEventListener('click', fetchAndDisplayData);

    // Render các input nguồn và fetch dữ liệu khi tải trang lần đầu
    renderSourceInputs();
    fetchAndDisplayData();
});