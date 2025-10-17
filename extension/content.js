// MedScope Content Script - 在 PubMed 页面注入期刊信息
(function() {
    'use strict';

    let journalData = {};
    let filterSettings = {
        minIF: 0,
        maxIF: 999,
        quartiles: ['Q1', 'Q2', 'Q3', 'Q4'],
        enabled: true
    };
    let sortSettings = {
        sortBy: 'default', // default, if-desc, if-asc, quartile
        enabled: false
    };

    // 加载期刊数据
    async function loadJournalData() {
        try {
            const response = await fetch(chrome.runtime.getURL('journal_data.json'));
            const data = await response.json();
            
            // 将数据转换为以期刊名为键的对象，方便查找
            data.forEach(journal => {
                const name = journal['Journal Name'];
                const abbr = journal['Abbreviated Journal'];
                
                if (name) {
                    journalData[name.toLowerCase()] = journal;
                }
                if (abbr && abbr !== name) {
                    journalData[abbr.toLowerCase()] = journal;
                }
            });
            
            console.log('MedScope: 加载了', Object.keys(journalData).length, '条期刊数据');
            return true;
        } catch (error) {
            console.error('MedScope: 加载期刊数据失败', error);
            return false;
        }
    }

    // 从 storage 加载筛选设置
    async function loadFilterSettings() {
        try {
            const result = await chrome.storage.sync.get(['filterSettings', 'sortSettings']);
            if (result.filterSettings) {
                filterSettings = result.filterSettings;
            }
            if (result.sortSettings) {
                sortSettings = result.sortSettings;
            }
        } catch (error) {
            console.error('MedScope: 加载筛选设置失败', error);
        }
    }

    // 获取期刊信息
    function getJournalInfo(journalName) {
        if (!journalName) return null;
        
        const normalized = journalName.toLowerCase().trim();
        return journalData[normalized] || null;
    }

    // 检查期刊是否符合筛选条件
    function matchesFilter(journal) {
        if (!filterSettings.enabled) return true;
        
        const jif = parseFloat(journal['JIF 2024']);
        if (isNaN(jif)) return true;
        
        if (jif < filterSettings.minIF || jif > filterSettings.maxIF) {
            return false;
        }
        
        const quartile = journal['JIF Quartile'];
        if (quartile && !filterSettings.quartiles.includes(quartile)) {
            return false;
        }
        
        return true;
    }

    // 创建信息标签
    function createInfoBadge(journal) {
        const jif = journal['JIF 2024'];
        const jif5 = journal['5-Year JIF'];
        const quartile = journal['JIF Quartile'];
        const rank = journal['JIF Rank'];
        
        const badge = document.createElement('span');
        badge.className = 'medscope-badge';
        
        let html = '';
        
        if (jif) {
            const jifValue = parseFloat(jif);
            let ifClass = 'if-low';
            if (jifValue >= 10) ifClass = 'if-high';
            else if (jifValue >= 5) ifClass = 'if-medium';
            
            html += `<span class="medscope-if ${ifClass}" title="影响因子 2024">IF: ${jif}</span>`;
        }
        
        if (quartile) {
            const qClass = quartile.toLowerCase();
            html += `<span class="medscope-quartile ${qClass}" title="JCR 分区">${quartile}</span>`;
        }
        
        if (jif5) {
            html += `<span class="medscope-info" title="5年影响因子">5Y: ${jif5}</span>`;
        }
        
        if (rank) {
            html += `<span class="medscope-info" title="排名">Rank: ${rank}</span>`;
        }
        
        badge.innerHTML = html;
        return badge;
    }

    // 创建筛选面板
    function createFilterPanel() {
        // 检查是否已经存在
        if (document.querySelector('.medscope-filter-panel')) return;
        
        const panel = document.createElement('div');
        panel.className = 'medscope-filter-panel';
        panel.innerHTML = `
            <div class="medscope-panel-content">
                <div class="medscope-tabs">
                    <button class="medscope-tab-btn active" data-tab="filter">
                        <span class="medscope-tab-icon">▼</span>
                        按条件筛选
                    </button>
                    <button class="medscope-tab-btn" data-tab="sort">
                        <span class="medscope-tab-icon">⇅</span>
                        按分数排序
                    </button>
                </div>
            
            <div class="medscope-tab-content active" id="medscope-filter-tab">
                <div class="medscope-form-group">
                    <label>最小值：</label>
                    <input type="number" id="medscope-min-if" min="0" max="200" step="0.1" value="0" class="medscope-number-input">
                </div>
                
                <div class="medscope-form-group">
                    <label>最大值：</label>
                    <input type="number" id="medscope-max-if" min="0" max="200" step="0.1" value="200" class="medscope-number-input">
                </div>
                
                <div class="medscope-form-group">
                    <div class="medscope-quartile-grid">
                        <label class="medscope-checkbox">
                            <input type="checkbox" value="Q1" checked>
                            <span>Q1</span>
                        </label>
                        <label class="medscope-checkbox">
                            <input type="checkbox" value="Q2" checked>
                            <span>Q2</span>
                        </label>
                        <label class="medscope-checkbox">
                            <input type="checkbox" value="Q3" checked>
                            <span>Q3</span>
                        </label>
                        <label class="medscope-checkbox">
                            <input type="checkbox" value="Q4" checked>
                            <span>Q4</span>
                        </label>
                    </div>
                </div>
                
                <div class="medscope-form-group">
                    <label class="medscope-checkbox">
                        <input type="checkbox" id="medscope-always-on" checked>
                        <span>始终开启筛选器</span>
                    </label>
                    <div class="medscope-help-text">勾选后记住筛选条件，刷新页面仍保持</div>
                </div>
                
                <div class="medscope-button-group">
                    <button id="medscope-apply-filter" class="medscope-btn-primary">应用筛选器</button>
                    <button id="medscope-close-filter" class="medscope-btn-secondary">关闭筛选器</button>
                </div>
                
                <div class="medscope-stats">
                    显示 <span id="medscope-match-count">-</span> 篇文章
                </div>
            </div>
            
            <div class="medscope-tab-content" id="medscope-sort-tab">
                <div class="medscope-form-group">
                    <label>排序方式：</label>
                    <select id="medscope-sort-select" class="medscope-select">
                        <option value="default">默认顺序</option>
                        <option value="if-desc">影响因子 (高→低)</option>
                        <option value="if-asc">影响因子 (低→高)</option>
                        <option value="quartile">分区 (Q1→Q4)</option>
                    </select>
                </div>
                
                <div class="medscope-button-group">
                    <button id="medscope-apply-sort" class="medscope-btn-primary">应用排序</button>
                    <button id="medscope-reset-sort" class="medscope-btn-secondary">恢复默认</button>
                </div>
                
                <div class="medscope-info-box">
                    <p><strong>💡 提示：</strong></p>
                    <p>• 排序会重新排列搜索结果</p>
                    <p>• 先筛选再排序效果更好</p>
                </div>
            </div>
            </div>
        `;
        
        document.body.appendChild(panel);
        
        // 创建独立的切换按钮
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'medscope-toggle-btn';
        toggleBtn.id = 'medscope-toggle-btn';
        toggleBtn.title = '收起/展开';
        toggleBtn.textContent = '◀';
        document.body.appendChild(toggleBtn);
        
        initFilterPanelEvents();
    }
    
    // 初始化筛选面板事件
    function initFilterPanelEvents() {
        // 收起/展开按钮
        const toggleBtn = document.getElementById('medscope-toggle-btn');
        const panel = document.querySelector('.medscope-filter-panel');
        
        toggleBtn.addEventListener('click', () => {
            panel.classList.toggle('collapsed');
            toggleBtn.classList.toggle('panel-collapsed');
            
            if (panel.classList.contains('collapsed')) {
                toggleBtn.textContent = '▶';
                toggleBtn.title = '展开筛选面板';
            } else {
                toggleBtn.textContent = '◀';
                toggleBtn.title = '收起筛选面板';
            }
        });
        
        // 标签页切换
        document.querySelectorAll('.medscope-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                
                document.querySelectorAll('.medscope-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                document.querySelectorAll('.medscope-tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                document.getElementById(`medscope-${tabName}-tab`).classList.add('active');
            });
        });
        
        // 筛选按钮
        const applyBtn = document.getElementById('medscope-apply-filter');
        const closeBtn = document.getElementById('medscope-close-filter');
        const minIF = document.getElementById('medscope-min-if');
        const maxIF = document.getElementById('medscope-max-if');
        const alwaysOn = document.getElementById('medscope-always-on');
        const quartileChecks = document.querySelectorAll('.medscope-quartile-grid input[type="checkbox"]');
        
        applyBtn.addEventListener('click', () => {
            filterSettings.minIF = parseFloat(minIF.value) || 0;
            filterSettings.maxIF = parseFloat(maxIF.value) || 200;
            filterSettings.enabled = true; // 应用筛选时自动启用
            filterSettings.quartiles = Array.from(quartileChecks)
                .filter(cb => cb.checked)
                .map(cb => cb.value);
            
            // 保存设置（如果勾选了"始终开启"）
            if (alwaysOn.checked) {
                chrome.storage.sync.set({ filterSettings });
            }
            
            // 立即应用筛选
            applyFilterToArticles();
            updateMatchCount();
            
            // 视觉反馈
            applyBtn.classList.add('success');
            applyBtn.textContent = '✓ 已应用';
            setTimeout(() => { 
                applyBtn.classList.remove('success');
                applyBtn.textContent = '应用筛选器'; 
            }, 1500);
        });
        
        closeBtn.addEventListener('click', () => {
            filterSettings.enabled = false;
            filterSettings.minIF = 0;
            filterSettings.maxIF = 200;
            filterSettings.quartiles = ['Q1', 'Q2', 'Q3', 'Q4'];
            
            minIF.value = 0;
            maxIF.value = 200;
            alwaysOn.checked = false;
            quartileChecks.forEach(cb => cb.checked = true);
            
            chrome.storage.sync.set({ filterSettings });
            applyFilterToArticles();
            updateMatchCount();
            
            // 视觉反馈
            closeBtn.classList.add('success');
            const originalText = closeBtn.textContent;
            closeBtn.textContent = '✓ 已关闭';
            setTimeout(() => { 
                closeBtn.classList.remove('success');
                closeBtn.textContent = originalText; 
            }, 1500);
        });
        
        // 排序按钮
        const applySortBtn = document.getElementById('medscope-apply-sort');
        const resetSortBtn = document.getElementById('medscope-reset-sort');
        const sortSelect = document.getElementById('medscope-sort-select');
        
        sortSelect.value = sortSettings.sortBy;
        
        applySortBtn.addEventListener('click', () => {
            sortSettings.sortBy = sortSelect.value;
            sortSettings.enabled = sortSelect.value !== 'default';
            chrome.storage.sync.set({ sortSettings });
            sortArticles();
            
            // 视觉反馈
            applySortBtn.classList.add('success');
            applySortBtn.textContent = '✓ 已应用';
            setTimeout(() => { 
                applySortBtn.classList.remove('success');
                applySortBtn.textContent = '应用排序'; 
            }, 1500);
        });
        
        resetSortBtn.addEventListener('click', () => {
            sortSettings.sortBy = 'default';
            sortSelect.value = 'default';
            location.reload();
        });
        
        // 加载之前保存的设置
        minIF.value = filterSettings.minIF;
        maxIF.value = filterSettings.maxIF;
        alwaysOn.checked = filterSettings.enabled;
        
        quartileChecks.forEach(cb => {
            cb.checked = filterSettings.quartiles.includes(cb.value);
        });
        
        // 实时更新
        minIF.addEventListener('input', () => setTimeout(updateMatchCount, 300));
        maxIF.addEventListener('input', () => setTimeout(updateMatchCount, 300));
        quartileChecks.forEach(cb => cb.addEventListener('change', updateMatchCount));
        
        updateMatchCount();
    }
    
    // 应用筛选到文章
    function applyFilterToArticles() {
        document.querySelectorAll('.docsum-content[data-medscope]').forEach(article => {
            const journalDataStr = article.dataset.medscope;
            if (journalDataStr) {
                try {
                    const journal = JSON.parse(journalDataStr);
                    const matches = matchesFilter(journal);
                    
                    // 找到完整的文章容器（article.full-docsum）
                    let articleWrapper = article.closest('article.full-docsum');
                    if (!articleWrapper) articleWrapper = article.closest('.docsum-wrap');
                    if (!articleWrapper) articleWrapper = article.closest('article');
                    if (!articleWrapper) articleWrapper = article.closest('.rprt');
                    
                    const targetElement = articleWrapper || article;
                    
                    console.log('筛选文章:', matches ? '显示' : '隐藏', targetElement.className);
                    
                    if (!matches) {
                        targetElement.style.display = 'none';
                        targetElement.style.visibility = 'hidden';
                        targetElement.style.height = '0';
                        targetElement.style.overflow = 'hidden';
                        targetElement.style.margin = '0';
                        targetElement.style.padding = '0';
                    } else {
                        targetElement.style.display = '';
                        targetElement.style.visibility = '';
                        targetElement.style.height = '';
                        targetElement.style.overflow = '';
                        targetElement.style.margin = '';
                        targetElement.style.padding = '';
                    }
                    targetElement.dataset.medscopeHidden = matches ? 'false' : 'true';
                    article.dataset.medscopeHidden = matches ? 'false' : 'true';
                } catch (e) {
                    console.error('应用筛选失败:', e);
                }
            }
        });
        
        updateMatchCount();
    }


    // 排序文章
    function sortArticles() {
        if (sortSettings.sortBy === 'default') {
            // 恢复默认顺序（刷新页面）
            location.reload();
            return;
        }
        
        const chunks = document.querySelectorAll('.search-results-chunk');
        if (chunks.length === 0) {
            console.log('MedScope: 未找到搜索结果块');
            return;
        }
        
        chunks.forEach(chunk => {
            // 找到文章的容器元素（可能是 .docsum-wrap 或其他）
            const articleWrappers = Array.from(chunk.children).filter(el => {
                return el.querySelector('.docsum-content');
            });
            
            if (articleWrappers.length === 0) return;
            
            // 为每个文章获取期刊数据并排序
            const articlesWithData = articleWrappers.map(wrapper => {
                const article = wrapper.querySelector('.docsum-content');
                const journalDataStr = article?.dataset.medscope;
                let sortValue = -Infinity;
                
                if (journalDataStr) {
                    try {
                        const journal = JSON.parse(journalDataStr);
                        const jif = parseFloat(journal['JIF 2024']);
                        const quartile = journal['JIF Quartile'];
                        
                        if (sortSettings.sortBy === 'if-desc') {
                            sortValue = isNaN(jif) ? -Infinity : jif;
                        } else if (sortSettings.sortBy === 'if-asc') {
                            sortValue = isNaN(jif) ? Infinity : -jif;
                        } else if (sortSettings.sortBy === 'quartile') {
                            const qMap = { 'Q1': 4, 'Q2': 3, 'Q3': 2, 'Q4': 1 };
                            sortValue = qMap[quartile] || 0;
                        }
                    } catch (e) {
                        // 保持原始位置
                    }
                }
                
                return { wrapper, sortValue };
            });
            
            // 排序
            articlesWithData.sort((a, b) => b.sortValue - a.sortValue);
            
            // 保存原始父节点
            const parent = chunk;
            
            // 重新排列 DOM - 使用 DocumentFragment 提高性能
            const fragment = document.createDocumentFragment();
            articlesWithData.forEach(({ wrapper }) => {
                fragment.appendChild(wrapper);
            });
            
            // 一次性添加所有元素
            parent.appendChild(fragment);
        });
        
        updateMatchCount();
    }

    // 更新匹配计数
    function updateMatchCount() {
        const matchCountEl = document.getElementById('medscope-match-count');
        if (!matchCountEl) return;
        
        // 统计所有包含期刊数据的文章
        const articles = document.querySelectorAll('.docsum-content[data-medscope]');
        let visible = 0;
        
        articles.forEach(article => {
            // 找到文章容器（与筛选逻辑保持一致）
            let wrapper = article.closest('article.full-docsum');
            if (!wrapper) wrapper = article.closest('.docsum-wrap');
            if (!wrapper) wrapper = article.closest('article');
            if (!wrapper) wrapper = article.closest('.rprt');
            
            // 检查是否可见（使用 dataset 属性）
            const targetElement = wrapper || article;
            const isHidden = targetElement.dataset.medscopeHidden === 'true';
            
            if (!isHidden) {
                visible++;
            }
        });
        
        matchCountEl.textContent = visible;
        console.log('MedScope: 更新计数 - 可见文章:', visible, '/ 总文章:', articles.length);
    }

    // 为文章添加期刊信息
    function addJournalInfo() {
        // 创建筛选面板
        createFilterPanel();
        
        // PubMed 搜索结果页面
        const articles = document.querySelectorAll('.docsum-content');
        
        articles.forEach(article => {
            // 避免重复添加
            if (article.querySelector('.medscope-badge')) return;
            
            // 查找期刊名称
            const journalElement = article.querySelector('.docsum-journal-citation');
            if (!journalElement) return;
            
            const journalText = journalElement.textContent.trim();
            // 期刊名通常在第一个点之前
            const journalName = journalText.split('.')[0].trim();
            
            const journal = getJournalInfo(journalName);
            if (!journal) return;
            
            // 检查是否符合筛选条件
            const matches = matchesFilter(journal);
            
            // 创建并添加标签
            const badge = createInfoBadge(journal);
            journalElement.parentElement.insertBefore(badge, journalElement);
            
            // 存储期刊数据到 article 元素上，用于排序
            article.dataset.medscope = JSON.stringify(journal);
            
            // 找到文章的完整容器
            // 根据调试信息，PubMed 结构：<article class="full-docsum"> 包含文章
            let articleWrapper = article.closest('article.full-docsum');
            
            // 尝试其他可能的结构
            if (!articleWrapper) {
                articleWrapper = article.closest('.docsum-wrap');
            }
            if (!articleWrapper) {
                articleWrapper = article.closest('article');
            }
            if (!articleWrapper) {
                articleWrapper = article.closest('.rprt');
            }
            
            // 如果不符合筛选条件，直接隐藏整个容器
            const targetElement = articleWrapper || article;
            if (!matches) {
                targetElement.style.display = 'none !important';
                targetElement.style.visibility = 'hidden';
                targetElement.style.height = '0';
                targetElement.style.overflow = 'hidden';
                targetElement.style.margin = '0';
                targetElement.style.padding = '0';
                targetElement.dataset.medscopeHidden = 'true';
                article.dataset.medscopeHidden = 'true';
            } else {
                targetElement.style.display = '';
                targetElement.style.visibility = '';
                targetElement.style.height = '';
                targetElement.style.overflow = '';
                targetElement.style.margin = '';
                targetElement.style.padding = '';
                targetElement.dataset.medscopeHidden = 'false';
                article.dataset.medscopeHidden = 'false';
            }
        });

        // PubMed 文章详情页面
        const detailJournal = document.querySelector('.journal-actions');
        if (detailJournal && !document.querySelector('.medscope-detail-badge')) {
            const journalLink = detailJournal.querySelector('a');
            if (journalLink) {
                const journalName = journalLink.textContent.trim();
                const journal = getJournalInfo(journalName);
                
                if (journal) {
                    const detailBadge = document.createElement('div');
                    detailBadge.className = 'medscope-detail-badge';
                    
                    const jif = journal['JIF 2024'];
                    const jif5 = journal['5-Year JIF'];
                    const quartile = journal['JIF Quartile'];
                    const rank = journal['JIF Rank'];
                    const publisher = journal['Publisher'];
                    
                    let html = '<div class="medscope-detail-title">📊 期刊指标</div>';
                    
                    if (jif) {
                        html += `<div class="medscope-detail-row">
                            <span class="label">影响因子 (2024):</span>
                            <span class="value">${jif}</span>
                        </div>`;
                    }
                    
                    if (jif5) {
                        html += `<div class="medscope-detail-row">
                            <span class="label">5年影响因子:</span>
                            <span class="value">${jif5}</span>
                        </div>`;
                    }
                    
                    if (quartile) {
                        html += `<div class="medscope-detail-row">
                            <span class="label">JCR 分区:</span>
                            <span class="value quartile-${quartile.toLowerCase()}">${quartile}</span>
                        </div>`;
                    }
                    
                    if (rank) {
                        html += `<div class="medscope-detail-row">
                            <span class="label">排名:</span>
                            <span class="value">${rank}</span>
                        </div>`;
                    }
                    
                    if (publisher) {
                        html += `<div class="medscope-detail-row">
                            <span class="label">出版社:</span>
                            <span class="value">${publisher}</span>
                        </div>`;
                    }
                    
                    detailBadge.innerHTML = html;
                    journalLink.parentElement.appendChild(detailBadge);
                }
            }
        }
    }

    // 监听页面变化（PubMed 是单页应用）
    function observePageChanges() {
        const observer = new MutationObserver((mutations) => {
            // 延迟执行，等待内容加载完成
            setTimeout(addJournalInfo, 500);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // 监听来自 popup 的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'updateFilter') {
            filterSettings = request.settings;
            // 重新应用筛选
            applyFilterToArticles();
            updateMatchCount();
            sendResponse({ success: true });
        }
    });

    // 初始化
    async function init() {
        console.log('MedScope: 初始化...');
        
        await loadFilterSettings();
        const loaded = await loadJournalData();
        
        if (loaded) {
            addJournalInfo();
            
            // 如果之前有排序设置，应用它
            if (sortSettings.sortBy !== 'default') {
                setTimeout(() => sortArticles(), 500);
            }
            
            observePageChanges();
            console.log('MedScope: 初始化完成');
        }
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

