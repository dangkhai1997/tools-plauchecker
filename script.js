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

    // Đơn giá: 30,000 VNĐ cho mỗi 1000 Unique Visitors
    const PRICE_PER_1000_VIEWS = 30000;

    // Mảng chứa các URL gốc (tên miền và auth token) và tên hiển thị tương ứng
    // Lưu ý: Thứ tự các phần tử trong mảng này sẽ quyết định thứ tự hiển thị trong bảng
    let sourceUrls = [
        { name: "Kadis", url: "https://plausible.io/share/news.fusiondigest.com?f=contains,page,dk74&auth=1AYYP7u2cZzoWV7-qJEan" },
        { name: "Seven", url: "https://plausible.io/share/noje.intelnestle.com?f=contains,page,dk74&auth=sBOQdfq1Nes5jOpUf4VDm" },
        { name: "Bỉ", url: "https://plausible.io/share/sportnieuws.fusiondigest.com?f=contains,page,dk74&auth=Kpt3fmlZ0T_2kERnRcCQW" },
        { name: "Hà Lan", url: "https://plausible.io/share/nieuws.intelnestle.com?f=contains,page,dk74&auth=JfL7e0Vt5SeDsfKFocR7s" }
    ];

    // Hàm để trích xuất domain và auth token từ URL chia sẻ
    function extractDomainAndAuth(shareUrl) {
        try {
            const url = new URL(shareUrl);
            const pathSegments = url.pathname.split('/');
            let domain = null;
            if (pathSegments.length > 2 && pathSegments[1] === 'share') {
                domain = pathSegments[2];
            } else {
                console.warn("Could not extract domain from share URL path:", shareUrl);
                return null;
            }

            const authParam = url.searchParams.get('auth');
            return { domain, auth: authParam, fullUrl: shareUrl };
        } catch (e) {
            console.error("Invalid share URL:", shareUrl, e);
            return null;
        }
    }

    // Hàm để tạo URL API từ domain, auth, text và period
    function buildApiUrl(domain, auth, text, period) {
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

        return `https://plausible.io/api/stats/${domain}/top-stats/?period=${periodParam}&date=${formattedDate}&filters=${filters}&with_imported=true&comparison=previous_period&compare_from=undefined&compare_to=undefined&match_day_of_week=true&auth=${auth}`;
    }

    // Hàm hiển thị các trường input cho nguồn dữ liệu
    function renderSourceInputs() {
        sourceInputsContainer.innerHTML = '';
        sourceUrls.forEach((source, index) => {
            const div = document.createElement('div');
            div.className = 'source-input-group';
            div.innerHTML = `
                <label for="sourceName_${index}">Tên nguồn:</label>
                <input type="text" id="sourceName_${index}" value="${source.name}" data-index="${index}" class="source-name-input" placeholder="Tên nguồn">
                <label for="sourceUrl_${index}">URL nguồn (Plausible Share):</label>
                <input type="text" id="sourceUrl_${index}" value="${source.url}" data-index="${index}" class="source-url-input" placeholder="URL Plausible Share">
                <button class="remove-source-button" data-index="${index}">Xóa</button>
            `;
            sourceInputsContainer.appendChild(div);
        });

        document.querySelectorAll('.remove-source-button').forEach(button => {
            button.addEventListener('click', (event) => {
                const indexToRemove = parseInt(event.target.dataset.index);
                sourceUrls.splice(indexToRemove, 1);
                renderSourceInputs();
                fetchAndDisplayData();
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

    // Hàm fetch dữ liệu từ một URL API
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

    // Hàm chính để fetch và hiển thị dữ liệu
    async function fetchAndDisplayData() {
        loadingSpinner.style.display = 'block';
        statsTableBody.innerHTML = '';
        statsTableFoot.innerHTML = '';
        estimatedTotalMoney.textContent = 'Đang tính...';

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
                const apiUrl = buildApiUrl(domain, auth, currentSearchText, currentPeriod);
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
    dateSelect.addEventListener('change', fetchAndDisplayData);
    fetchDataButton.addEventListener('click', fetchAndDisplayData);

    // Render các input nguồn và fetch dữ liệu khi tải trang lần đầu
    renderSourceInputs();
    fetchAndDisplayData();
});